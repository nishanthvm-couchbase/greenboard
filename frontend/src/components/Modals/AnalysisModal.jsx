import React from 'react';
import { X, Sparkles, AlertTriangle, Wrench, History, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';

const VERDICT_STYLES = {
  regression: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  flaky:      'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  infra:      'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  mixed:      'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  clean:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  unknown:    'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
};

const CAT_STYLES = {
  product_bug: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
  test_bug:    'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  infra:       'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  environment: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
  timeout:     'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  unknown:     'bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400',
};

function Stat({ label, value, tone }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-lg font-semibold ${tone || 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
    </div>
  );
}

function FailureCard({ f }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <code className="text-xs font-mono text-gray-800 dark:text-gray-200 break-all">{f.test_name}</code>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${CAT_STYLES[f.category] || CAT_STYLES.unknown}`}>
          {f.category}
        </span>
      </div>
      {f.summary && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{f.summary}</p>}
      {f.root_cause && (
        <p className="text-xs text-gray-500 mt-1.5"><span className="font-medium">Root cause:</span> {f.root_cause}</p>
      )}
      {f.suggested_fix && (
        <p className="text-xs text-gray-500 mt-1 flex items-start gap-1">
          <Wrench size={12} className="mt-0.5 shrink-0" /> <span>{f.suggested_fix}</span>
        </p>
      )}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
        {f.is_new
          ? <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-500 dark:bg-red-500/10">NEW this build</span>
          : <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 flex items-center gap-1">
              <History size={10} /> failed {f.times_failed}× · since {f.first_failed_build}
            </span>}
        <span className="ml-auto">confidence: {f.confidence}</span>
      </div>
    </div>
  );
}

export default function AnalysisModal({ job, onClose }) {
  if (!job) return null;
  const { name, build } = job;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analysis', name, build],
    queryFn:  () => api.getAnalysis(name, build),
    enabled:  !!(name && build),
    retry: false,
  });

  const notFound = isError && error?.response?.status === 404;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={18} className="text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Test Analysis</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{job.displayName || name} · {build}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {notFound && (
            <p className="text-center text-gray-500 py-10">
              No analysis has been generated for this job/build yet.
            </p>
          )}
          {isError && !notFound && (
            <p className="text-center text-red-600 dark:text-red-400 py-10">Failed to load analysis.</p>
          )}

          {data && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${VERDICT_STYLES[data.verdict] || VERDICT_STYLES.unknown}`}>
                    {data.verdict}
                  </span>
                  <span className="text-xs text-gray-400">confidence: {data.confidence}</span>
                  {data.generated_at && (
                    <span className="ml-auto text-[11px] text-gray-400">{new Date(data.generated_at).toLocaleString()}</span>
                  )}
                </div>
                <p className="text-[15px] text-gray-900 dark:text-gray-100 leading-snug">{data.headline}</p>
              </div>

              {data.stats && (
                <div className="grid grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03]">
                  <Stat label="Total" value={data.stats.total_tests} />
                  <Stat label="Passed" value={data.stats.passed} tone="text-emerald-600 dark:text-emerald-400" />
                  <Stat label="Failed" value={data.stats.failed} tone="text-red-600 dark:text-red-400" />
                  <Stat label="Aborted" value={data.stats.aborted} tone="text-gray-500" />
                </div>
              )}

              {data.recommended_action && (
                <div className="flex items-start gap-2 p-3.5 rounded-xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-500/[0.06]">
                  <Wrench size={15} className="text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-800 dark:text-gray-200">{data.recommended_action}</p>
                </div>
              )}

              {data.failures?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> Failures ({data.failures.length})
                  </h3>
                  <div className="space-y-2">
                    {data.failures.map((f, i) => <FailureCard key={i} f={f} />)}
                  </div>
                </div>
              )}

              {data.themes?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Layers size={13} /> Themes
                  </h3>
                  <div className="space-y-2">
                    {data.themes.map((t, i) => (
                      <div key={i} className="rounded-xl border border-gray-200 dark:border-white/10 p-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.title}</p>
                        {t.explanation && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t.explanation}</p>}
                        {t.tests?.length > 0 && (
                          <p className="text-[10px] text-gray-400 font-mono mt-1.5">{t.tests.join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
