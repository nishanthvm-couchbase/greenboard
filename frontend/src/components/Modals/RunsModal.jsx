import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import StatusBadge from '../Common/StatusBadge';

function fmt(ms) {
  if (!ms) return '—';
  const m = Math.floor(ms / 60000);
  return m ? `${m}m` : `${Math.floor(ms/1000)}s`;
}

export default function RunsModal({ job, onClose }) {
  if (!job) return null;

  const runs = job.allRuns || [];

  const s3Link = (run) => {
    const parts = (job.url || '').split('/').filter(Boolean);
    const jobName = parts[parts.length - 1] || '';
    return `http://cb-logs-qe.s3-website-us-west-2.amazonaws.com/${job.build}/jenkins_logs/${jobName}/${run.build_id}/`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">All Test Runs</h2>
            <p className="text-sm text-gray-500 mt-0.5 font-mono">{job.displayName || job.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.04]">
              <tr>
                <th className="tbl-head">Build ID</th>
                <th className="tbl-head">Status</th>
                <th className="tbl-head">Tests</th>
                <th className="tbl-head">Fails</th>
                <th className="tbl-head">Duration</th>
                <th className="tbl-head">Links</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.build_id} className="tbl-row">
                  <td className="tbl-cell font-mono text-xs text-gray-500">#{run.build_id}</td>
                  <td className="tbl-cell"><StatusBadge result={run.result} /></td>
                  <td className="tbl-cell tabular-nums">{(run.totalCount || 0).toLocaleString()}</td>
                  <td className="tbl-cell tabular-nums text-red-600 dark:text-red-400">{run.failCount > 0 ? run.failCount : '—'}</td>
                  <td className="tbl-cell text-gray-500 text-xs">{fmt(run.duration)}</td>
                  <td className="tbl-cell">
                    <div className="flex gap-2">
                      {job.url && (
                        <a href={`${job.url}${run.build_id}`} target="_blank" rel="noreferrer"
                           className="text-brand-600 dark:text-brand-400 hover:underline text-xs flex items-center gap-0.5">
                          Jenkins <ExternalLink size={10} />
                        </a>
                      )}
                      <a href={s3Link(run)} target="_blank" rel="noreferrer"
                         className="text-amber-600 dark:text-amber-400 hover:underline text-xs flex items-center gap-0.5">
                        S3 Logs <ExternalLink size={10} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-white/10">
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}
