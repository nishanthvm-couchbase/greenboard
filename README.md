# Greenboard

QE test-results dashboard — Express backend + React/Vite/Tailwind frontend, served from one Node process.
Reads the folded `greenboard` bucket (plus `trend` / `reports` / `triage_history` / `test_analysis`) on a
Couchbase cluster. Replaces the legacy AngularJS greenboard.

## Run locally

```bash
# backend deps
npm install
# frontend deps + build (produces frontend/dist, which the backend serves)
cd frontend && npm install && npm run build && cd ..
# start
node index.js
```
Open http://localhost:3000

## Configuration (env vars — see config.js for defaults)

| Var | Purpose |
|-----|---------|
| `CB_HOST` | Couchbase cluster to read from (e.g. `172.23.105.219`) |
| `CB_USER` / `CB_PASS` | Cluster credentials |
| `PORT` | HTTP(S) port (default `3000`) |
| `LISTEN` | Bind address (default `0.0.0.0`) |
| `SSL_CERT` / `SSL_KEY` | PEM paths — if both set, server runs HTTPS |
| `JIRA_ENABLED` | `true` to enable the Dashboard Jira Insights panel |
| `JIRA_TOKEN` / `JIRA_TOKEN_FILE` | Jira credential (token file path) |
| `JIRA_EMAIL` / `JIRA_BASE_URL` | Jira account + site |

Secrets are **never** committed — `jenkinsCredentials.json`, token files, and certs are git-ignored.
Provide them on the host (env vars or files outside the repo).

## Deploy on the host (e.g. `/root/qe/greenboard`)

```bash
git clone <repo-url> /root/qe/greenboard && cd /root/qe/greenboard
npm install
cd frontend && npm install && npm run build && cd ..

# run in a screen, pointed at the temp/clone cluster, on port 3000 with TLS
screen -S greenboard
export CB_HOST=172.23.105.219
export PORT=3000
export SSL_CERT=/root/certs/wildcard.sc.couchbase.com-2025/e2462cad8794b9b0.pem
export SSL_KEY=/root/certs/wildcard.sc.couchbase.com-2025/privatekey.pem
node index.js
# detach: Ctrl-A then D
```
→ https://greenboard.sc.couchbase.com:3000
