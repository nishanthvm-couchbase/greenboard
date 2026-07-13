'use strict';

const { Cluster, LookupInSpec } = require('couchbase');
const _           = require('lodash');
const crypto      = require('crypto');
const config      = require('./config');
const { parseRaw, processBuildDoc, canonComponent } = require('./snapshots/process');

class RawTranscoder {
  encode(value) { return [Buffer.isBuffer(value) ? value : Buffer.from(value), 0x02 << 24]; }
  decode(bytes) { return bytes; }
}
const _rawTranscoder = new RawTranscoder();

let _cluster = null;
const _colCache = {};

async function cluster() {
  if (_cluster) return _cluster;
  _cluster = await Cluster.connect(`couchbase://${config.Cluster}`, {
    username: config.RBACUser,
    password: config.RBACPassword,
    timeouts: { kvTimeout: 75000, queryTimeout: 75000 },
  });
  return _cluster;
}

async function col(bucket) {
  if (_colCache[bucket]) return _colCache[bucket];
  const c = await cluster();
  _colCache[bucket] = c.bucket(bucket).defaultCollection();
  return _colCache[bucket];
}

async function get(bucket, key) {
  const c = await col(bucket);
  try {
    const r = await c.get(key);
    return r.content;
  } catch (e) {
    if (e.name === 'DocumentNotFoundError' || e.code === 13 || (e.cause && e.cause.code === 101)) return null;
    throw e;
  }
}

async function getMany(bucket, keys) {
  const results = await Promise.all(
    keys.map(k =>
      get(bucket, k)
        .then(v  => [k, v])
        .catch(e => { console.warn(`getMany: skipping ${k} —`, e.message); return [k, null]; })
    )
  );
  return Object.fromEntries(results);
}

async function upsert(bucket, key, doc) {
  const c = await col(bucket);
  return c.upsert(key, doc);
}

function parseBuffer(raw) {
  if (!Buffer.isBuffer(raw)) return raw;
  let s = raw.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  return JSON.parse(s);
}

async function query(sql) {
  const c = await cluster();
  const r = await c.query(sql);
  const rows = [];
  for await (const row of r.rows) rows.push(row);
  return rows;
}

async function rawGet(bucket, key) {
  const c = await col(bucket);
  try {
    const r = await c.get(key, { transcoder: _rawTranscoder });
    return { buf: r.content, cas: String(r.cas) };
  } catch (e) {
    if (e.name === 'DocumentNotFoundError' || e.code === 13 || (e.cause && e.cause.code === 101)) return null;
    throw e;
  }
}

async function existsDoc(bucket, key) {
  const c = await col(bucket);
  const r = await c.exists(key);
  return { exists: r.exists, cas: r.cas ? String(r.cas) : null };
}

const _cache = {};
function fromCache(key) { return _cache[key]; }
function toCache(key, val) { _cache[key] = val; }

async function getVersions(bucket) {
  const cacheKey = `versions_${bucket}`;
  async function fetch() {
    const rows = await query(
      `SELECT DISTINCT SPLIT(\`build\`,'-')[0] AS version ` +
      `FROM \`greenboard\` ` +
      `WHERE REGEXP_LIKE(\`build\`, '\\\\d+.\\\\d+.\\\\d+-.*') ` +
      `AND SPLIT(\`build\`,'-')[0] IS NOT NULL ` +
      `AND \`type\` = '${bucket}' ` +
      `ORDER BY version DESC`
    );
    const versions = rows.map(r => r.version).filter(Boolean);
    toCache(cacheKey, versions);
    return versions;
  }

  const cached = fromCache(cacheKey);
  if (cached && cached.length) {
    fetch();
    return cached;
  }
  return fetch();
}

async function getBuildsForVersion(bucket, version, testsFilter = 0, buildsFilter = 10, filters) {
  const rows = await query(
    `SELECT DISTINCT \`build\`, ` +
    `  TONUMBER(SPLIT(\`build\`,'-')[1]) AS build_num ` +
    `FROM \`greenboard\` ` +
    `WHERE \`type\` = '${bucket}' ` +
    `  AND SPLIT(\`build\`,'-')[0] = '${version}' ` +
    `  AND LENGTH(SPLIT(\`build\`,'-')[1]) <= 4 ` +
    `ORDER BY build_num DESC ` +
    `LIMIT ${buildsFilter}`
  );

  return rows
    .filter(r => r.build)
    .map(r => ({ build: r.build, totalCount: 0, failCount: 0, Passed: 0, Failed: 0 }));
}

const _jobsCache = {};

async function getJobsForBuild(bucket, build) {
  const cacheKey = `${build}_${bucket}`;
  if (_jobsCache[cacheKey]) {
    _fetchJobs(bucket, build).then(j => { _jobsCache[cacheKey] = j; }).catch(() => {});
    return _jobsCache[cacheKey];
  }
  const jobs = await _fetchJobs(bucket, build);
  _jobsCache[cacheKey] = jobs;
  return jobs;
}
async function _fetchJobs(bucket, build) {
  const buildKey    = `${build}_${bucket}`;
  const existingKey = `existing_builds_${bucket}`;

  const docs = await getMany('greenboard', [buildKey, existingKey]);
  let buildDoc, existingDoc;

  if (!docs[buildKey]) throw new Error(`Build document not found: ${buildKey}`);
  try { buildDoc    = parseRaw(docs[buildKey]);    } catch (e) { throw new Error('Failed to parse build doc: ' + e.message); }
  try { existingDoc = parseRaw(docs[existingKey]); } catch (_) { existingDoc = null; }

  return processBuildDoc(buildDoc, existingDoc, bucket, build);
}

async function saveClaim(bucket, name, buildId, type, claim, os, comp, build) {
  const key  = `${build}_${bucket}`;
  const doc  = parseBuffer(await get('greenboard', key));
  if (!doc) throw new Error(`Build doc not found: ${key}`);

  const runs = doc.os?.[os]?.[comp]?.[name];
  if (!runs) throw new Error(`Job not found: ${os}/${comp}/${name}`);

  runs.forEach(r => {
    if (String(r.build_id) === String(buildId)) {
      if (type === 'bugs')   r.bugs   = Array.isArray(claim) ? claim : [claim];
      if (type === 'triage') r.triage = claim;
    }
  });
  await upsert('greenboard', key, doc);

  try {
    const thKey   = `${name}_${build.split('-')[0]}_${bucket}`;
    const buildNo = parseInt(build.split('-')[1]) || 0;
    let hist = await get('triage_history', thKey) || { build: 0, bugs: [], triage: '' };
    if (buildNo >= hist.build) {
      hist.build = buildNo;
      if (type === 'bugs')   hist.bugs   = Array.isArray(claim) ? claim : [claim];
      if (type === 'triage') hist.triage = claim;
      await upsert('triage_history', thKey, hist);
    }
  } catch (_) {}
}

async function setBestRun(bucket, name, buildId, os, comp, build) {
  const key = `${build}_${bucket}`;
  let doc   = parseBuffer(await get('greenboard', key));
  if (!doc) return;

  const runs = doc.os?.[os]?.[comp]?.[name];
  if (!runs) return;

  runs.forEach(r => { r.olderBuild = String(r.build_id) !== String(buildId); });
  await upsert('greenboard', key, doc);
}

async function getTrend(docId) {
  return get('trend', docId);
}

const _jobTrendCache = new Map();
const JOBTREND_TTL_MS = 300_000;
async function getJobTrend(bucket, version, os, component, name, n = 18) {
  const ck = `${bucket}|${version}|${os}|${component}|${name}`;
  const c = _jobTrendCache.get(ck);
  if (c && Date.now() - c.ts < JOBTREND_TTL_MS) return c.data;

  let cands = [];
  try { cands = (await getBuildsForVersion(bucket, version, 0, n)).map(b => b.build); } catch (_) {}
  const path = `os.\`${os}\`.\`${component}\`.\`${name}\``;
  const coll = await _bbColl('greenboard');
  const perBuild = await Promise.all(cands.map(async b => {
    try {
      const r = await coll.lookupIn(`${b}_${bucket}`, [LookupInSpec.get(path)]);
      const e = r.content[0];
      return { b, runs: (e && !e.error) ? e.value : null };
    } catch (_) { return { b, runs: null }; }
  }));
  const trend = [];
  for (const { b, runs } of perBuild) {
    if (!Array.isArray(runs)) continue;
    runs.forEach((run, i) => {
      if (run.deleted) return;
      trend.push({
        version:    b,
        result:     run.result === 'SUCCESS' ? 'pass' : 'fail',
        run_number: i + 1,
        url:        run.url ? `${run.url}${run.build_id || ''}` : null,
      });
    });
  }
  const pass_count = trend.filter(t => t.result === 'pass').length;
  const fail_count = trend.length - pass_count;
  const data = { job_name: name, component, os, base_version: version, trend,
                 pass_count, fail_count, total_runs: trend.length };
  _jobTrendCache.set(ck, { data, ts: Date.now() });
  return data;
}

async function getReport(version, component) {
  return get('reports', `${version}_${component}`);
}

// Key MUST match logtry/analysis_store.py:key_analysis — analysis_<md5("{name}|{build}")>
function analysisKey(name, build) {
  const raw = `${name}|${build}`;
  return 'analysis_' + crypto.createHash('md5').update(raw).digest('hex');
}

async function getAnalysis(name, build) {
  return get('test_analysis', analysisKey(name, build));
}

async function getBuildsForCompare(bucket, version) {
  return getBuildsForVersion(bucket, version, 0, 100, null);
}

async function getBuildSummary(buildId) {
  const [build, bucket] = buildId.split('_');
  let doc = parseBuffer(await get('greenboard', buildId));
  if (!doc) return null;

  const osSummary   = {};
  const compSummary = {};

  _.forEach(doc.os, (components, os) => {
    _.forEach(components, (jobs, component) => {
      _.forEach(jobs, (runs) => {
        if (!Array.isArray(runs)) return;
        runs.forEach(run => {
          if (run.olderBuild || run.deleted) return;
          const tc = run.totalCount || 0, fc = run.failCount || 0;
          osSummary[os]         = osSummary[os]         || { totalCount: 0, failCount: 0 };
          compSummary[component] = compSummary[component] || { totalCount: 0, failCount: 0 };
          osSummary[os].totalCount         += tc;
          osSummary[os].failCount          += fc;
          compSummary[component].totalCount += tc;
          compSummary[component].failCount  += fc;
        });
      });
    });
  });

  return { build, bucket, osSummary, compSummary };
}

function _summarizeBuildRaw(buildDoc, existingDoc, bucket, version) {
  let total = 0, fail = 0, pending = 0, lastTs = 0;
  const compTotal = {}, compFail = {};
  const ran = {};

  const os = buildDoc?.os || {};
  for (const o in os) {
    for (const c in os[o]) {
      const set = ran[`${o}__${c}`] || (ran[`${o}__${c}`] = new Set());
      const jobsByName = os[o][c];
      for (const jn in jobsByName) {
        const runs = jobsByName[jn];
        if (!Array.isArray(runs)) continue;
        set.add(jn);
        for (const r of runs) set.add(r.displayName || jn);
        const cur = runs.find(r => !r.olderBuild && !r.deleted);
        if (cur) {
          const tc = cur.totalCount || 0, fc = cur.failCount || 0;
          const cc = canonComponent(c);
          total += tc; fail += fc;
          compTotal[cc] = (compTotal[cc] || 0) + tc;
          compFail[cc]  = (compFail[cc]  || 0) + fc;
          if (cur.timestamp && cur.timestamp > lastTs) lastTs = cur.timestamp;
        }
      }
    }
  }

  const reg = existingDoc?.[bucket] || {};
  for (const o in reg) for (const c in reg[o]) for (const jn in reg[o][c]) {
    const meta = reg[o][c][jn];
    const set = ran[`${o}__${c}`];
    const hasRun = set ? set.has(jn) : false;
    const jobIn = meta.jobs_in && meta.jobs_in.includes(version);
    const notDel = !meta.deleted || !meta.deleted.includes(version);
    if (!hasRun && jobIn && notDel && bucket !== 'operator') pending += meta.totalCount || 0;
  }

  return {
    total, fail, pending,
    components:    Object.keys(compTotal).length,
    redComponents: Object.keys(compFail).filter(c => compFail[c] > 0).length,
    passPct: total > 0          ? Math.round(((total - fail) / total) * 100) : 0,
    runPct:  total + pending > 0 ? Math.round((total / (total + pending)) * 100) : 0,
    lastTimestamp: lastTs,
  };
}

const _readinessCache = {};
const READINESS_TTL_MS = 300_000;

async function getReadiness(bucket, maxVersions = 4) {
  const key    = `${bucket}_${maxVersions}`;
  const cached  = _readinessCache[key];
  if (cached) {
    if (Date.now() - cached.ts > READINESS_TTL_MS) {
      _computeReadiness(bucket, maxVersions)
        .then(data => { _readinessCache[key] = { data, ts: Date.now() }; })
        .catch(() => {});
    }
    return cached.data;
  }
  const data = await _computeReadiness(bucket, maxVersions);
  _readinessCache[key] = { data, ts: Date.now() };
  return data;
}

async function _activeVersions(bucket, limit) {
  try {
    const rows = await query(
      `SELECT SPLIT(\`build\`,'-')[0] AS v, MAX(META().cas) AS r ` +
      `FROM \`greenboard\` ` +
      `WHERE \`type\` = '${bucket}' AND SPLIT(\`build\`,'-')[0] IS NOT NULL ` +
      `GROUP BY SPLIT(\`build\`,'-')[0] ` +
      `ORDER BY r DESC LIMIT ${limit}`
    );
    const vs = rows.map(x => x.v).filter(Boolean);
    if (vs.length) return vs;
  } catch (_) {}
  return (await getVersions(bucket)).slice(0, limit);
}

async function _computeReadiness(bucket, maxVersions = 4) {
  const versions = await _activeVersions(bucket, maxVersions + 3);
  const out = [];
  const MIN_FULL   = config.readinessMinTests || 2000;
  const meaningful = (s) => (s.total + s.pending) > 0;

  let existingDoc = null;
  try { existingDoc = await get('greenboard', `existing_builds_${bucket}`); } catch (_) {}

  for (const version of versions) {
    if (out.length >= maxVersions) break;

    let builds;
    try { builds = await getBuildsForVersion(bucket, version, 0, 12); } catch (_) { continue; }
    if (!builds || !builds.length) continue;

    let cur = null, curBuild = null, prev = null, prevBuild = null;
    let fb = null, fbBuild = null;
    for (const b of builds) {
      let tc = 0;
      try { tc = await _bbTotal('greenboard', `${b.build}_${bucket}`); } catch (_) {}
      const full = tc >= MIN_FULL;
      if (!full && (cur || fb)) continue;
      let bd;
      try { bd = await get('greenboard', `${b.build}_${bucket}`); } catch (_) { continue; }
      if (!bd) continue;
      const s = _summarizeBuildRaw(bd, existingDoc, bucket, version);
      if (!meaningful(s)) continue;
      if (!fb) { fb = s; fbBuild = b.build; }
      if (full) {
        if (!cur)  { cur = s;  curBuild = b.build; }
        else       { prev = s; prevBuild = b.build; break; }
      }
    }
    if (!cur) { cur = fb; curBuild = fbBuild; }
    if (!cur) continue;

    out.push({
      version,
      codename:    (config.versionCodenames || {})[version] || null,
      latestBuild: curBuild, prevBuild,
      ...cur,
      passDelta: prev ? cur.passPct - prev.passPct : null,
      runDelta:  prev ? cur.runPct  - prev.runPct  : null,
    });
  }
  return out;
}

function _fleetBucket(state) {
  const s = (state || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (/fail|unreach|not_reach|missing|ssh_failed|down|corrupt|not_found|no_available|not available|unusable|issue|investigat|redboard/.test(s)) return 'broken';
  if (/disabled|deleted|to_remove|retired|ip_changed|ipchange/.test(s)) return 'disabled';
  if (s === 'available' || s === 'avaialble' || /^avail/.test(s)) return 'available';
  if (/book|with|reserved|\bfor\b|_for|for_/.test(s)) return 'inuse';
  return 'other';
}

let _fleetCluster = null, _fleetColCache = null;
async function fleetCluster() {
  if (_fleetCluster) return _fleetCluster;
  _fleetCluster = await Cluster.connect(`couchbase://${config.fleetHost}`, {
    username: config.fleetUser, password: config.fleetPass,
    timeouts: { kvTimeout: 30000, queryTimeout: 60000 },
  });
  return _fleetCluster;
}
async function _fleetCol() {
  if (_fleetColCache) return _fleetColCache;
  const c = await fleetCluster();
  _fleetColCache = c.bucket(config.fleetBucket).defaultCollection();
  return _fleetColCache;
}

async function getFleet() {
  const c = await fleetCluster();
  const r = await c.query(
    'SELECT META().id AS ip, p.os, p.poolId, p.`state`, p.vm_name ' +
    'FROM `' + config.fleetBucket + '` p'
  );
  const rows = [];
  for await (const row of r.rows) rows.push(row);
  return rows.map(x => ({
    ip:      x.ip,
    os:      x.os || null,
    vm_name: x.vm_name || null,
    state:   x.state || null,
    pools:   Array.isArray(x.poolId) ? x.poolId : (x.poolId ? [x.poolId] : []),
    bucket:  _fleetBucket(x.state),
  }));
}

async function getFleetNode(ip) {
  const col = await _fleetCol();
  try {
    const r = await col.get(ip);
    return r.content;
  } catch (e) {
    if (e.name === 'DocumentNotFoundError' || e.code === 13 || (e.cause && e.cause.code === 101)) return null;
    throw e;
  }
}

const _compReportCache = {};
const COMPONENT_REPORT_TTL = 120_000;

let _crCol = null, _crTried = false;
async function _componentReportsCol() {
  if (_crCol || _crTried) return _crCol;
  _crTried = true;
  try {
    const c = await cluster();
    for (const stmt of [
      "CREATE COLLECTION `test_analysis`.`_default`.`component_reports` IF NOT EXISTS",
      "CREATE PRIMARY INDEX IF NOT EXISTS ON `test_analysis`.`_default`.`component_reports`",
    ]) { try { await c.query(stmt); } catch (_) {} }
    _crCol = c.bucket('test_analysis').scope('_default').collection('component_reports');
  } catch (e) { _crCol = null; }
  return _crCol;
}

async function _computeComponentReport(build, component, bucket) {
  const buildDoc = await get('greenboard', `${build}_${bucket}`);
  const names = new Set();
  let jobsTotal = 0, jobsFailing = 0;
  const os = buildDoc?.os || {};
  for (const o in os) {
    for (const rawComp in os[o]) {
      if (canonComponent(rawComp) !== component) continue;
      const runsByName = os[o][rawComp];
      if (!runsByName) continue;
      for (const jn in runsByName) {
        const runs = runsByName[jn];
        if (!Array.isArray(runs)) continue;
        const cur = runs.find(r => !r.olderBuild && !r.deleted);
        if (!cur) continue;
        names.add(jn); jobsTotal++;
        if ((cur.failCount || 0) > 0 || (cur.result && cur.result !== 'SUCCESS' && cur.result !== 'PENDING')) jobsFailing++;
      }
    }
  }

  let docs = [];
  if (names.size) {
    const sql =
      "SELECT a.* FROM `test_analysis` a " +
      "WHERE a.`type` = 'test_build_analysis' " +
      "AND a.`build` = " + JSON.stringify(build) + " " +
      "AND a.`name` IN " + JSON.stringify([...names].slice(0, 800));
    docs = await query(sql).catch(() => []);
  }

  const verdicts = {}, categories = {}, themeCount = {};
  let failedTests = 0, totalTests = 0;
  const hot = [];
  for (const d of docs) {
    const v = d.verdict || 'unknown';
    verdicts[v] = (verdicts[v] || 0) + 1;
    const st = d.stats || {};
    failedTests += st.failed || 0;
    totalTests  += st.total_tests || 0;
    const bc = st.by_category || {};
    for (const c in bc) categories[c] = (categories[c] || 0) + (bc[c] || 0);
    for (const t of (d.themes || [])) {
      const k = (t.title || '').trim();
      if (k) themeCount[k] = (themeCount[k] || 0) + 1;
    }
    hot.push({
      name: d.name, display_name: d.display_name || d.name,
      verdict: v, headline: d.headline || '',
      failed: st.failed || 0,
      is_new: (d.failures || []).filter(f => f.is_new).length,
      by_category: bc,
    });
  }
  hot.sort((a, b) => b.failed - a.failed);
  const themes = Object.entries(themeCount)
    .map(([title, jobs]) => ({ title, jobs }))
    .sort((a, b) => b.jobs - a.jobs).slice(0, 8);

  return {
    type: 'component_report',
    component, build, bucket,
    jobs_total: jobsTotal, jobs_failing: jobsFailing, jobs_analyzed: docs.length,
    verdicts, categories, failed_tests: failedTests, total_tests: totalTests,
    hotspots: hot.slice(0, 60), themes,
    computed_at: new Date().toISOString(),
  };
}

async function getComponentReport(build, component, bucket = 'server') {
  const key = `${build}|${component}`;
  const c = _compReportCache[key];
  if (c && Date.now() - c.ts < COMPONENT_REPORT_TTL) return c.data;
  const data = await _computeComponentReport(build, component, bucket);
  _compReportCache[key] = { data, ts: Date.now() };
  try {
    const col = await _componentReportsCol();
    if (col) await col.upsert('creport_' + crypto.createHash('md5').update(key).digest('hex'), data);
  } catch (_) {}
  return data;
}

let _bbCluster = null;
const _bbColCache = {};
async function _bbColl(bucket) {
  if (!_bbCluster) {
    _bbCluster = await Cluster.connect(`couchbase://${config.Cluster}`, {
      username: config.RBACUser, password: config.RBACPassword,
      timeouts: { kvTimeout: 75000, queryTimeout: 75000 },
    });
  }
  if (!_bbColCache[bucket]) _bbColCache[bucket] = _bbCluster.bucket(bucket).defaultCollection();
  return _bbColCache[bucket];
}
async function _bbGet(bucket, key) {
  const coll = await _bbColl(bucket);
  try { const r = await coll.get(key); return r.content; }
  catch (e) {
    if (e.name === 'DocumentNotFoundError' || e.code === 13 || (e.cause && e.cause.code === 101)) return null;
    throw e;
  }
}
async function _bbTotal(bucket, key) {
  const coll = await _bbColl(bucket);
  try {
    const r = await coll.lookupIn(key, [LookupInSpec.get('totalCount')]);
    const e = r.content[0];
    return (e && !e.error && e.value) || 0;
  } catch (_) { return 0; }
}

async function _computeBuildBars(bucket, version, want, minTests) {
  const pool = Math.min(Math.max(want * 2, 10), 14);
  let existingDoc = null;
  try { existingDoc = await _bbGet('greenboard', `existing_builds_${bucket}`); } catch (_) {}
  let builds = [];
  try { builds = await getBuildsForVersion(bucket, version, 0, pool); } catch (_) {}

  const out = [];
  for (const b of builds) {
    let bd = null;
    try { bd = await _bbGet('greenboard', `${b.build}_${bucket}`); } catch (_) {}
    if (!bd) continue;
    const s = _summarizeBuildRaw(bd, existingDoc, bucket, version);
    if (s.total < minTests) continue;
    out.push({ build: b.build, passed: s.total - s.fail, failed: s.fail, total: s.total, pending: s.pending });
  }
  out.sort((a, b) => (parseInt(a.build.split('-')[1], 10) || 0) - (parseInt(b.build.split('-')[1], 10) || 0));
  return out.slice(-want);
}

const _bbQueue = [];
let   _bbBusy  = false;
async function _bbDrain() {
  if (_bbBusy) return;
  _bbBusy = true;
  try {
    while (_bbQueue.length) {
      const j = _bbQueue.shift();
      try { const data = await j.run(); j.store(data); }
      catch (_) {}
    }
  } finally { _bbBusy = false; }
}
function _bbEnqueue(job) {
  if (!_bbQueue.some(q => q.key === job.key)) _bbQueue.push(job);
  _bbDrain();
}

const _bbSnap    = new Map();
const _bbTracked = new Set();
const BB_REFRESH_MS = 600_000;
const _bbKey = (bucket, version, n, minTests) => `${bucket}|${version}|${n}|${minTests}`;
const _bbJob = (key, bucket, version, n, minTests) => ({
  key,
  run:   () => _computeBuildBars(bucket, version, n, minTests),
  store: (data) => _bbSnap.set(key, { data, ts: Date.now() }),
});

function getBuildBars(bucket, version, n = 5, minTests = 2000) {
  const key = _bbKey(bucket, version, n, minTests);
  const snap = _bbSnap.get(key);
  if (!_bbTracked.has(key)) {
    _bbTracked.add(key);
    _bbEnqueue(_bbJob(key, bucket, version, n, minTests));
  } else if (snap && Date.now() - snap.ts > BB_REFRESH_MS) {
    _bbEnqueue(_bbJob(key, bucket, version, n, minTests));
  }
  return { bars: snap ? snap.data : [], ready: !!snap };
}

function startBuildBarsSnapshot(prewarm) {
  const t = setInterval(() => {
    for (const key of _bbTracked) {
      const [bucket, version, n, minTests] = key.split('|');
      _bbEnqueue(_bbJob(key, bucket, version, +n, +minTests));
    }
  }, BB_REFRESH_MS);
  if (t.unref) t.unref();
  if (prewarm) getBuildBars(prewarm.bucket, prewarm.version, prewarm.n, prewarm.minTests);
}

const TERMINAL_FAIL = new Set(['FAILURE', 'ABORTED', 'INST_FAIL']);
function _stabClassifyRun(run, threshold) {
  const result = run.result || '';
  if (!result) return 'skip';
  if (result === 'SUCCESS') return 'good';
  if (TERMINAL_FAIL.has(result)) return 'bad';
  if (result === 'UNSTABLE') {
    const total = run.totalCount || 0, fail = run.failCount || 0;
    if (total === 0) return 'bad';
    return (total - fail) / total >= threshold ? 'good' : 'bad';
  }
  return 'bad';
}

async function _computeStability(bucket, version, k, threshold, fullPct) {
  const SCAN = Math.max(60, k * 4);
  let cands = [];
  try { cands = (await getBuildsForVersion(bucket, version, 0, SCAN)).map(b => b.build); } catch (_) {}
  const totals = [];
  let maxTc = 0;
  for (const b of cands) {
    const tc = await _bbTotal('greenboard', `${b}_${bucket}`);
    totals.push({ build: b, tc });
    maxTc = Math.max(maxTc, tc);
    if (maxTc > 0 && totals.filter(x => x.tc >= fullPct * maxTc).length >= k) break;
  }
  const cutoff = fullPct * maxTc;
  const window = totals.filter(x => maxTc > 0 && x.tc >= cutoff).slice(0, k).map(x => x.build);
  if (!window.length) return { badKeys: [], window: [], badCount: 0, goodCount: 0 };

  const hist = {};
  for (const b of window) {
    let doc = null;
    try { doc = await _bbGet('greenboard', `${b}_${bucket}`); } catch (_) {}
    if (!doc || !doc.os) continue;
    for (const os in doc.os) {
      for (const comp in doc.os[os]) {
        const jobMap = doc.os[os][comp];
        const cc = canonComponent(comp);
        for (const name in jobMap) {
          const runs = jobMap[name];
          if (!Array.isArray(runs) || !runs.length) continue;
          const key = `${os}|${cc}|${name}`;
          const h = hist[key] || (hist[key] = { os, component: cc, name, good: 0, bad: 0 });
          let verdict = 'skip';
          for (const r of runs) {
            const c = _stabClassifyRun(r, threshold);
            if (c === 'good') { verdict = 'good'; break; }
            if (c === 'bad') verdict = 'bad';
          }
          if (verdict === 'good') h.good++; else if (verdict === 'bad') h.bad++;
        }
      }
    }
  }
  const badKeys = [];
  let goodCount = 0;
  for (const key in hist) {
    const h = hist[key];
    if (h.good === 0 && h.bad >= 1) badKeys.push({ os: h.os, component: h.component, name: h.name });
    else goodCount++;
  }
  return { badKeys, window, badCount: badKeys.length, goodCount };
}

const _stabSnap    = new Map();
const _stabTracked = new Set();
const STAB_REFRESH_MS = config.stabilityRefreshMs || 600_000;
const _stabKey = (bucket, version, k, threshold, fullPct) => `stab|${bucket}|${version}|${k}|${threshold}|${fullPct}`;
const _stabJob = (key, bucket, version, k, threshold, fullPct) => ({
  key,
  run:   () => _computeStability(bucket, version, k, threshold, fullPct),
  store: (data) => _stabSnap.set(key, { data, ts: Date.now() }),
});

function getStability(bucket, version,
                      k = config.stabilityK, threshold = config.stabilityThreshold, fullPct = config.stabilityFullPct) {
  const key = _stabKey(bucket, version, k, threshold, fullPct);
  const snap = _stabSnap.get(key);
  if (!_stabTracked.has(key)) {
    _stabTracked.add(key);
    _bbEnqueue(_stabJob(key, bucket, version, k, threshold, fullPct));
  } else if (snap && Date.now() - snap.ts > STAB_REFRESH_MS) {
    _bbEnqueue(_stabJob(key, bucket, version, k, threshold, fullPct));
  }
  return snap
    ? { ...snap.data, ready: true }
    : { badKeys: [], window: [], badCount: 0, goodCount: 0, ready: false };
}

function startStabilitySnapshot(prewarm) {
  const t = setInterval(() => {
    for (const key of _stabTracked) {
      const [, bucket, version, k, threshold, fullPct] = key.split('|');
      _bbEnqueue(_stabJob(key, bucket, version, +k, +threshold, +fullPct));
    }
  }, STAB_REFRESH_MS);
  if (t.unref) t.unref();
  if (prewarm) getStability(prewarm.bucket, prewarm.version);
}

const PREWARM_VERSIONS     = config.prewarmVersions     || 3;
const PREWARM_BUILDS_PER_V = config.prewarmBuildsPerVer || 3;
const PREWARM_REFRESH_MS   = config.prewarmRefreshMs    || 600_000;
const PREWARM_MIN_TESTS    = config.prewarmMinTests     || 2000;

async function _warmJobs(bucket, build) {
  const cacheKey = `${build}_${bucket}`;
  const bd = await _bbGet('greenboard', cacheKey);
  if (!bd) return false;
  let ed = null;
  try { ed = await _bbGet('greenboard', `existing_builds_${bucket}`); } catch (_) {}
  _jobsCache[cacheKey] = processBuildDoc(bd, ed, bucket, build);
  return true;
}

async function _prewarmSweep(bucket) {
  // Rank by recent activity, not numeric version sort — numeric sort skips
  // actively-tested older lines (e.g. 7.6.12) in favor of unused newer ones.
  let versions = [];
  try { versions = await _activeVersions(bucket, PREWARM_VERSIONS); } catch (_) {}
  if (!versions.length) { try { versions = (await getVersions(bucket)).slice(0, PREWARM_VERSIONS); } catch (_) { return; } }
  const targets = [];
  for (const v of versions) {
    try { getDefaultBuild(bucket, v); } catch (_) {}
    let cands = [];
    try { cands = (await getBuildsForVersion(bucket, v, 0, 20)).map(b => b.build); } catch (_) {}
    let picked = 0;
    for (const b of cands) {
      if (picked >= PREWARM_BUILDS_PER_V) break;
      if (await _bbTotal('greenboard', `${b}_${bucket}`) >= PREWARM_MIN_TESTS) {
        targets.push(b);
        picked++;
      }
    }
  }
  for (const b of targets) {
    _bbEnqueue({
      key:   `warmjobs|${bucket}|${b}`,
      run:   () => _warmJobs(bucket, b),
      store: (ok) => { if (ok) console.log(`[prewarm] jobs cached ${b}_${bucket}`); },
    });
  }
}

function startJobsPrewarm(bucket = 'server') {
  _prewarmSweep(bucket);
  const t = setInterval(() => _prewarmSweep(bucket), PREWARM_REFRESH_MS);
  if (t.unref) t.unref();
}

const _dfltSnap = new Map();
const _dfltBusy = {};
const DFLT_TTL_MS = 600_000;
async function _computeDefaultBuild(bucket, version, minTests) {
  // Newest build with >= minTests tests, so a 1-job CV/sanity run never becomes default.
  let cands = [];
  try { cands = (await getBuildsForVersion(bucket, version, 0, 20)).map(b => b.build); } catch (_) {}
  for (const b of cands) {
    if (await _bbTotal('greenboard', `${b}_${bucket}`) >= minTests) return b;
  }
  return cands[0] || null;
}
function getDefaultBuild(bucket, version, minTests = 2000) {
  const key = `${bucket}|${version}|${minTests}`;
  const snap = _dfltSnap.get(key);
  if ((!snap || Date.now() - snap.ts > DFLT_TTL_MS) && !_dfltBusy[key]) {
    _dfltBusy[key] = true;
    _computeDefaultBuild(bucket, version, minTests)
      .then(build => _dfltSnap.set(key, { build, ts: Date.now() }))
      .catch(() => {})
      .finally(() => { _dfltBusy[key] = false; });
  }
  return { build: snap ? snap.build : null, ready: !!snap };
}

const TOKENS_TTL = 30_000;
let _tokensCache = null;
const TU = '`test_analysis`._default.`token_usage`';

async function _computeTokenUsage() {
  // input/output/build/model are N1QL reserved words -> backticked as aliases/fields.
  const [totals, byPhase, byComponent, byBuild, byModel, overTime, topJobs] = await Promise.all([
    query(`SELECT COUNT(*) AS calls, SUM(input_tokens) AS \`input\`, SUM(output_tokens) AS \`output\`,
                  SUM(total_tokens) AS total, SUM(duration_ms) AS durationMs FROM ${TU}`),
    query(`SELECT phase, COUNT(*) AS calls, SUM(input_tokens) AS \`input\`, SUM(output_tokens) AS \`output\`,
                  SUM(total_tokens) AS total FROM ${TU} WHERE phase IS NOT MISSING GROUP BY phase`),
    query(`SELECT component, COUNT(*) AS calls, SUM(input_tokens) AS \`input\`,
                  SUM(output_tokens) AS \`output\`, SUM(total_tokens) AS total FROM ${TU}
            WHERE component IS NOT MISSING GROUP BY component ORDER BY total DESC`),
    query(`SELECT \`build\`, COUNT(*) AS calls, SUM(input_tokens) AS \`input\`,
                  SUM(output_tokens) AS \`output\`, SUM(total_tokens) AS total FROM ${TU}
            WHERE \`build\` IS NOT MISSING GROUP BY \`build\``),
    query(`SELECT \`model\`, COUNT(*) AS calls, SUM(total_tokens) AS total FROM ${TU}
            WHERE \`model\` IS NOT MISSING GROUP BY \`model\` ORDER BY total DESC`),
    query(`SELECT SUBSTR(ts, 0, 13) AS t, COUNT(*) AS calls, SUM(total_tokens) AS total FROM ${TU}
            WHERE ts IS NOT MISSING GROUP BY SUBSTR(ts, 0, 13) ORDER BY t`),
    query(`SELECT job_name, MIN(component) AS component, COUNT(*) AS calls,
                  SUM(input_tokens) AS \`input\`, SUM(output_tokens) AS \`output\`,
                  SUM(total_tokens) AS total FROM ${TU}
            WHERE job_name IS NOT MISSING GROUP BY job_name ORDER BY total DESC LIMIT 15`),
  ]);
  const t = totals[0] || {};

  const perM = config.tokenCreditsPerM || 0;
  const credits = (tokens) => ((tokens || 0) / 1e6) * perM;
  const withCredits = (rows) => rows.map(r => ({ ...r, credits: credits(r.total) }));
  const totalCredits = credits(t.total);

  return {
    totals: {
      calls: t.calls || 0, input: t.input || 0, output: t.output || 0,
      total: t.total || 0, durationMs: t.durationMs || 0,
      avg: t.calls ? Math.round((t.total || 0) / t.calls) : 0,
      credits: totalCredits,
      creditsPerCall: t.calls ? totalCredits / t.calls : 0,
      creditsPer1k: t.total ? (totalCredits / t.total) * 1000 : 0,
      tokensPerSec: t.durationMs ? Math.round((t.total || 0) / (t.durationMs / 1000)) : 0,
    },
    creditsPerM: perM,
    byPhase: withCredits(byPhase),
    byComponent: withCredits(byComponent),
    byBuild: withCredits(byBuild),
    byModel,
    overTime: withCredits(overTime),
    topJobs: withCredits(topJobs),
    generatedAt: new Date().toISOString(),
  };
}

async function getTokenUsage() {
  if (_tokensCache && Date.now() - _tokensCache.ts < TOKENS_TTL) return _tokensCache.data;
  const data = await _computeTokenUsage();
  _tokensCache = { data, ts: Date.now() };
  return data;
}

module.exports = {
  rawGet,
  existsDoc,
  query,
  getVersions,
  getBuildsForVersion,
  getJobsForBuild,
  getBuildSummary,
  saveClaim,
  setBestRun,
  getTrend,
  getJobTrend,
  getReport,
  getAnalysis,
  getBuildsForCompare,
  getReadiness,
  getFleet,
  getFleetNode,
  getComponentReport,
  getTokenUsage,
  getBuildBars,
  startBuildBarsSnapshot,
  getStability,
  startStabilitySnapshot,
  getDefaultBuild,
  startJobsPrewarm,
};
