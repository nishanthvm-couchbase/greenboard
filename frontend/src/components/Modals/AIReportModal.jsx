import React, { useState, useMemo } from 'react';
import { X, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';

const VERDICT = {
  regression: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  flaky:      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  infra:      'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  mixed:      'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  clean:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  unknown:    'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
};
const CAT_LABEL = {
  product_bug: 'Product bug', test_bug: 'Test bug', infra: 'Infra',
  environment: 'Environment', timeout: 'Timeout', unknown: 'Unknown',
};
const CAT_CHIP = {
  product_bug: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
  test_bug:    'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  infra:       'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  environment: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
  timeout:     'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  unknown:     'bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400',
};
const VERDICT_ORDER = ['regression', 'flaky', 'mixed', 'infra', 'clean', 'unknown'];

export default function AIReportModal({ build, component, onClose }) {
  const [filter, setFilter] = useState(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['component-report', build, component],
    queryFn:  () => api.getComponentReport(build, component),
    enabled:  !!(build && component),
    retry: false,
  });

  const hotspots = data?.hotspots || [];
  const shownJobs = useMemo(() => {
    if (!filter) return hotspots;
    if (filter.kind === 'verdict')  return hotspots.filter(h => h.verdict === filter.key);
    return hotspots.filter(h => (h.by_category?.[filter.key] || 0) > 0);
  }, [hotspots, filter]);

  if (!build || !component) return null;

  const verdicts = data?.verdicts || {};
  const cats = Object.entries(data?.categories || {}).sort((a, b) => b[1] - a[1]);
  const catTotal = cats.reduce((s, [, n]) => s + n, 0) || 1;
  const toggle = (kind, key) =>
    setFilter(f => (f && f.kind === kind && f.key === key) ? null : { kind, key });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Layers size={18} className="text-brand-600 dark:text-brand-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Component Analysis</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{component} · {build}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isError && <p className="text-center text-gray-400 py-12">Could not load the component report.</p>}

        {data && (
          <>
            <div className="flex items-center flex-wrap gap-x-6 gap-y-2 px-6 py-4 bg-gray-50 dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10 text-sm">
              <div>
                <span className="text-gray-500">Analyzed:</span>{' '}
                <span className="font-semibold tabular-nums">{data.jobs_analyzed}</span>
                <span className="text-gray-400"> of {data.jobs_failing} failing job{data.jobs_failing === 1 ? '' : 's'}</span>
              </div>
              <div><span className="text-gray-500">Jobs:</span> <span className="font-semibold tabular-nums">{data.jobs_total}</span></div>
              <div><span className="text-gray-500">Failed tests:</span> <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{(data.failed_tests || 0).toLocaleString()}</span></div>
              {data.jobs_analyzed < data.jobs_failing && (
                <span className="text-xs text-amber-600 dark:text-amber-400">partial — analysis still running</span>
              )}
            </div>

            {data.jobs_analyzed === 0 ? (
              <p className="text-center text-gray-400 py-12 px-6">
                No per-job analysis yet for this component in <span className="font-mono">{build}</span>.<br />
                It fills in as the Test Analysis reconciliation runs.
              </p>
            ) : (
              <div className="px-6 py-4 space-y-5 max-h-[58vh] overflow-y-auto">
                <div className="flex flex-wrap items-center gap-2">
                  {VERDICT_ORDER.filter(v => verdicts[v]).map(v => {
                    const active = filter?.kind === 'verdict' && filter.key === v;
                    return (
                      <button key={v} onClick={() => toggle('verdict', v)}
                        title={`Show only ${v} jobs`}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${VERDICT[v]}
                                    ${active ? 'ring-2 ring-current' : 'opacity-85 hover:opacity-100'}`}>
                        {v} · {verdicts[v]}
                      </button>
                    );
                  })}
                  {filter && (
                    <button onClick={() => setFilter(null)}
                      className="text-xs px-2 py-1 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10">
                      clear ✕
                    </button>
                  )}
                </div>

                {cats.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      Failure categories <span className="normal-case font-normal text-gray-500">· per test · click to filter</span>
                    </p>
                    <div className="space-y-0.5">
                      {cats.map(([c, n]) => {
                        const active = filter?.kind === 'category' && filter.key === c;
                        return (
                          <button key={c} onClick={() => toggle('category', c)}
                            title={`Show jobs containing ${CAT_LABEL[c] || c} failures`}
                            className={`w-full flex items-center gap-3 text-sm rounded-md px-1.5 py-1 transition
                                        ${active ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}>
                            <span className={`w-28 text-left flex-shrink-0 ${active ? 'text-brand-600 dark:text-brand-300 font-semibold' : 'text-gray-600 dark:text-gray-300'}`}>
                              {CAT_LABEL[c] || c}
                            </span>
                            <span className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                              <span className="block h-full bg-brand-500" style={{ width: `${(n / catTotal) * 100}%` }} />
                            </span>
                            <span className="tabular-nums text-gray-500 w-8 text-right">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(data.themes || []).length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Recurring themes</p>
                    <div className="space-y-1">
                      {data.themes.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm border-l-2 border-brand-400 pl-3 py-0.5">
                          <span className="text-gray-700 dark:text-gray-300">{t.title}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-3">{t.jobs} job{t.jobs === 1 ? '' : 's'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Jobs
                    {filter && (
                      <span className="normal-case font-normal text-gray-500">
                        {' '}· {shownJobs.length} with {filter.kind === 'verdict' ? filter.key : (CAT_LABEL[filter.key] || filter.key)}
                      </span>
                    )}
                  </p>
                  {shownJobs.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4">No jobs match this filter in the analyzed set.</p>
                  ) : (
                  <div className="space-y-2">
                    {shownJobs.map((h, i) => {
                      const jobCats = Object.entries(h.by_category || {}).sort((a, b) => b[1] - a[1]);
                      return (
                      <div key={i} className="border border-gray-200 dark:border-white/10 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-mono text-xs text-gray-800 dark:text-gray-200 truncate">{h.display_name}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {h.is_new > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">{h.is_new} new</span>}
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${VERDICT[h.verdict] || VERDICT.unknown}`}>{h.verdict}</span>
                            {h.failed > 0 && <span className="text-xs text-red-500 tabular-nums">{h.failed}✗</span>}
                          </div>
                        </div>
                        {h.headline && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">{h.headline}</p>}
                        {jobCats.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {jobCats.map(([c, n]) => (
                              <span key={c} className={`text-[10px] px-1.5 py-0.5 rounded ${CAT_CHIP[c] || CAT_CHIP.unknown}`}>
                                {CAT_LABEL[c] || c} · {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
