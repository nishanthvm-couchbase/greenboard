'use strict';

const fs     = require('fs');
const config = require('./config');

const AUTHZ_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

let _tokens    = undefined;
let _refreshing = null;

function _load() {
  if (_tokens !== undefined) return _tokens;
  try {
    _tokens = fs.existsSync(config.jiraTokenStore)
      ? JSON.parse(fs.readFileSync(config.jiraTokenStore, 'utf8'))
      : null;
  } catch (e) {
    console.error('[jira-oauth] could not read token store:', e.message);
    _tokens = null;
  }
  return _tokens;
}

function _save(tok) {
  _tokens = tok;
  try {
    fs.writeFileSync(config.jiraTokenStore, JSON.stringify(tok, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('[jira-oauth] could not write token store:', e.message);
  }
}

function isConfigured() {
  return !!(config.jiraClientId && config.jiraClientSecret && config.jiraCloudId);
}

function isConnected() {
  return !!(_load() && _tokens.refresh_token);
}

function authorizeUrl(state) {
  const p = new URLSearchParams({
    audience:      'api.atlassian.com',
    client_id:     config.jiraClientId,
    scope:         config.jiraScopes,
    redirect_uri:  config.jiraRedirectUri,
    state,
    response_type: 'code',
    prompt:        'consent',
  });
  return `${AUTHZ_URL}?${p.toString()}`;
}

async function _postToken(body) {
  const resp = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function exchangeCode(code) {
  const d = await _postToken({
    grant_type:    'authorization_code',
    client_id:     config.jiraClientId,
    client_secret: config.jiraClientSecret,
    code,
    redirect_uri:  config.jiraRedirectUri,
  });
  _save({
    access_token:  d.access_token,
    refresh_token: d.refresh_token,
    scope:         d.scope,
    expires_at:    Date.now() + (d.expires_in - 60) * 1000,
  });
}

async function _doRefresh() {
  const t = _load();
  if (!t || !t.refresh_token) throw new Error('not connected to Jira (no refresh token)');
  const d = await _postToken({
    grant_type:    'refresh_token',
    client_id:     config.jiraClientId,
    client_secret: config.jiraClientSecret,
    refresh_token: t.refresh_token,
  });
  _save({
    access_token:  d.access_token,
    refresh_token: d.refresh_token || t.refresh_token,
    scope:         d.scope || t.scope,
    expires_at:    Date.now() + (d.expires_in - 60) * 1000,
  });
  return _tokens.access_token;
}

// Coalesce concurrent refreshes: Atlassian rotates refresh tokens, so never refresh twice in parallel.
function _refresh() {
  if (!_refreshing) _refreshing = _doRefresh().finally(() => { _refreshing = null; });
  return _refreshing;
}

async function getAccessToken() {
  const t = _load();
  if (!t) throw new Error('Jira not connected — an admin must visit /api/jira/oauth/login');
  if (t.access_token && t.expires_at && Date.now() < t.expires_at) return t.access_token;
  return _refresh();
}

module.exports = {
  isConfigured,
  isConnected,
  authorizeUrl,
  exchangeCode,
  getAccessToken,
  forceRefresh: _refresh,
};
