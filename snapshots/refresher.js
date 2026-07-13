'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
const db    = require('../cbclient');
const store = require('./store');

const DISCOVERY_INTERVAL_MS = 60_000;
const CAS_POLL_INTERVAL_MS  = 10_000;
const DEBOUNCE_MS           = 3_000;
const HOT_WINDOW_DAYS       = 14;
const MAX_HOT_DOCS          = 16;
const BUILDS_PER_VERSION    = 2;
const MAX_PATCH_UPSERTS     = 500;

const WATCHED_BUCKETS = (process.env.SNAPSHOT_BUCKETS || 'server')
  .split(',').map(s => s.trim()).filter(Boolean);

let _worker        = null;
let _callbacks     = { onPatch: () => {}, onResync: () => {}, onBuildsChanged: () => {} };
let _reqId         = 0;
const _pending     = new Map();
const _debounce    = new Map();
const _hotSet      = new Map();
const _depCas      = new Map();
const _topBuild    = new Map();
let _discoveryTimer = null;
let _pollTimer      = null;

function _spawnWorker() {
  _worker = new Worker(path.join(__dirname, 'worker.js'), {
    resourceLimits: { maxOldGenerationSizeMb: 1536 },
  });

  _worker.on('message', (msg) => {
    if (msg.type !== 'result') return;
    _pending.delete(msg.id);

    if (msg.error) {
      console.error(`[snapshots] refresh failed for ${msg.docKey}: ${msg.error}`);
      return;
    }

    const meta = _hotSet.get(msg.docKey);
    const cas  = meta?.lastFetchedCas || null;
    const seq  = store.upsert(msg.docKey, { jobs: msg.jobs, cas });

    if (msg.patch) {
      if (msg.patch.upserts.length > MAX_PATCH_UPSERTS) {
        _callbacks.onResync(msg.docKey);
      } else {
        _callbacks.onPatch(msg.docKey, seq, msg.patch);
      }
    }
    console.log(`[snapshots] ${msg.docKey} → seq ${seq} (${msg.jobs.length} jobs${msg.patch ? `, ${msg.patch.upserts.length} changed` : ''})`);
  });

  _worker.on('error', (e) => {
    console.error('[snapshots] worker crashed, respawning:', e.message);
    _pending.clear();
    _spawnWorker();
  });
}

const MAX_CONCURRENT_REFRESH = 2;
let _activeRefreshes = 0;
const _refreshQueue = [];

function _enqueueRefresh(docKey) {
  if (_refreshQueue.includes(docKey)) return;
  _refreshQueue.push(docKey);
  _drainQueue();
}

function _drainQueue() {
  while (_activeRefreshes < MAX_CONCURRENT_REFRESH && _refreshQueue.length) {
    const docKey = _refreshQueue.shift();
    _activeRefreshes++;
    _refresh(docKey).finally(() => {
      _activeRefreshes--;
      _drainQueue();
    });
  }
}

const EXISTING_TTL_MS = 30_000;
const _existingCache = new Map();

async function _getExistingRaw(bucket) {
  const hit = _existingCache.get(bucket);
  if (hit && Date.now() - hit.fetchedAt < EXISTING_TTL_MS) return hit.buf;
  const r = await db.rawGet('greenboard', `existing_builds_${bucket}`);
  _existingCache.set(bucket, { buf: r ? r.buf : null, fetchedAt: Date.now() });
  return r ? r.buf : null;
}

async function _refresh(docKey) {
  const meta = _hotSet.get(docKey);
  if (!meta) return;

  try {
    const buildRes    = await db.rawGet('greenboard', docKey);
    if (!buildRes) {
      console.warn(`[snapshots] doc vanished: ${docKey}`);
      return;
    }
    const existingRaw = await _getExistingRaw(meta.bucket);

    meta.lastFetchedCas = buildRes.cas;

    const id = ++_reqId;
    _pending.set(id, docKey);
    _worker.postMessage({
      type: 'refresh',
      id,
      docKey,
      bucket: meta.bucket,
      build:  meta.build,
      buildRaw: buildRes.buf,
      existingRaw,
    });
  } catch (e) {
    console.error(`[snapshots] fetch failed for ${docKey}:`, e.message);
  }
}

function _scheduleRefresh(docKey) {
  clearTimeout(_debounce.get(docKey));
  _debounce.set(docKey, setTimeout(() => {
    _debounce.delete(docKey);
    _enqueueRefresh(docKey);
  }, DEBOUNCE_MS));
}

async function _pollOnce() {
  for (const [docKey] of _hotSet) {
    try {
      const r = await db.existsDoc('greenboard', docKey);
      if (!r.exists) continue;
      const snap = store.get(docKey);
      if (!snap || (r.cas && snap.cas && r.cas !== snap.cas)) {
        _scheduleRefresh(docKey);
      }
    } catch (_) {}
  }

  for (const bucket of WATCHED_BUCKETS) {
    const depKey = `existing_builds_${bucket}`;
    try {
      const r = await db.existsDoc('greenboard', depKey);
      if (!r.exists || !r.cas) continue;
      const prev = _depCas.get(depKey);
      if (prev && prev !== r.cas) {
        _existingCache.delete(bucket);
        for (const [docKey, meta] of _hotSet) {
          if (meta.bucket === bucket) _scheduleRefresh(docKey);
        }
      }
      _depCas.set(depKey, r.cas);
    } catch (_) {}
  }
}

async function _discoverOnce() {
  const cutoffNs = (Date.now() - HOT_WINDOW_DAYS * 86_400_000) * 1e6; // CAS ~ ns since epoch
  const next = new Map();

  for (const bucket of WATCHED_BUCKETS) {
    let rows;
    try {
      rows = await db.query(
        `SELECT \`build\`, META().cas AS mcas ` +
        `FROM \`greenboard\` ` +
        `WHERE \`type\` = '${bucket}' ` +
        `  AND META().id NOT LIKE 'existing_%' ` +
        `  AND META().cas > ${cutoffNs}`
      );
    } catch (e) {
      console.error(`[snapshots] discovery query failed for ${bucket}:`, e.message);
      continue;
    }

    const byVersion = new Map();
    for (const r of rows) {
      if (!r.build || !r.build.includes('-')) continue;
      const [version, bno] = r.build.split('-');
      if (!bno || bno.length > 4) continue;
      const bnum = parseInt(bno, 10);
      if (Number.isNaN(bnum)) continue;
      if (!byVersion.has(version)) byVersion.set(version, []);
      byVersion.get(version).push({ build: r.build, bnum, mcas: r.mcas });
    }

    const ranked = [...byVersion.entries()]
      .map(([version, builds]) => ({
        version,
        recency: Math.max(...builds.map(b => Number(b.mcas) || 0)),
        builds:  builds.sort((a, b) => b.bnum - a.bnum).slice(0, BUILDS_PER_VERSION),
      }))
      .sort((a, b) => b.recency - a.recency);

    for (const v of ranked) {
      for (const b of v.builds) {
        if (next.size >= MAX_HOT_DOCS) break;
        next.set(`${b.build}_${bucket}`, { bucket, build: b.build });
      }

      const topKey  = `${bucket}:${v.version}`;
      const newTop  = v.builds[0]?.bnum;
      const prevTop = _topBuild.get(topKey);
      if (newTop && prevTop && newTop !== prevTop) {
        console.log(`[snapshots] new build detected: ${v.version}-${newTop} (${bucket})`);
        _callbacks.onBuildsChanged(bucket);
      }
      if (newTop) _topBuild.set(topKey, newTop);
    }
  }

  for (const [docKey, meta] of next) {
    if (!_hotSet.has(docKey)) {
      _hotSet.set(docKey, meta);
      console.log(`[snapshots] promoted ${docKey}`);
      _enqueueRefresh(docKey);
    }
  }
  for (const docKey of [..._hotSet.keys()]) {
    if (!next.has(docKey)) {
      _hotSet.delete(docKey);
      store.evict(docKey);
      _worker.postMessage({ type: 'evict', docKey });
      console.log(`[snapshots] evicted ${docKey}`);
    }
  }
}

function start(callbacks) {
  _callbacks = { ..._callbacks, ...callbacks };
  _spawnWorker();

  _discoverOnce().catch(e => console.error('[snapshots] initial discovery failed:', e.message));
  _discoveryTimer = setInterval(() => _discoverOnce().catch(() => {}), DISCOVERY_INTERVAL_MS);
  _pollTimer      = setInterval(() => _pollOnce().catch(() => {}), CAS_POLL_INTERVAL_MS);
  _discoveryTimer.unref();
  _pollTimer.unref();

  console.log(`[snapshots] refresher started — buckets: ${WATCHED_BUCKETS.join(', ')}`);
}

function stats() {
  return {
    hotSet:          [..._hotSet.keys()],
    inFlight:        _pending.size,
    refreshQueue:    _refreshQueue.length,
    activeRefreshes: _activeRefreshes,
    watchedBuckets:  WATCHED_BUCKETS,
  };
}

module.exports = { start, stats };
