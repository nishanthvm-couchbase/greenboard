'use strict';

const REPLAY_LIMIT     = 10;
const HEARTBEAT_MS     = 25_000;

const _subs = new Map();
const _meta = new Map();
const _replay = new Map();

function _writeEvent(res, event, data, seq) {
  try {
    if (seq !== undefined) res.write(`id: ${seq}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) {}
}

function subscribe(req, res, topic, bucket) {
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  if (!_subs.has(topic)) _subs.set(topic, new Set());
  _subs.get(topic).add(res);
  _meta.set(res, { topic, bucket });

  const lastId = parseInt(req.headers['last-event-id'], 10);
  if (!Number.isNaN(lastId)) {
    const buffer = _replay.get(topic) || [];
    const missed = buffer.filter(p => p.seq > lastId);
    const oldest = buffer.length ? buffer[0].seq : Infinity;

    if (missed.length && lastId >= oldest - 1) {
      for (const p of missed) _writeEvent(res, 'patch', p.payload, p.seq);
    } else if (lastId < oldest - 1) {
      _writeEvent(res, 'resync', {});
    }
  }

  req.on('close', () => {
    _subs.get(topic)?.delete(res);
    _meta.delete(res);
  });
}

function publishPatch(topic, seq, patch) {
  const payload = { seq, ...patch };

  const buffer = _replay.get(topic) || [];
  buffer.push({ seq, payload });
  while (buffer.length > REPLAY_LIMIT) buffer.shift();
  _replay.set(topic, buffer);

  for (const res of _subs.get(topic) || []) {
    _writeEvent(res, 'patch', payload, seq);
  }
}

function publishResync(topic) {
  _replay.delete(topic);
  for (const res of _subs.get(topic) || []) {
    _writeEvent(res, 'resync', {});
  }
}

function publishBucket(bucket, event, data) {
  for (const [res, meta] of _meta) {
    if (meta.bucket === bucket) _writeEvent(res, event, data);
  }
}

function stats() {
  let clients = 0;
  for (const set of _subs.values()) clients += set.size;
  return { sseClients: clients, sseTopics: _subs.size };
}

setInterval(() => {
  for (const res of _meta.keys()) {
    try { res.write(': ping\n\n'); } catch (_) {}
  }
}, HEARTBEAT_MS).unref();

module.exports = { subscribe, publishPatch, publishResync, publishBucket, stats };
