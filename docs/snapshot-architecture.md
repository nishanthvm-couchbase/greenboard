# The Snapshot Architecture — A Deep Dive

*How we took Greenboard's job API from ~20 seconds to ~40 milliseconds,
and made the dashboard live-update without page reloads.*

This is a teaching document. It walks through every design decision, every
component, and — most valuably — every bug we hit on the way and **why** it
happened. Read it top to bottom once, then use it as a reference.

---

## Part 1 — The Problem

### 1.1 What was slow, exactly?

Every build's test results live in **one giant Couchbase document**:

```
key:   "8.1.0-2258_server"
value: { type, build, os: { DEBIAN: { QUERY: { jobName: [run, run, ...] } } } }
size:  up to 10+ MB
```

When a browser asked for `/api/jobs/8.1.0-2258/server`, the old flow was:

```
request → fetch 10MB doc from Couchbase  (network, seconds over VPN)
        → JSON.parse the 10MB            (~100–150ms of CPU)
        → fetch existing_builds doc      (another huge doc!)
        → merge PENDING jobs, flatten, attach run history
        → serialize the response
```

Every. Single. Request. Even if nothing had changed since the last request
two seconds ago. Measured cold: **~20 seconds** per request over VPN.

### 1.2 The two distinct costs

It's important to separate them, because they need different cures:

| Cost | Type | Cure |
|---|---|---|
| Fetching 10MB over the network | **I/O-bound** — the event loop is free while waiting | Don't refetch what hasn't changed → **caching** |
| `JSON.parse` of 10MB + processing | **CPU-bound** — blocks Node's single thread | Move it off the main thread → **worker_threads** |

A naive cache fixes the first. But if your cache *refresh* still parses 10MB
on the main thread, every refresh freezes **all** other requests for ~150ms.
That's the part most caching tutorials skip.

### 1.3 The insight that shapes everything

> Test results for a build change **rarely** (a few times an hour as Jenkins
> jobs finish) but are read **constantly** (every dashboard user, every
> navigation). Read-heavy + write-rarely = the textbook case for a
> **materialized view**: precompute the answer, keep it in memory, update it
> only when the source actually changes.

Everything below is just a disciplined implementation of that one sentence.

---

## Part 2 — The Architecture at 10,000 Feet

```
                       ┌─────────────────────────────────────────────────┐
                       │                 Node.js process                  │
                       │                                                  │
 Browser ──HTTP──────► │  index.js ──reads──► SnapshotStore (Map)         │
 Browser ◄──SSE─────── │  sse.js   ◄─patches── ▲                          │
                       │                       │ atomic swap              │
                       │             refresher.js                         │
                       │              │  ▲                                │
                       │   fetch raw  │  │ processed jobs + diff          │
                       │   bytes      ▼  │                                │
                       │             worker.js (worker_thread)            │
                       │              parse → process → diff              │
                       └──────────────┬───────────────────────────────────┘
                                      │ KV get (raw) / exists (CAS) / N1QL
                                      ▼
                                  Couchbase
```

Five modules, one job each:

| Module | Single responsibility |
|---|---|
| `snapshots/store.js` | Hold the materialized views; swap them atomically |
| `snapshots/process.js` | Pure transform: raw doc → flat jobs array (shared with cold path) |
| `snapshots/worker.js` | Run the CPU-heavy parse/process/diff off the main thread |
| `snapshots/refresher.js` | Decide *what* to keep hot and *when* to refresh it |
| `snapshots/sse.js` | Push the diffs to connected browsers |

The rule that keeps this sane: **each module owns one decision.** The store
doesn't know about Couchbase. The worker doesn't know about HTTP. The SSE hub
doesn't know what a "build" is — it just fans payloads out to topics.

---

## Part 3 — The Store (`store.js`)

The simplest module, but it embodies the most important correctness idea.

```js
const _snapshots = new Map();   // docKey → { docKey, seq, cas, jobs, updatedAt }

function upsert(docKey, { jobs, cas }) {
  const seq = (_lastSeq.get(docKey) || 0) + 1;
  _snapshots.set(docKey, { docKey, seq, cas, jobs, updatedAt: Date.now() });
  return seq;
}
```

### 3.1 Atomic swap — concurrency control without locks

A refresh **never mutates** the jobs array a reader might be holding. The
worker builds a *complete new array*, and the store replaces the reference in
one assignment. In JavaScript, that assignment is atomic by construction:
Node runs your JS on one thread, so no reader can observe a half-replaced
Map entry. Readers that grabbed the old reference keep a consistent old
view; new readers get the new one. This is the single-writer/immutable-swap
pattern — you get torn-read safety for free, **as long as you never mutate
in place.**

> **Principle:** in a single-threaded runtime, "replace, don't mutate" is a
> complete concurrency strategy for shared state.

### 3.2 The `seq` number — versioning for everything downstream

Every successful refresh bumps a per-doc monotonic counter. That one integer
powers three features:

1. **HTTP ETag** — responses carry `ETag: "42"`. The browser revalidates with
   `If-None-Match: "42"` and gets a free `304 Not Modified` (21ms, no body).
2. **SSE replay** — patches are numbered; a reconnecting client says "I'm at
   41" and we replay just patch 42.
3. **Debuggability** — `/api/snapshots/status` shows each doc's seq, so you
   can see at a glance how many times each build has refreshed.

Note `_lastSeq` survives eviction on purpose: if a doc leaves the hot set and
comes back, seq keeps climbing instead of restarting at 1 — so an SSE client
that reconnects across that gap correctly detects "I'm behind" and resyncs.

---

## Part 4 — Keeping the Event Loop Clean

### 4.1 Why `JSON.parse` is the hidden killer

Node's superpower is cheap concurrency for **I/O**: while a 10MB fetch is in
flight, the event loop happily serves hundreds of other requests. But
`JSON.parse(tenMegabyteString)` is synchronous CPU work — for ~150ms,
*nothing else runs*. No HTTP responses, no SSE heartbeats, nothing.

Worse: the Couchbase SDK parses JSON for you inside `get()`. So even "just
fetching" a doc on the main thread eats the parse cost there.

### 4.2 The raw transcoder trick (`cbclient.js`)

We tell the SDK *not* to parse — give us bytes:

```js
class RawTranscoder {
  encode(v) { return [Buffer.isBuffer(v) ? v : Buffer.from(v), 0x02 << 24]; }
  decode(bytes) { return bytes; }   // hand back the Buffer untouched
}

async function rawGet(bucket, key) {
  const r = await c.get(key, { transcoder: _rawTranscoder });
  return { buf: r.content, cas: String(r.cas) };
}
```

Now the main thread does **only I/O** (free) and ships the Buffer to a
worker thread for the expensive part.

### 4.3 Division of labour

```
main thread (refresher):   rawGet bytes  ──postMessage──►  worker thread:
  · async I/O only                                           · JSON.parse   (150ms, isolated)
  · never parses                                             · processBuildDoc
  · receives small results                                   · diff vs previous
                                          ◄─postMessage──    · post {jobs, patch}
```

### 4.4 Why the worker has NO Couchbase dependency

We deliberately fetch on the main thread and parse in the worker — not fetch
in the worker. Two reasons:

1. **Native addons + worker_threads is a risk surface.** The Couchbase SDK
   is a C++ addon; loading it in multiple threads invites subtle crashes.
   The worker imports only `process.js` (pure JS) — nothing can go wrong.
2. **Connection economy.** One SDK connection in the process, not one per
   thread.

### 4.5 ⚠️ War story: the Buffer that wasn't

Our first run produced snapshots with **0 jobs** — silently. The pipeline
worked perfectly when tested in one process. Why did it break across the
worker boundary?

`postMessage` uses the *structured clone* algorithm. A Node `Buffer` is not
in that algorithm's vocabulary — it arrives on the other side as a plain
`Uint8Array`. Our parser checked `Buffer.isBuffer(raw)` → false → fell
through to "it's already an object" → returned raw bytes as the "document"
→ `doc.os` was undefined → zero jobs. No exception anywhere.

The fix in `process.js`:

```js
if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
  const s = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString();
  ...
}
```

> **Lesson:** every serialization boundary (worker, IPC, network) can change
> your types. Test *across* the boundary, not just the units on either side.

---

## Part 5 — The Refresher: What to Cache, and When to Refresh

This is the brain. Three loops, three questions.

### 5.1 "What deserves to be hot?" — discovery (every 60s)

You can't snapshot everything: 101 versions × 2 builds × parsed-object
overhead would be many GB. You need the *working set* — and ideally without
maintaining a config file.

The trick: **Couchbase CAS values are time-based.** CAS is a hybrid logical
clock — roughly nanoseconds since epoch of the last mutation. So this N1QL
finds "documents jinja actually wrote recently" with zero schema support:

```sql
SELECT `build`, META().cas AS mcas
FROM `greenboard`
WHERE `type` = 'server'
  AND META().id NOT LIKE 'existing_%'
  AND META().cas > {(now - 14 days) in nanoseconds}
```

Group by version, keep the **latest 2 builds per version**, rank versions by
most-recent mutation, **cap at 16 docs total**. Builds with 5-digit numbers
(toy builds) are skipped, consistent with the timeline UI.

Interesting side effect we observed: docs like `2.1.1-1469` showed up as
"recently mutated" — ancient versions! That wasn't a bug in detection; jinja
genuinely writes those docs (jobs with misconfigured version params). The
detector tells the truth; the truth was surprising.

Discovery also detects a **new top build per version** and emits
`builds-changed` so every open timeline grows a new node live.

### 5.2 "Did it change?" — CAS polling (every 10s)

Refetching 10MB to *check* for changes would be absurd. Instead:

```js
const r = await collection.exists(docKey);   // metadata-only KV op, ~1ms
if (r.cas !== snapshot.cas) scheduleRefresh(docKey);
```

`exists()` returns the CAS without the body. Sixteen of these every 10s is
effectively free. Compare to the alternative — a true push via Couchbase
Eventing webhooks — and you get this trade-off table:

| | CAS poll (chosen) | Eventing webhook |
|---|---|---|
| Staleness | ≤ 13s (10s poll + 3s debounce) | ~instant |
| Code | ~20 lines, pure client | New eventing function, auth, deploy |
| Failure modes | none new | silent eventing failures |

For a CI dashboard where builds update on minute timescales, 13 seconds of
staleness is invisible. We kept the door open: the webhook would simply
*replace the trigger* — every other component stays identical.

**The dependency wrinkle:** the jobs payload also depends on
`existing_builds_{bucket}` (it's where PENDING jobs come from). So the poll
watches that doc's CAS too, and a change there schedules a refresh of *every*
hot doc in that bucket.

### 5.3 "Don't stampede" — debounce + bounded queue

Two protections, born from two real incidents:

**Debounce (3s).** Jinja may touch a doc several times within a minute as a
batch of Jenkins jobs report in. Without debounce we'd re-parse 10MB for each
touch. With it, we wait for 3 seconds of quiet, then refresh once.

```js
clearTimeout(_debounce.get(docKey));
_debounce.set(docKey, setTimeout(() => refresh(docKey), 3000));
```

**Bounded queue (concurrency = 2).** ⚠️ War story: on first prewarm, all 15
promotions fired `_refresh` simultaneously → 30 concurrent ~10MB fetches over
VPN → the KV connection saturated → `unambiguous timeout` everywhere — and
worse, **real browser requests starved too**, because they shared the same
connection. The log looked like Couchbase was down. It wasn't; we were
DDoSing ourselves.

```js
const MAX_CONCURRENT_REFRESH = 2;
function _drainQueue() {
  while (_activeRefreshes < MAX_CONCURRENT_REFRESH && _refreshQueue.length) {
    const docKey = _refreshQueue.shift();
    _activeRefreshes++;
    _refresh(docKey).finally(() => { _activeRefreshes--; _drainQueue(); });
  }
}
```

After this: prewarm of all 15 docs, **zero failures**, and a cold-path
request during prewarm still answered in 8s.

> **Principle:** any time code can fan out N parallel expensive operations
> where N is data-dependent, bound it. "Parallel" is not free — you share
> connections, sockets, and CPU with the rest of your process.

**Self-healing for free:** a failed refresh needs no retry logic — the next
CAS poll sees "no snapshot / stale CAS" and re-queues it. The poll loop *is*
the retry loop.

### 5.4 The shared-dependency cache

Every refresh needs `existing_builds_{bucket}` — the same huge doc, for all
15 builds. First implementation fetched it 15 times during prewarm. Now it's
cached for 30s, and the CAS poll **invalidates that cache the moment the dep
actually changes** — a tiny example of the only two hard cache problems
(invalidation and naming) being solved by... watching the source of truth.

---

## Part 6 — The Memory Saga (4 GB → 128 MB)

This deserves its own chapter because it's the best lesson in the project.

After the first successful prewarm, RSS was **4061 MB**. For 15 cached
builds. Here's how it came down, step by step — note how each step required
*measuring* before fixing:

| Step | RSS | What changed |
|---|---|---|
| Initial | 4061 MB | — |
| md5 fingerprints | 3031 MB | Worker's diff state kept **full JSON strings** of every job (~1KB each) to compare against next refresh. Replaced with 16-byte md5 hashes — same diff capability, 30× less memory. |
| Bounded queue | 2112 MB | Fewer simultaneous 10MB parses = less transient garbage resident at once. |
| **Shared `allRuns`** | **128 MB** | The big one. See below. |

### 6.1 The O(runs²) bug hiding in plain sight

Each job row carries an `allRuns` array — summaries of its sibling runs (for
the "all runs" modal). The original code built a **fresh copy of that array
for every row**:

```js
flat.forEach(job => {
  job.allRuns = (byName[key] || []).map(r => ({ ...summary fields }));
});
```

Innocent-looking. But a job with 5 runs produces 5 rows × 5-entry array =
**25 objects where 5 would do** — O(runs²) per job, multiplied by ~40,000
rows held in memory across 15 snapshots. That one `.map` inside a `.forEach`
was ~95% of our heap.

The fix — build each group's array **once** and share the reference:

```js
const sharedRuns = {};
for (const [key, rows] of Object.entries(byName)) {
  sharedRuns[key] = rows.map(r => ({ ...summary fields }));
}
flat.forEach(job => { job.allRuns = sharedRuns[groupKey(job)] || []; });
```

Sharing is safe here because the server only ever *serializes* these objects
— nothing mutates them. The JSON output is byte-identical; only the in-memory
shape changed. 2 GB → 128 MB from a five-line refactor.

### 6.2 How we knew where to look

We added `heapUsed` next to `rss` in the status endpoint. The reading —
`rss: 2112 MB, heapUsed: 962 MB` — told us this was **real retained data**,
not GC laziness (a common misdiagnosis: Node's RSS often stays high after
temporary spikes even though the heap is mostly free). Real retention means a
real reference; that pointed at the snapshot contents themselves, and the
`allRuns` duplication fell out of eyeballing one sample job's JSON.

> **Lessons:**
> 1. Per-item copies of shared sub-structures are the classic silent
>    memory multiplier. Ask "who else holds this exact data?"
> 2. `rss` alone can't distinguish garbage from retention — always look at
>    `heapUsed` too.
> 3. Memory bugs don't throw. You find them by *measuring at checkpoints*,
>    which is why `/api/snapshots/status` exists.

---

## Part 7 — Live Updates: Diff → SSE → Surgical Re-render

### 7.1 Computing the diff (worker)

The worker keeps, per doc, a Map of `jobKey → md5(JSON(job))` from the last
refresh. Next refresh compares:

```js
for (const job of jobs) {
  const k = jobKey(job);                       // os|component|name|build_id
  const h = md5(JSON.stringify(job));
  nextState.set(k, h);
  if (!prev || prev.get(k) !== h) upserts.push(job);
}
for (const k of prev.keys()) if (!nextState.has(k)) removes.push(k);
```

Output: `{ upserts: [job...], removes: [key...] }` — typically a handful of
jobs out of thousands. We saw it live: `seq 2 (7460 jobs, 6 changed)`.

If a patch is huge (> 500 upserts — e.g. first real data after a near-empty
doc), we don't ship a mega-patch; we tell clients to **resync** (one full
refetch). Patches are an optimization, not a religion.

### 7.2 Why SSE and not WebSockets

The data flows one way: server → browser. SSE (Server-Sent Events) is:

- plain HTTP — no upgrade handshake, works through proxies (with heartbeats),
- **auto-reconnecting** natively, with `Last-Event-ID` resume built into the
  browser's `EventSource` — features you'd hand-roll on WebSockets.

The wire format is almost comically simple:

```
id: 43
event: patch
data: {"seq":43,"upserts":[...],"removes":[...]}

```

### 7.3 The replay buffer — handling sleep/wake gracefully

The hub keeps the **last 10 patches per topic**. When a laptop wakes up and
`EventSource` reconnects with `Last-Event-ID: 41`:

- gap fits the buffer → replay patches 42, 43 → caught up, milliseconds;
- gap too old → send `event: resync` → client does **one** full refetch.

Two failure paths, both converging to a correct state, neither requiring the
user to do anything. Also note the engineering details that make SSE work in
production: heartbeat comments every 25s (idle proxies kill quiet
connections), `X-Accel-Buffering: no`, and **exempting the stream from
compression middleware** (gzip buffers output — your "real-time" events
would sit in a buffer forever).

### 7.4 The frontend: patch the cache, not the DOM

This is the piece that makes updates feel surgical (`useLiveJobs.js`):

```js
es.addEventListener('patch', (e) => {
  const patch = JSON.parse(e.data);
  queryClient.setQueryData(['jobs', build, target], old => applyPatch(old, patch));
});
```

We **don't refetch** and we **don't touch the DOM**. We patch React Query's
cache in place. React's reconciliation does the rest: rows are keyed by
`jobKey`, so only the 6 changed rows re-render. Stats, heatmap and filter
counts recompute automatically because they're `useMemo` derivations of the
same array. The changed rows pulse amber for 2 seconds so the user *sees*
the live update happen.

> **Principle:** in a React app, "update the UI" should always mean "update
> the data the UI derives from." If you find yourself reaching for the DOM,
> the data flow is wrong.

---

## Part 8 — The Request Path, End to End

```
GET /api/jobs/8.1.0-2258/server
│
├─ snapshot in store?
│   ├─ If-None-Match matches seq → 304, empty body          (~20ms)
│   └─ else → res.json(snap.jobs), ETag: "seq"              (~40ms)
│
└─ not hot → cold path: db.getJobsForBuild()
    └─ fetch + parse + process, LRU-cached                  (seconds, once)
```

Crucially the cold path **still exists and still works** — old builds,
obscure versions, anything outside the hot set. The snapshot layer is a pure
accelerator: removing it changes performance, never correctness. That
property is what made it safe to build incrementally.

### Measured results

| Scenario | Before | After |
|---|---|---|
| Hot build, jobs payload (2.7MB) | ~20,000 ms | **37 ms** |
| Repeat request (ETag) | ~20,000 ms | **21 ms** (304) |
| Update visible in browser | manual reload | **≤ 13 s**, auto, row-level |
| Memory footprint | n/a | 128 MB RSS / 79 MB heap |
| Prewarm failures | 5+/15 (thundering herd) | 0/15 |

---

## Part 9 — The Principles, Distilled

If you remember nothing else, remember these eight:

1. **Read-heavy + write-rarely ⇒ materialized view.** Precompute on write
   (or change-detect), serve from memory on read.
2. **Separate I/O cost from CPU cost.** Caching fixes refetching; only
   moving work off-thread fixes parse stalls. They're different diseases.
3. **Replace, don't mutate.** Atomic reference swap = lock-free consistency
   in a single-threaded runtime.
4. **Bound every fan-out.** Unbounded parallelism against a shared resource
   is a self-inflicted outage (our prewarm proved it).
5. **Let the poll be the retry.** A reconciliation loop that converges on
   the source of truth needs no special-case error handling.
6. **Version your state (`seq`).** One monotonic integer bought us ETags,
   replay, and observability.
7. **Serialization boundaries change types.** Buffers become Uint8Arrays.
   Test across the boundary.
8. **Measure, then optimize — and measure the right number.** `heapUsed` vs
   `rss` told us the 2GB was real; one sample document told us it was
   `allRuns`. Guessing would have found neither.

---

## Part 10 — Exercises (test yourself)

1. **Staleness math.** Worst case, how long after jinja writes a doc until a
   browser shows the change? Walk every stage. *(Answer: ≤10s poll + 3s
   debounce + fetch/parse time + SSE delivery ≈ 13–15s.)*
2. **Why is `exists()` cheap but `get()` expensive** for a 10MB doc? What
   exactly travels over the network in each case?
3. **What breaks if we run two instances of this server behind a load
   balancer?** List at least three things. (Hint: snapshot divergence, SSE
   topology, seq numbers.) How would Redis pub/sub address each?
4. **The diff uses md5 of the serialized job.** What's the failure mode if
   two different job states hash identically? How likely is it, and is the
   consequence acceptable for a dashboard? Would your answer change for a
   billing system?
5. **Why must the new jobs array be fully built *before* the store swap,**
   rather than streaming rows into the live array as they're processed?
6. **Design the Eventing-webhook upgrade.** Which single function in
   `refresher.js` does it replace? What new failure mode does it introduce,
   and why should the CAS poll stay on as a slow backstop?

---

## Appendix — File Map

| File | What to look for |
|---|---|
| `snapshots/store.js` | atomic swap, seq counter surviving eviction |
| `snapshots/process.js` | pure transform; `parseRaw` Uint8Array fix; shared `allRuns` |
| `snapshots/worker.js` | md5 diff state; no SDK import; message protocol |
| `snapshots/refresher.js` | CAS-clock discovery N1QL; bounded queue; debounce; dep cache |
| `snapshots/sse.js` | replay buffer; Last-Event-ID; heartbeats |
| `cbclient.js` | `RawTranscoder`, `rawGet`, `existsDoc`; cold path |
| `index.js` | ETag/304; compression exemption for `/api/stream` |
| `frontend/src/hooks/useLiveJobs.js` | cache patching, resync handling |
| `GET /api/snapshots/status` | live observability: hot set, seqs, queue, memory |
