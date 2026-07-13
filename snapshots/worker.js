'use strict';

const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const { parseRaw, jobKey, processBuildDoc } = require('./process');

const lastByDoc = new Map();

function fingerprint(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

parentPort.on('message', (msg) => {
  if (msg.type === 'evict') {
    lastByDoc.delete(msg.docKey);
    return;
  }
  if (msg.type !== 'refresh') return;

  const { id, docKey, bucket, build, buildRaw, existingRaw } = msg;
  try {
    const buildDoc    = parseRaw(buildRaw);
    const existingDoc = (() => { try { return parseRaw(existingRaw); } catch { return null; } })();

    const jobs = processBuildDoc(buildDoc, existingDoc, bucket, build);

    const prev      = lastByDoc.get(docKey) || null;
    const nextState = new Map();
    const upserts   = [];
    const removes   = [];

    for (const job of jobs) {
      const k = jobKey(job);
      const h = fingerprint(JSON.stringify(job));
      nextState.set(k, h);
      if (!prev || prev.get(k) !== h) upserts.push(job);
    }
    if (prev) {
      for (const k of prev.keys()) {
        if (!nextState.has(k)) removes.push(k);
      }
    }
    lastByDoc.set(docKey, nextState);

    const firstLoad = !prev;
    const changed   = upserts.length > 0 || removes.length > 0;

    parentPort.postMessage({
      type: 'result',
      id,
      docKey,
      jobs,
      firstLoad,
      patch: (!firstLoad && changed) ? { upserts, removes } : null,
    });
  } catch (e) {
    parentPort.postMessage({ type: 'result', id, docKey, error: e.message });
  }
});
