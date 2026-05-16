# Greenboard — Agent Context

QE dashboard displaying Couchbase Jenkins test results. Express 5 backend + AngularJS 1.x SPA.

## Commands

### Backend
```bash
npm install
npm start          # node index.js
```

### Frontend (from app/)
```bash
cd app
npm install
bower install
./node_modules/.bin/grunt           # concat + uglify → dist/greenboard.{js,min.js}
npm start                           # grunt then http-server on :8000
npm test                            # Karma + Jasmine (requires Chrome)
./node_modules/.bin/grunt watch     # rebuild dist/ on js/*.js changes
```

## Architecture

### Two-tier structure
- **Backend**: `index.js` — Express 5, serves `app/` as static files + JSON REST API
- **Frontend**: `app/` — AngularJS 1.x SPA, built by Grunt, entry at `app/index.html`

No SSR. Backend only serves static files and API.

### Backend (`index.js` + `cbclient.js`)

`cbclient.js` exports an async factory returning a client API object, initialized once on startup and cached in `index.js`.

Key REST routes:
| Route | Purpose |
|---|---|
| `GET /versions[/:bucket]` | Distinct product versions |
| `GET /builds/:bucket/:version/:testsFilter/:buildsFilter` | Paginated build list with totals |
| `GET /timeline/:version/:bucket/:testsFilter/:buildsFilter` | Aggregate timeline data |
| `GET /jobs/:build/:bucket` | Flattened job list for a build |
| `GET /info/:build/:bucket` | Raw build document |
| `POST /claim/:bucket/:name/:build_id` | Update bug links / triage on a job run |
| `POST /rerun` | Trigger Jenkins re-run via `cbclient.rerunJob` |
| `GET /trend/:docId` | Fetch trend document |
| `GET /report/:version/:component` | Fetch AI report document |

### Couchbase data model

Primary bucket: **`greenboard`**

- Build docs keyed `{build}_{bucketType}` (e.g., `8.1.0-1442_server`)
- Doc structure: `{ type, build, os: { osName: { component: { jobName: [runs] } } } }`
- `existing_builds_{bucket}` — canonical list of all expected jobs per bucket type
- Additional buckets: `rerun`, `triage_history`, `trend`, `reports`

`cbclient.js` holds in-memory caches (`buildsResponseCache`, `versionsResponseCache`), refreshed in the background on each hit.

`processJob` in `cbclient.jobsForBuild` merges a build document with `existing_builds` to inject `PENDING` placeholders for any expected job not yet recorded.

### Frontend (`app/`)

AngularJS module `greenBoard` split into services and controllers:

| Module | File | Role |
|---|---|---|
| `svc.data` | `datafactory.js` | Client-side state: target, version, build, filters, cache |
| `svc.query` | `queryservice.js` | HTTP calls to backend, delegates to `svc.data` |
| `svc.timeline` | `d3timeline.js` | D3-based timeline rendering |
| `app.main` | `maincontroller.js` | `NavCtrl`, top-level controller |
| `app.sidebar` | `sidebar.js` | Build list navigation |
| `app.target` | `targets.js` | Target (bucket type) switching |
| `app.infobar` | `infobar.js` | Build-level summary bar |
| `app.compare` | `comparer.js` | Side-by-side build comparison view |
| `app.darkmode` | `darkmode.js` | Dark mode toggle |
| `app.aireport` | `aireport.js` | AI report modal |
| `app.views` | `views.js` | View state helpers |

`ui-router` nested state hierarchy:
`target → target.version → target.version.builds → target.version.builds.build → target.version.builds.build.jobs`

Default route: `/server/8.1.0/latest`.

### Build pipeline

Grunt (`app/Gruntfile.js`) concatenates all `app/js/*.js` → `app/dist/greenboard.js`, then uglifies to `app/dist/greenboard.min.js`. `index.html` loads the minified bundle. Run `grunt` after any frontend JS change before testing in a browser.

### Configuration

`config.js` (root) — Couchbase cluster address, RBAC credentials, bucket list, HTTP/HTTPS ports. No env-var support; edit directly for local dev.

`jenkinsCredentials.json` — maps Jenkins base URLs to `{ username, password }`. Copy from `jenkinsCredentials.sample.json`.

### Tools

`tools/purger.go` — standalone Go utility that purges deleted Jenkins jobs from Couchbase. Runs independently from the Node server.
