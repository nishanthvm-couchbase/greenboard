import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as d3 from 'd3';
import { BarChart3, Play, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '../../api';
import Dropdown from '../Common/Dropdown';

const GROUP_BY_OPTS = [
  { value: 'assignee',  label: 'Assignee' },
  { value: 'component', label: 'Component' },
  { value: 'status',    label: 'Status' },
];
const TOP_N = 12;
const PALETTE = [
  '#6366f1', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7',
  '#94a3b8', '#0ea5e9', '#f97316', '#eab308', '#14b8a6', '#ec4899', '#64748b',
];

function Donut({ groups, total }) {
  const ref = useRef(null);
  const rows = useMemo(() => {
    if (!groups?.length) return [];
    const top = groups.slice(0, TOP_N);
    const rest = groups.slice(TOP_N).reduce((s, g) => s + g.count, 0);
    return rest > 0 ? [...top, { name: 'Other…', count: rest }] : top;
  }, [groups]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    if (!rows.length) return;

    const W = 220, H = 220, R = Math.min(W, H) / 2;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H)
      .append('g').attr('transform', `translate(${W / 2},${H / 2})`);

    const color = d3.scaleOrdinal().domain(rows.map(r => r.name)).range(PALETTE);
    const pie = d3.pie().sort(null).value(d => d.count);
    const arc = d3.arc().innerRadius(R * 0.62).outerRadius(R - 2);

    svg.selectAll('path').data(pie(rows)).enter().append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.name))
      .attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 1)
      .append('title').text(d => `${d.data.name}: ${d.data.count}`);

    svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em')
      .attr('font-size', '26px').attr('font-weight', '700').attr('fill', 'currentColor')
      .text(total);
    svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.4em')
      .attr('font-size', '10px').attr('fill', '#94a3b8')
      .attr('letter-spacing', '0.08em').text('ISSUES');
  }, [rows, total]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div ref={ref} className="text-gray-900 dark:text-gray-100 flex-shrink-0" />
      <div className="flex-1 w-full min-w-0">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-b border-gray-100 dark:border-white/[0.05] last:border-0">
                <td className="py-1.5 pr-2 w-4">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: PALETTE[i % PALETTE.length] }} />
                </td>
                <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300 truncate max-w-[260px]">{r.name}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JiraInsights() {
  const { data: meta } = useQuery({ queryKey: ['jira-meta'], queryFn: api.getJiraMeta, retry: false });
  const { data: versions = [] } = useQuery({
    queryKey: ['versions', 'server'], queryFn: () => api.getVersions('server'), retry: false,
  });

  const [version, setVersion]     = useState(null);
  const [presetKey, setPresetKey] = useState(null);
  const [jql, setJql]             = useState('');
  const [groupBy, setGroupBy]     = useState('assignee');
  const [applied, setApplied]     = useState(null);

  const codename = (v) => (meta?.codenames?.[v]) || v;
  const buildJql = (preset, v) => (preset?.jql || '').replace(/\{VERSION\}/g, codename(v));

  useEffect(() => {
    if (!meta?.presets?.length || !versions.length || version) return;
    const v = versions.find(x => meta.codenames?.[x]) || versions[0];
    const p = meta.presets[0];
    const q = buildJql(p, v);
    setVersion(v); setPresetKey(p.key); setGroupBy(p.groupBy || 'assignee');
    setJql(q); setApplied({ jql: q, groupBy: p.groupBy || 'assignee' });
  }, [meta, versions, version]);

  const rerun = (q, gb) => setApplied({ jql: q, groupBy: gb });

  const onVersion = (v) => {
    setVersion(v);
    const p = meta.presets.find(x => x.key === presetKey) || meta.presets[0];
    const q = buildJql(p, v); setJql(q); rerun(q, groupBy);
  };
  const onPreset = (key) => {
    const p = meta.presets.find(x => x.key === key); if (!p) return;
    setPresetKey(key); const q = buildJql(p, version);
    setJql(q); setGroupBy(p.groupBy || 'assignee'); rerun(q, p.groupBy || 'assignee');
  };
  const onGroupBy = (gb) => { setGroupBy(gb); rerun(jql, gb); };

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['jira-agg', applied?.jql, applied?.groupBy],
    queryFn:  () => api.getJiraAggregate(applied.jql, applied.groupBy),
    enabled:  !!applied?.jql,
    retry: false,
  });

  const jiraSearchUrl = applied?.jql
    ? `${''}https://issues.couchbase.com/issues/?jql=${encodeURIComponent(applied.jql)}` : null;

  if (meta && !meta.enabled) {
    return (
      <section className="card p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Jira Insights</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Jira OAuth isn't configured on the server. Set <code className="font-mono">JIRA_CLIENT_ID</code> and{' '}
            <code className="font-mono">JIRA_CLIENT_SECRET</code> (from the 3LO app) and restart.
          </p>
        </div>
      </section>
    );
  }

  if (meta && meta.enabled && !meta.connected) {
    return (
      <section className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <BarChart3 size={18} className="text-brand-500 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Jira Insights</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Connect to Jira once to enable live JQL → chart (no more manual screenshots).
            A one-time admin consent — tokens refresh automatically afterward.
          </p>
        </div>
        <a href="/api/jira/oauth/login"
           className="btn btn-primary self-start sm:self-center flex items-center gap-1.5 whitespace-nowrap">
          <Play size={14} /> Connect to Jira
        </a>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <BarChart3 size={16} className="text-brand-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mr-auto">Jira Insights</h2>
        <Dropdown size="sm" value={presetKey || ''} onChange={onPreset}
                  options={(meta?.presets || []).map(p => ({ value: p.key, label: p.label }))}
                  placeholder="Preset" />
        <Dropdown size="sm" value={version || ''} onChange={onVersion}
                  options={versions.map(v => ({ value: v, label: codename(v) === v ? v : `${v} · ${codename(v)}` }))}
                  placeholder="Version" />
        <Dropdown size="sm" value={groupBy} onChange={onGroupBy} options={GROUP_BY_OPTS} />
      </div>

      <div className="flex gap-2 items-stretch mb-4">
        <textarea
          value={jql}
          onChange={e => setJql(e.target.value)}
          rows={2}
          spellCheck={false}
          className="flex-1 font-mono text-xs rounded-lg px-3 py-2 resize-y
                     bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10
                     text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          placeholder="Enter JQL…"
        />
        <button onClick={() => rerun(jql, groupBy)} disabled={!jql.trim()}
                className="btn btn-primary self-stretch px-4 disabled:opacity-50">
          <Play size={14} /> Run
        </button>
      </div>

      {isFetching && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isError && !isFetching && (
        <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">
          {error?.response?.data?.error || error?.message || 'Jira query failed.'}
        </p>
      )}
      {data && !isFetching && (
        <>
          <Donut groups={data.groups} total={data.total} />
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            <span><b className="text-gray-600 dark:text-gray-300">{data.total}</b> issues · grouped by {data.groupBy}</span>
            {data.capped && <span className="text-amber-500">(showing first {data.total} of {data.reportedTotal})</span>}
            {jiraSearchUrl && (
              <a href={jiraSearchUrl} target="_blank" rel="noreferrer"
                 className="ml-auto text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                Open in Jira <ExternalLink size={11} />
              </a>
            )}
          </div>
        </>
      )}
    </section>
  );
}
