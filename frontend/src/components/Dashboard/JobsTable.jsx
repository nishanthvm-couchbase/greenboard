import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  ExternalLink, RefreshCw, TrendingUp, Copy, Check, Sparkles, Info, X,
  Search as SearchIcon,
} from 'lucide-react';
import StatusBadge, { STATUS_ROW_BG } from '../Common/StatusBadge';
import Dropdown from '../Common/Dropdown';
import { useStore } from '../../store';

const TABS = [
  { id: 'all',      label: 'All',       color: '#6366f1' },
  { id: 'failure',  label: 'Failed',    color: '#ef4444' },
  { id: 'inst_fail',label: 'Inst Fail', color: '#f97316' },
  { id: 'unstable', label: 'Unstable',  color: '#f59e0b' },
  { id: 'aborted',  label: 'Aborted',   color: '#64748b' },
  { id: 'pending',  label: 'Pending',   color: '#38bdf8' },
  { id: 'success',  label: 'Passed',    color: '#10b981' },
  { id: 'skipped',  label: 'Skipped',   color: '#a78bfa' },
];

const STATUS_EDGE = {
  SUCCESS:   '#10b981',
  FAILURE:   '#ef4444',
  UNSTABLE:  '#f59e0b',
  ABORTED:   '#475569',
  PENDING:   '#38bdf8',
  INST_FAIL: '#f97316',
};

function tabCount(jobs, id, searching) {
  if (id === 'all')      return searching ? jobs.length : jobs.filter(j => j.result !== 'PENDING').length;
  if (id === 'skipped')  return jobs.filter(j => j.skipCount > 0).length;
  return jobs.filter(j => j.result === id.toUpperCase()).length;
}

function fmt(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function SortIcon({ field, sort }) {
  if (sort.field !== field) return <ArrowUpDown size={12} className="text-gray-300" />;
  return sort.asc ? <ArrowUp size={12} className="text-brand-600" /> : <ArrowDown size={12} className="text-brand-600" />;
}

function CopyBtn({ jobs }) {
  const [copied, setCopied] = useState(false);
  const copyJobs = () => {
    const names = jobs.map(j => {
      let n = j.displayName || j.name || '';
      const idx = n.indexOf('_');
      if (idx > -1) n = n.slice(idx + 1);
      const bsIdx = n.indexOf('bucket_storage');
      if (bsIdx > -1) n = n.slice(0, bsIdx);
      return n.trim();
    }).filter(Boolean).join(',');
    navigator.clipboard.writeText(names);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copyJobs} className="btn btn-ghost text-xs gap-1.5">
      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy Jobs'}
    </button>
  );
}

function AutoTriageModal({ job, onClose }) {
  if (!job) return null;
  // Portal to body: the card's backdrop-filter would otherwise anchor a fixed element to the card.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Info size={18} className="text-brand-600 dark:text-brand-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Auto Triage</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{job.displayName || job.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <div
          className="px-6 py-4 max-h-[60vh] overflow-y-auto text-sm text-gray-700 dark:text-gray-300 leading-relaxed break-words"
          dangerouslySetInnerHTML={{ __html: job.claim || '' }}
        />
      </div>
    </div>,
    document.body
  );
}

export default function JobsTable({
  jobs = [],
  loading,
  target,
  changedKeys,
  onOpenRuns,
  onOpenTrend,
  onOpenAIReport,
  onOpenTestAnalysis,
  onClaim,
  onRerun,
}) {
  const { activeTab, setActiveTab, jobsPerPage, setJobsPerPage, searchQuery, setSearchQuery } = useStore();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ field: 'result', asc: true });
  const [autoTriageJob, setAutoTriageJob] = useState(null);
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Must match Dashboard's searchQuery.trim() test, or a whitespace query desyncs the pending-in-All handling.
  const searching = !!(searchQuery && searchQuery.trim());

  const displayed = useMemo(() => {
    let list = jobs;
    if (activeTab === 'all') {
      if (!searching) list = list.filter(j => j.result !== 'PENDING');
    } else {
      const tabMap = {
        success:   j => j.result === 'SUCCESS',
        failure:   j => j.result === 'FAILURE',
        unstable:  j => j.result === 'UNSTABLE',
        aborted:   j => j.result === 'ABORTED',
        pending:   j => j.result === 'PENDING',
        inst_fail: j => j.result === 'INST_FAIL',
        skipped:   j => (j.skipCount || 0) > 0,
      };
      if (tabMap[activeTab]) list = list.filter(tabMap[activeTab]);
    }
    return list;
  }, [jobs, searching, activeTab]);

  const sorted = useMemo(() => {
    const arr = [...displayed];
    arr.sort((a, b) => {
      let va = a[sort.field], vb = b[sort.field];
      if (sort.field === 'servers') { va = (a.servers || []).length; vb = (b.servers || []).length; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sort.asc ? -1 :  1;
      if (va > vb) return sort.asc ?  1 : -1;
      return 0;
    });
    return arr;
  }, [displayed, sort]);

  const total    = sorted.length;
  const perPage  = jobsPerPage === 'all' ? total : Number(jobsPerPage);
  const pages    = Math.max(1, Math.ceil(total / perPage));
  const pageJobs = jobsPerPage === 'all' ? sorted : sorted.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (field) => {
    setSort(s => s.field === field ? { field, asc: !s.asc } : { field, asc: true });
    setPage(1);
  };

  const s3Link = (job) => {
    const urlParts = (job.url || '').split('/').filter(Boolean);
    const jobName  = urlParts[urlParts.length - 2] || '';
    const buildNo  = urlParts[urlParts.length - 1] || '';
    if (!/^\d+$/.test(buildNo)) return null;
    return `http://cb-logs-qe.s3-website-us-west-2.amazonaws.com/${job.build}/jenkins_logs/${jobName}/${buildNo}/`;
  };

  const Th = ({ field, children }) => (
    <th className="tbl-head cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1 whitespace-nowrap">{children} <SortIcon field={field} sort={sort} /></div>
    </th>
  );

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
        <div className="relative flex-1 max-w-xl">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search jobs by name, component, platform…"
            className="input pl-10 pr-24 py-2.5 text-sm rounded-xl"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchQuery ? (
              <>
                <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">
                  {jobs.length.toLocaleString()} found
                </span>
                <button
                  onClick={() => { setSearchQuery(''); setPage(1); searchRef.current?.focus(); }}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-gray-400
                             hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/10 transition-colors"
                >
                  ✕
                </button>
              </>
            ) : (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded-md
                              text-gray-400 border border-gray-200 bg-gray-50
                              dark:text-gray-500 dark:border-white/10 dark:bg-white/[0.04]">
                /
              </kbd>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {jobsPerPage !== 'all' && pages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">‹</button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const n = Math.max(1, Math.min(pages - 4, page - 2)) + i;
                return n <= pages ? (
                  <button key={n} onClick={() => setPage(n)}
                    className={`btn text-xs py-1 px-2.5 ${n === page ? 'btn-primary' : 'btn-ghost'}`}>{n}</button>
                ) : null;
              })}
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">›</button>
            </div>
          )}
          <CopyBtn jobs={pageJobs} />
          <Dropdown
            size="sm"
            value={String(jobsPerPage)}
            onChange={v => { setJobsPerPage(v === 'all' ? 'all' : Number(v)); setPage(1); }}
            options={[20, 50, 100, 500, 'all'].map(v => ({
              value: String(v), label: v === 'all' ? 'All' : `${v} / page`,
            }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] overflow-x-auto">
        {TABS.map(t => {
          const cnt    = tabCount(jobs, t.id, searching);
          const active = activeTab === t.id;
          if (cnt === 0 && t.id !== 'all') return null;
          return (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setPage(1); }}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                          text-xs font-semibold transition-all duration-150
                          ${active ? '' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]'}`}
              style={active ? {
                background: t.color + '18',
                color: t.color,
                boxShadow: `inset 0 0 0 1px ${t.color}50`,
              } : {}}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: t.color,
                  opacity: active ? 1 : 0.45,
                  boxShadow: active ? `0 0 6px ${t.color}` : 'none',
                }}
              />
              {t.label}
              <span className={`tabular-nums font-bold ${active ? '' : 'text-gray-400 dark:text-gray-500'}`}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <p className="text-sm">No jobs match the current filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 74 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 128 }} />
            </colgroup>
            <thead className="sticky top-0 bg-gray-50/95 dark:bg-[#0d1322f2]" style={{ backdropFilter: "blur(8px)" }}>
              <tr>
                <Th field="displayName">Job Name</Th>
                <Th field="os">Platform</Th>
                <Th field="component">Component</Th>
                <Th field="result">Status</Th>
                <Th field="totalCount">Tests</Th>
                <Th field="failCount">Fails</Th>
                <Th field="servers">Servers</Th>
                <th className="tbl-head text-center"><span className="whitespace-nowrap">Auto Triage</span></th>
                <Th field="totalDuration">Duration</Th>
                <th className="tbl-head"><span className="whitespace-nowrap">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {pageJobs.map(job => {
                const liveKey = `${job.os}|${job.component}|${job.name}|${job.build_id}`;
                const pulsing = changedKeys?.has(liveKey);
                const edge = STATUS_EDGE[job.result];
                const hasClaim = job.claim && job.claim.trim();
                return (
                <tr key={liveKey}
                    className={`tbl-row ${STATUS_ROW_BG[job.result] || ''} ${pulsing ? 'row-pulse' : ''}`}
                    style={edge && !pulsing ? { boxShadow: `inset 2.5px 0 0 ${edge}55` } : {}}>
                  <td className="tbl-cell">
                    <button
                      onClick={() => onOpenRuns?.(job)}
                      className="font-medium text-gray-800 hover:text-brand-600 dark:text-gray-200 dark:hover:text-brand-300 transition-colors truncate text-left block max-w-full"
                      title={job.displayName || job.name}
                    >
                      {job.displayName || job.name}
                    </button>
                  </td>
                  <td className="tbl-cell">
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/[0.07] dark:text-gray-300 dark:ring-white/10 px-1.5 py-0.5 rounded ring-1 ring-inset">
                      {job.os || '—'}
                    </span>
                  </td>
                  <td className="tbl-cell">
                    <span className="text-xs text-gray-400 truncate block" title={job.component || ''}>{job.component || '—'}</span>
                  </td>
                  <td className="tbl-cell">
                    <StatusBadge result={job.result} />
                  </td>
                  <td className="tbl-cell tabular-nums text-gray-700 dark:text-gray-300">
                    <div className="flex flex-col gap-1">
                      <span>{(job.totalCount || 0).toLocaleString()}</span>
                      {(job.totalCount || 0) > 0 && (
                        <span className="flex w-12 h-[3px] rounded-full overflow-hidden bg-gray-100 dark:bg-white/10">
                          <span style={{
                            width: `${((job.totalCount - (job.failCount || 0)) / job.totalCount) * 100}%`,
                            background: '#10b981',
                          }} />
                          <span style={{
                            width: `${((job.failCount || 0) / job.totalCount) * 100}%`,
                            background: '#ef4444',
                          }} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="tbl-cell tabular-nums">
                    {job.failCount > 0
                      ? <span className="text-red-600 dark:text-red-400 font-medium">{job.failCount.toLocaleString()}</span>
                      : <span className="text-gray-300 dark:text-gray-600">—</span>
                    }
                  </td>
                  <td className="tbl-cell tabular-nums text-gray-500 text-xs">
                    {(job.servers?.length)
                      ? job.servers.length
                      : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="tbl-cell text-center">
                    {hasClaim
                      ? <button onClick={e => { e.stopPropagation(); setAutoTriageJob(job); }} title="View Auto Triage"
                          className="inline-flex p-1.5 rounded-md text-brand-500 hover:text-white hover:bg-brand-600 dark:text-brand-400 transition-colors">
                          <Info size={16} />
                        </button>
                      : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                    }
                  </td>
                  <td className="tbl-cell text-gray-500 tabular-nums text-xs">
                    {fmt(job.totalDuration || job.duration)}
                  </td>
                  <td className="tbl-cell">
                    <div className="flex items-center gap-1.5">
                      {job.result !== 'PENDING' && (
                        <button onClick={() => onOpenTrend?.(job)} title="Trend"
                          className="p-1.5 rounded-md text-brand-500 dark:text-brand-400 hover:text-white hover:bg-brand-600 transition-colors">
                          <TrendingUp size={16} />
                        </button>
                      )}
                      {job.result !== 'PENDING' && job.result !== 'SUCCESS' && (
                        <button onClick={() => onOpenTestAnalysis?.(job)} title="Test Analysis"
                          className="p-1.5 rounded-md text-fuchsia-500 dark:text-fuchsia-400 hover:text-white hover:bg-fuchsia-600 transition-colors">
                          <Sparkles size={16} />
                        </button>
                      )}
                      {s3Link(job) && (
                        <a href={s3Link(job)} target="_blank" rel="noreferrer" title="S3 Logs"
                          className="p-1.5 rounded-md text-amber-500 dark:text-amber-400 hover:text-white hover:bg-amber-600 transition-colors">
                          <ExternalLink size={16} />
                        </a>
                      )}
                      {job.result !== 'SUCCESS' && job.result !== 'PENDING' && (job.url || '').includes('test_suite_executor') && (job.runCount || 0) <= 2 && (
                        <button onClick={() => onRerun?.(job)} title="Rerun"
                          className="p-1.5 rounded-md text-emerald-500 dark:text-emerald-400 hover:text-white hover:bg-emerald-600 transition-colors">
                          <RefreshCw size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && total > 0 && jobsPerPage !== 'all' && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
          <p className="text-xs text-gray-500">
            {((page-1)*perPage)+1}–{Math.min(page*perPage, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)}      disabled={page===1}     className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">«</button>
            <button onClick={() => setPage(p=>p-1)} disabled={page===1}     className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">‹</button>
            {Array.from({ length: Math.min(7, pages) }, (_, i) => {
              const n = Math.max(1, Math.min(pages - 6, page - 3)) + i;
              return n <= pages ? (
                <button key={n} onClick={() => setPage(n)}
                  className={`btn text-xs py-1 px-2.5 ${n === page ? 'btn-primary' : 'btn-ghost'}`}>{n}</button>
              ) : null;
            })}
            <button onClick={() => setPage(p=>p+1)} disabled={page===pages} className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">›</button>
            <button onClick={() => setPage(pages)}  disabled={page===pages} className="btn btn-ghost text-xs py-1 px-2 disabled:opacity-40">»</button>
          </div>
        </div>
      )}

      <AutoTriageModal job={autoTriageJob} onClose={() => setAutoTriageJob(null)} />
    </div>
  );
}
