import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Layers } from 'lucide-react';

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function StatCard({ icon: Icon, iconColor, label, value, sub, barValue, barColor }) {
  return (
    <div className="card px-5 py-4 flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        {barValue !== undefined && (
          <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.min(barValue, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsRow({ jobs = [] }) {
  const finished = jobs.filter(j => j.result !== 'PENDING');
  const total    = finished.reduce((s, j) => s + (j.totalCount || 0), 0);
  const failed   = finished.reduce((s, j) => s + (j.failCount  || 0), 0);
  const skipped  = finished.reduce((s, j) => s + (j.skipCount  || 0), 0);
  const passed   = total - failed - skipped;

  const passRate = pct(passed, total);
  const failJobs = jobs.filter(j => j.result === 'FAILURE' || j.result === 'INST_FAIL').length;
  const pending  = jobs.filter(j => j.result === 'PENDING').length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={Layers}
        iconColor="bg-brand-100 text-brand-600"
        label="Total Tests"
        value={total.toLocaleString()}
        sub={`${jobs.length} jobs`}
      />
      <StatCard
        icon={CheckCircle2}
        iconColor="bg-emerald-100 text-emerald-600"
        label="Pass Rate"
        value={`${passRate}%`}
        sub={`${passed.toLocaleString()} passed`}
        barValue={passRate}
        barColor="bg-emerald-500"
      />
      <StatCard
        icon={XCircle}
        iconColor="bg-red-100 text-red-600"
        label="Failures"
        value={failed.toLocaleString()}
        sub={`${failJobs} jobs failed`}
        barValue={pct(failed, total)}
        barColor="bg-red-500"
      />
      <StatCard
        icon={Clock}
        iconColor="bg-amber-100 text-amber-600"
        label="Pending"
        value={pending}
        sub={skipped > 0 ? `${skipped.toLocaleString()} skipped` : 'No skipped tests'}
      />
    </div>
  );
}
