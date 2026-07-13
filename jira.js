'use strict';

const config = require('./config');
const oauth  = require('./jira_oauth');

const PAGE = 100;
const MAX_TOTAL = 5000;

const FIELDS_FOR = {
  assignee:  ['assignee'],
  status:    ['status'],
  component: ['components'],
};

function searchUrl() {
  return `https://api.atlassian.com/ex/jira/${config.jiraCloudId}/rest/api/3/search/jql`;
}

function postSearch(token, body) {
  return fetch(searchUrl(), {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function searchAll(jql, fields) {
  if (!oauth.isConnected()) {
    throw new Error('Jira not connected — an admin must visit /api/jira/oauth/login to authorize.');
  }
  const issues = [];
  let nextPageToken;
  let capped = false;
  let token  = await oauth.getAccessToken();

  while (true) {
    const body = { jql, maxResults: PAGE, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    let resp = await postSearch(token, body);
    if (resp.status === 401) {
      token = await oauth.forceRefresh();
      resp  = await postSearch(token, body);
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Jira HTTP ${resp.status}: ${text.slice(0, 400)}`);
    }
    const data = await resp.json();
    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
    if (data.isLast || !nextPageToken) break;
    if (issues.length >= MAX_TOTAL) { capped = true; break; }
  }
  return { issues, reportedTotal: issues.length, capped };
}

function keysFor(issue, groupBy) {
  const f = issue.fields || {};
  if (groupBy === 'status')    return [f.status ? f.status.name : 'Unknown'];
  if (groupBy === 'component') {
    const cs = f.components || [];
    return cs.length ? cs.map(c => c.name) : ['(no component)'];
  }
  return [f.assignee ? f.assignee.displayName : 'Unassigned'];
}

function aggregate(issues, groupBy) {
  const counts = {};
  for (const it of issues) {
    for (const k of keysFor(it, groupBy)) counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

async function jqlAggregate(jql, groupBy) {
  const gb = FIELDS_FOR[groupBy] ? groupBy : 'assignee';
  const { issues, reportedTotal, capped } = await searchAll(jql, FIELDS_FOR[gb]);
  return {
    groupBy: gb,
    total: issues.length,
    reportedTotal,
    capped,
    groups: aggregate(issues, gb),
  };
}

module.exports = { jqlAggregate };
