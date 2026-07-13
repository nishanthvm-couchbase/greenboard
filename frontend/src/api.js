import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

export const api = {
  getVersions:    (bucket)                   => http.get(`/versions/${bucket}`).then(r => r.data),
  getBuilds:      (bucket, version, bf, filters) => {
    const params = {};
    if (filters?.platforms?.length) params.platforms = filters.platforms.join(',');
    if (filters?.features?.length)  params.features  = filters.features.join(',');
    return http.get(`/builds/${bucket}/${version}/0/${bf || 10}`, { params }).then(r => r.data);
  },
  getJobs:        (build, bucket)            => http.get(`/jobs/${build}/${bucket}`).then(r => r.data),
  getBuildSummary:(buildId)                  => http.get(`/getBuildSummary/${buildId}`).then(r => r.data),
  saveClaim:      (bucket, name, buildId, body) => http.post(`/claim/${bucket}/${name}/${buildId}`, body).then(r => r.data),
  getTrend:       (docId)                    => http.get(`/trend/${encodeURIComponent(docId)}`).then(r => r.data),
  getJobTrend:    (bucket, version, os, component, name) =>
                    http.get(`/jobtrend/${bucket}/${version}`, { params: { os, component, name } }).then(r => r.data),
  getReport:      (version, component)       => http.get(`/report/${version}/${component}`).then(r => r.data),
  getComponentReport: (build, component)     => http.get('/component-report', { params: { build, component } }).then(r => r.data),
  getAnalysis:    (name, build) => http.get('/analysis', { params: { name, build } }).then(r => r.data),
  getJiraMeta:    ()            => http.get('/jira/meta').then(r => r.data),
  getJiraAggregate:(jql, groupBy) => http.get('/jira/aggregate', { params: { jql, groupBy } }).then(r => r.data),
  getReadiness:   (bucket, versions)         => http.get(`/dashboard/readiness/${bucket}`, { params: versions ? { versions } : {} }).then(r => r.data),
  getBuildBars:   (bucket, version, n, minTests) => http.get(`/dashboard/buildbars/${bucket}/${version}`, { params: { n, minTests } }).then(r => r.data),
  getStability:   (bucket, version)          => http.get(`/stability/${bucket}/${version}`).then(r => r.data),
  getDefaultBuild:(bucket, version)          => http.get(`/dashboard/defaultbuild/${bucket}/${version}`).then(r => r.data),
  getTokens:      ()                         => http.get('/tokens').then(r => r.data),
  getFleet:       ()                         => http.get('/fleet').then(r => r.data),
  getFleetNode:   (ip)                       => http.get(`/fleet/${encodeURIComponent(ip)}`).then(r => r.data),
  getCompareBuilds:(bucket, version)         => http.get(`/compare/builds/${bucket}/${version}`).then(r => r.data),
  getCompareJobs: (bucket, builds)           => http.get(`/compare/jobs/${bucket}`, { params: { builds: builds.join(',') } }).then(r => r.data),
  rerunJob:       (body)                     => http.post('/rerunJob', body).then(r => r.data),
};
