'use strict';

const _snapshots = new Map();

function get(docKey) {
  return _snapshots.get(docKey) || null;
}

function has(docKey) {
  return _snapshots.has(docKey);
}

const _lastSeq = new Map();

function upsert(docKey, { jobs, cas }) {
  const seq = (_lastSeq.get(docKey) || 0) + 1;
  _lastSeq.set(docKey, seq);
  _snapshots.set(docKey, {
    docKey,
    seq,
    cas,
    jobs,
    updatedAt: Date.now(),
  });
  return seq;
}

function evict(docKey) {
  return _snapshots.delete(docKey);
}

function keys() {
  return [..._snapshots.keys()];
}

function stats() {
  const entries = [..._snapshots.values()].map(s => ({
    docKey:    s.docKey,
    seq:       s.seq,
    jobs:      s.jobs.length,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));
  const mem = process.memoryUsage();
  return {
    snapshotCount: _snapshots.size,
    snapshots:     entries,
    rssMB:         Math.round(mem.rss       / 1024 / 1024),
    heapUsedMB:    Math.round(mem.heapUsed  / 1024 / 1024),
    heapTotalMB:   Math.round(mem.heapTotal / 1024 / 1024),
  };
}

module.exports = { get, has, upsert, evict, keys, stats };
