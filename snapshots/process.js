'use strict';

const _ = require('lodash');

function parseRaw(raw) {
  if (raw === null || raw === undefined) return null;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    const s = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
      .toString()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    return JSON.parse(s);
  }
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}

// TEMP alias 2I->2I_MOI until gb_label backfill lands; revert with COMPONENT_ALIAS = {}.
const COMPONENT_ALIAS = { '2I': '2I_MOI' };
function canonComponent(c) {
  return (c && COMPONENT_ALIAS[c]) || c;
}

function jobKey(j) {
  return `${j.os}|${j.component}|${j.name}|${j.build_id}`;
}

function processBuildDoc(buildDoc, existingDoc, bucket, build) {
  if (!buildDoc) throw new Error(`Build document missing for ${build}_${bucket}`);

  const version      = build.split('-')[0];
  const existingJobs = existingDoc?.[bucket] || {};

  const ranDisplayNames = {};
  const ranByComponent  = {};
  const liveDisplayNames = {};
  _.forEach(buildDoc.os, (components, os) => {
    _.forEach(components, (jobsByName, component) => {
      const set  = new Set();
      const cset = ranByComponent[component] || (ranByComponent[component] = new Set());
      const live = liveDisplayNames[`${os}__${component}`] = new Set();
      _.forEach(jobsByName, (runs, jobKey) => {
        if (!Array.isArray(runs)) return;
        set.add(jobKey);
        cset.add(jobKey);
        for (const r of runs) {
          const dn = r.displayName || jobKey;
          set.add(dn); cset.add(dn);
          if (!r.deleted) live.add(dn);
        }
      });
      ranDisplayNames[`${os}__${component}`] = set;
    });
  });

  const pendingKeys = new Set();

  _.forEach(existingJobs, (components, os) => {
    _.forEach(components, (jobsByName, component) => {
      _.forEach(jobsByName, (meta, jobName) => {
        if (!buildDoc.os?.[os])              _.set(buildDoc, ['os', os], {});
        if (!buildDoc.os?.[os]?.[component]) _.set(buildDoc, ['os', os, component], {});

        const ranSet     = ranDisplayNames[`${os}__${component}`];
        const hasRun     = (ranSet && ranSet.has(jobName)) ||
                           (ranByComponent[component] && ranByComponent[component].has(jobName));
        const jobIn      = meta.jobs_in && meta.jobs_in.includes(version);
        const notDeleted = !meta.deleted || !meta.deleted.includes(version);

        if (!hasRun && jobIn && notDeleted && bucket !== 'operator') {
          buildDoc.os[os][component][jobName] = [{
            pending:    meta.totalCount || 0,
            totalCount: 0, failCount: 0, skipCount: 0,
            result:     'PENDING', priority: meta.priority || 'P1',
            url:        meta.url || '', build_id: '',
            claim: '', deleted: false, olderBuild: false,
            duration: 0, color: '', bugs: [], triage: '', servers: [],
            ...(meta.server_version ? { server_version: meta.server_version } : {}),
          }];
          pendingKeys.add(`${os}|${component}|${jobName}`);
        }
      });
    });
  });

  const flat = [];
  _.forEach(buildDoc.os, (components, os) => {
    _.forEach(components, (jobsByName, component) => {
      _.forEach(jobsByName, (runs, jobName) => {
        if (!Array.isArray(runs)) return;
        const totalDuration = runs.reduce((s, r) => s + (r.duration || 0), 0);
        const allDeleted    = runs.every(r => r.deleted);

        runs.forEach(run => {
          const job = _.cloneDeep(run);
          job.name          = jobName;
          job.displayName   = job.displayName || jobName;
          job.component     = canonComponent(component);
          job.os            = os;
          job.build         = buildDoc.build || build;
          job.runCount      = runs.length;
          job.totalDuration = totalDuration;
          job.skipCount     = job.skipCount  || 0;
          job.bugs          = job.bugs       || [];
          job.triage        = job.triage     || '';
          job.servers       = job.servers    || [];
          flat.push(job);
        });

        if (allDeleted) {
          const dn   = runs[0]?.displayName || jobName;
          const pk   = `${os}|${component}|${dn}`;
          const live = liveDisplayNames[`${os}__${component}`];
          const meta = existingJobs[os]?.[component]?.[dn];
          if (!pendingKeys.has(pk) && !(live && live.has(dn)) &&
              meta && meta.jobs_in && meta.jobs_in.includes(version)) {
            pendingKeys.add(pk);
            flat.push({
              name: dn, displayName: dn,
              component: canonComponent(component), os, build: buildDoc.build || build,
              pending: meta.totalCount || 0,
              totalCount: 0, failCount: 0, skipCount: 0,
              result: 'PENDING', priority: meta.priority || 'P1',
              url: meta.url || '', build_id: '',
              claim: '', deleted: false, olderBuild: false,
              duration: 0, totalDuration: 0, color: '', bugs: [], triage: '', servers: [],
              runCount: 0, allRuns: [],
            });
          }
        }
      });
    });
  });

  const rows = [];
  const seenKeys = new Set();
  for (const j of flat) {
    const k = jobKey(j);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    rows.push(j);
  }

  const byName = _.groupBy(rows, j => `${j.os}__${j.component}__${j.name}`);
  const sharedRuns = {};
  for (const [key, grp] of Object.entries(byName)) {
    sharedRuns[key] = grp.map(r => ({
      build_id: r.build_id, result: r.result, totalCount: r.totalCount,
      failCount: r.failCount, skipCount: r.skipCount, duration: r.duration,
      timestamp: r.timestamp, url: r.url,
    }));
  }
  rows.forEach(job => {
    job.allRuns = sharedRuns[`${job.os}__${job.component}__${job.name}`] || [];
  });

  return rows;
}

module.exports = { parseRaw, jobKey, processBuildDoc, canonComponent };
