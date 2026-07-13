const fs   = require('fs');
const path = require('path');

exports.Cluster         = process.env.CB_HOST    || '172.23.105.219';
exports.RBACUser        = process.env.CB_USER    || 'Administrator';
exports.RBACPassword    = process.env.CB_PASS    || '';
exports.httpPort        = process.env.PORT       || 3000;
exports.httpListen      = process.env.LISTEN     || '0.0.0.0';
exports.sslCert         = process.env.SSL_CERT   || null;
exports.sslKey          = process.env.SSL_KEY    || null;

exports.fleetHost       = process.env.FLEET_HOST   || '172.23.217.21';
exports.fleetUser       = process.env.FLEET_USER   || 'Administrator';
exports.fleetPass       = process.env.FLEET_PASS   || '';
exports.fleetBucket     = process.env.FLEET_BUCKET || 'QE-server-pool';

exports.tokenCreditsPerM = Number(process.env.CREDITS_PER_1M_TOKENS || 1_000_000);

exports.stabilityK         = Number(process.env.STABILITY_K || 15);
exports.stabilityThreshold = Number(process.env.STABILITY_THRESHOLD || 0.70);
exports.stabilityFullPct   = Number(process.env.STABILITY_FULL_PCT || 0.60);
exports.stabilityRefreshMs = Number(process.env.STABILITY_REFRESH_MS || 600_000);

exports.prewarmVersions     = Number(process.env.PREWARM_VERSIONS      || 3);
exports.prewarmBuildsPerVer = Number(process.env.PREWARM_BUILDS_PER_VER || 3);
exports.prewarmRefreshMs    = Number(process.env.PREWARM_REFRESH_MS    || 600_000);
exports.prewarmMinTests     = Number(process.env.PREWARM_MIN_TESTS     || 2000);

exports.readinessMinTests   = Number(process.env.READINESS_MIN_TESTS   || 2000);

function readJiraToken() {
  if (process.env.JIRA_TOKEN) return process.env.JIRA_TOKEN.trim();
  const f = process.env.JIRA_TOKEN_FILE;
  try { if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim(); } catch (_) {}
  return null;
}
exports.jiraBaseUrl = process.env.JIRA_BASE_URL || 'https://couchbasecloud.atlassian.net';
exports.jiraToken   = readJiraToken();
exports.jiraEmail   = process.env.JIRA_EMAIL || 'nishanth.vm@couchbase.com';
exports.jiraCloudId = '7fa05bac-b453-4b39-9ec3-830a6365e08a';

exports.jiraEnabled = process.env.JIRA_ENABLED === 'true';

function readSecret(envVal, fileEnv) {
  if (envVal) return envVal.trim();
  const f = process.env[fileEnv];
  try { if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim(); } catch (_) {}
  return null;
}
exports.jiraClientId     = process.env.JIRA_CLIENT_ID || null;
exports.jiraClientSecret = readSecret(process.env.JIRA_CLIENT_SECRET, 'JIRA_CLIENT_SECRET_FILE');
exports.jiraRedirectUri  = process.env.JIRA_REDIRECT_URI
                         || 'https://greenboard.sc.couchbase.com:3000/api/jira/oauth/callback';
exports.jiraScopes       = process.env.JIRA_SCOPES || 'read:jira-work read:jira-user offline_access';
exports.jiraTokenStore   = process.env.JIRA_TOKEN_STORE || path.join(__dirname, '.jira_tokens.json');

exports.versionCodenames = {
  '8.0.0': 'Morpheus',
  '8.1.0': 'Totoro',
};

exports.jiraPresets = [
  {
    key: 'bfv_by_owner',
    label: 'BFVs by owner',
    groupBy: 'assignee',
    jql: 'project = MB AND issuetype in (Bug, Improvement) AND fixVersion = "{VERSION}" '
       + 'AND status = Resolved AND (labels is EMPTY OR labels not in (request-dev-verify, performance))',
  },
  {
    key: 'open_bugs',
    label: 'Open bugs (this release)',
    groupBy: 'assignee',
    jql: 'project in (MB, "Couchbase Server Development") AND resolution = Unresolved '
       + 'AND issuetype = Bug AND fixVersion = "{VERSION}"',
  },
  {
    key: 'bugs_by_component',
    label: 'Bugs by component',
    groupBy: 'component',
    jql: 'project = MB AND issuetype = Bug AND fixVersion = "{VERSION}"',
  },
];
