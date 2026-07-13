'use strict';

const express    = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const http       = require('http');
const https      = require('https');
const crypto     = require('crypto');
const config     = require('./config');
const db         = require('./cbclient');
const jira       = require('./jira');
const jiraOauth  = require('./jira_oauth');
const store      = require('./snapshots/store');
const sse        = require('./snapshots/sse');
const refresher  = require('./snapshots/refresher');

const app = express();
// Compression must never buffer SSE streams
app.use(compression({
  filter: (req, res) => req.path.startsWith('/api/stream') ? false : compression.filter(req, res),
}));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const DIST = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
}

app.get('/api/versions/:bucket', async (req, res) => {
  try {
    const versions = await db.getVersions(req.params.bucket);
    res.json(versions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/builds/:bucket/:version/:testsFilter/:buildsFilter', async (req, res) => {
  try {
    const { bucket, version, testsFilter, buildsFilter } = req.params;
    const platforms = req.query.platforms ? req.query.platforms.split(',') : null;
    const features  = req.query.features  ? req.query.features.split(',')  : null;
    const builds = await db.getBuildsForVersion(bucket, version, testsFilter, buildsFilter, platforms, features);
    res.json(builds);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobs/:build/:bucket', async (req, res) => {
  try {
    const docKey = `${req.params.build}_${req.params.bucket}`;
    const snap   = store.get(docKey);

    if (snap) {
      const etag = `"${snap.seq}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.set('ETag', etag);
      res.set('X-Snapshot', 'hit');
      return res.json(snap.jobs);
    }

    const jobs = await db.getJobsForBuild(req.params.bucket, req.params.build);
    res.set('X-Snapshot', 'miss');
    res.json(jobs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stream/:build/:bucket', (req, res) => {
  const topic = `${req.params.build}_${req.params.bucket}`;
  sse.subscribe(req, res, topic, req.params.bucket);
});

app.get('/api/snapshots/status', (req, res) => {
  res.json({ ...store.stats(), ...refresher.stats(), ...sse.stats() });
});

app.get('/api/getBuildSummary/:buildId', async (req, res) => {
  try {
    const summary = await db.getBuildSummary(req.params.buildId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/claim/:bucket/:name/:build_id', async (req, res) => {
  try {
    const { bucket, name, build_id } = req.params;
    const { type, claim, os, comp, build } = req.body;
    await db.saveClaim(bucket, name, build_id, type, claim, os, comp, build);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/setBestRun/:bucket/:name/:build_id', async (req, res) => {
  try {
    const { bucket, name, build_id } = req.params;
    const { os, comp, build } = req.body;
    await db.setBestRun(bucket, name, build_id, os, comp, build);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trend/:docId', async (req, res) => {
  try {
    const data = await db.getTrend(req.params.docId);
    data ? res.json(data) : res.status(404).json({ error: 'not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jobtrend/:bucket/:version', async (req, res) => {
  try {
    const { os, component, name } = req.query;
    if (!os || !component || !name) return res.status(400).json({ error: 'os, component, name required' });
    res.json(await db.getJobTrend(req.params.bucket, req.params.version, os, component, name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/component-report', async (req, res) => {
  try {
    const { build, component, bucket } = req.query;
    if (!build || !component) return res.status(400).json({ error: 'build and component are required' });
    res.json(await db.getComponentReport(build, component, bucket || 'server'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/report/:version/:component', async (req, res) => {
  try {
    const data = await db.getReport(req.params.version, req.params.component);
    data ? res.json(data) : res.status(404).json({ error: 'not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/jira/meta', (req, res) => {
  res.json({
    enabled:   jiraOauth.isConfigured(),
    connected: jiraOauth.isConnected(),
    codenames: config.versionCodenames || {},
    presets:   config.jiraPresets || [],
  });
});

const _oauthStates = new Set();

app.get('/api/jira/oauth/login', (req, res) => {
  if (!jiraOauth.isConfigured()) {
    return res.status(500).send('Jira OAuth is not configured (set JIRA_CLIENT_ID and JIRA_CLIENT_SECRET).');
  }
  const state = crypto.randomBytes(12).toString('hex');
  _oauthStates.add(state);
  setTimeout(() => _oauthStates.delete(state), 10 * 60 * 1000).unref();
  res.redirect(jiraOauth.authorizeUrl(state));
});

app.get('/api/jira/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error)  return res.status(400).send(`Jira authorization failed: ${error} — ${error_description || ''}`);
  if (!code)  return res.status(400).send('Missing authorization code.');
  if (!state || !_oauthStates.has(state)) return res.status(400).send('Invalid or expired state. Try connecting again.');
  _oauthStates.delete(state);
  try {
    await jiraOauth.exchangeCode(code);
    res.send('<h2>✅ Jira connected.</h2><p>You can close this tab and return to Greenboard — the Jira Insights panel is now live.</p>');
  } catch (e) {
    res.status(502).send('Jira token exchange failed: ' + e.message);
  }
});

app.get('/api/jira/aggregate', async (req, res) => {
  try {
    const { jql, groupBy } = req.query;
    if (!jql || !jql.trim()) return res.status(400).json({ error: 'jql is required' });
    const data = await jira.jqlAggregate(jql.trim(), groupBy || 'assignee');
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/analysis', async (req, res) => {
  try {
    const { name, build } = req.query;
    if (!name || !build) {
      return res.status(400).json({ error: 'name and build are required' });
    }
    const data = await db.getAnalysis(name, build);
    data ? res.json(data) : res.status(404).json({ error: 'no analysis for this job/build yet' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fleet', async (req, res) => {
  try { res.json(await db.getFleet()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fleet/:ip', async (req, res) => {
  try {
    const doc = await db.getFleetNode(req.params.ip);
    doc ? res.json(doc) : res.status(404).json({ error: 'machine not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/buildbars/:bucket/:version', (req, res) => {
  try {
    const n = Math.min(parseInt(req.query.n, 10) || 5, 8);
    const minTests = req.query.minTests != null ? parseInt(req.query.minTests, 10) : 2000;
    res.json(db.getBuildBars(req.params.bucket, req.params.version, n, minTests));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/defaultbuild/:bucket/:version', (req, res) => {
  try {
    const minTests = req.query.minTests != null ? parseInt(req.query.minTests, 10) : 2000;
    res.json(db.getDefaultBuild(req.params.bucket, req.params.version, minTests));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stability/:bucket/:version', (req, res) => {
  try { res.json(db.getStability(req.params.bucket, req.params.version)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tokens', async (req, res) => {
  try { res.json(await db.getTokenUsage()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/readiness/:bucket', async (req, res) => {
  try {
    const max = parseInt(req.query.versions, 10) || 4;
    res.json(await db.getReadiness(req.params.bucket, max));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compare/builds/:bucket/:version', async (req, res) => {
  try {
    const builds = await db.getBuildsForCompare(req.params.bucket, req.params.version);
    res.json(builds);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compare/jobs/:bucket', async (req, res) => {
  try {
    const { bucket } = req.params;
    const buildList  = (req.query.builds || '').split(',').filter(Boolean);
    const results    = await Promise.all(buildList.map(b => db.getJobsForBuild(bucket, b)));
    res.json(buildList.reduce((acc, b, i) => { acc[b] = results[i]; return acc; }, {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rerunJob', async (req, res) => {
  try {
    const { jobUrl } = req.body;
    let creds = {};
    try { creds = require('./jenkinsCredentials.json'); } catch(_) {}
    const Jenkins = require('jenkins');
    const urlObj  = new URL(jobUrl);
    const base    = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':'+urlObj.port : ''}`;
    const auth    = creds[base] || {};
    const jenkins = new Jenkins({ baseUrl: base, headers: auth.token ? { Authorization: `Basic ${auth.token}` } : {} });
    const parts   = urlObj.pathname.replace(/^\/job\//, '').split('/job/');
    const jobName = parts.slice(0, -1).join('/job/');
    await jenkins.job.build(jobName);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  const idx = path.join(DIST, 'index.html');
  if (fs.existsSync(idx)) {
    res.sendFile(idx);
  } else {
    res.status(200).send('Run `npm run build` in the frontend directory to serve the UI.');
  }
});

const port = config.httpPort;

function startRefresher() {
  refresher.start({
    onPatch:         (docKey, seq, patch) => sse.publishPatch(docKey, seq, patch),
    onResync:        (docKey)             => sse.publishResync(docKey),
    onBuildsChanged: (bucket)             => sse.publishBucket(bucket, 'builds-changed', { bucket }),
  });
}

let server = null;
let scheme = 'http';
if (config.sslCert && config.sslKey) {
  try {
    server = https.createServer({
      cert: fs.readFileSync(config.sslCert),
      key:  fs.readFileSync(config.sslKey),
    }, app);
    scheme = 'https';
  } catch (e) {
    console.error(`SSL_CERT/SSL_KEY are set but could not be read (${e.message}) — falling back to HTTP.`);
  }
}
if (!server) server = http.createServer(app);

server.listen(port, config.httpListen, () => {
  console.log(`Greenboard running on ${scheme}://${config.httpListen}:${port}`);
  startRefresher();
  db.getReadiness('server').catch(() => {});
  db.startBuildBarsSnapshot();
  db.startJobsPrewarm('server');
  db.getVersions('server')
    .then((vs) => {
      const v = vs && vs[0];
      db.startStabilitySnapshot(v ? { bucket: 'server', version: v } : undefined);
    })
    .catch(() => db.startStabilitySnapshot());
});
