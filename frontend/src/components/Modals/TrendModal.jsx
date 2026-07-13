import React, { useMemo, useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';

const PASS = '#22c55e', FAIL = '#ef4444';

const buildNum = (v) => {
  const p = (v || '').split('-');
  return parseInt(p[p.length - 1], 10) || 0;
};

function useTrend(data) {
  return useMemo(() => {
    if (!data?.trend?.length) return { bars: [], scatter: [] };
    const byBuild = new Map();
    for (const r of data.trend) {
      if (!byBuild.has(r.version)) byBuild.set(r.version, { version: r.version, bn: buildNum(r.version), pass: 0, fail: 0, runs: [] });
      const g = byBuild.get(r.version);
      r.result === 'pass' ? g.pass++ : g.fail++;
      g.runs.push(r);
    }
    const builds = [...byBuild.values()].sort((a, b) => a.bn - b.bn);
    const bars = builds.map(b => ({ build: String(b.bn), version: b.version, pass: b.pass, fail: b.fail }));
    const scatter = [];
    builds.forEach((b, i) => {
      b.runs.sort((x, y) => (x.run_number || 0) - (y.run_number || 0));
      b.runs.forEach(r => scatter.push({ x: i, build: String(b.bn), version: b.version, y: r.run_number || 1, result: r.result, url: r.url }));
    });
    return { bars, scatter };
  }, [data]);
}

function BarTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
      <div className="font-mono">{p.version || label}</div>
      <div className="text-emerald-400">pass: {p.pass}</div>
      <div className="text-red-400">fail: {p.fail}</div>
    </div>
  );
}
function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg">
      <div className="font-mono">{p.version}</div>
      <div>run #{p.y} · <span className={p.result === 'pass' ? 'text-emerald-400' : 'text-red-400'}>{p.result}</span></div>
      {p.url && <div className="text-blue-300">click to open ↗</div>}
    </div>
  );
}

function RunDot({ cx, cy, payload }) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle cx={cx} cy={cy} r={5} fill={payload.result === 'pass' ? PASS : FAIL}
      stroke="#fff" strokeWidth={1} style={{ cursor: payload.url ? 'pointer' : 'default' }}
      onClick={() => payload.url && window.open(payload.url, '_blank')} />
  );
}

function TrendChart({ data, type }) {
  const { bars, scatter } = useTrend(data);
  if (!bars.length) return <p className="text-center text-gray-400 py-10 text-sm">No runs recorded.</p>;

  const interval = bars.length > 22 ? Math.ceil(bars.length / 22) - 1 : 0;
  const axisTick = { fontSize: 10, fill: '#94a3b8' };

  if (type === 'scatter') {
    const line = scatter.map((p, i) => ({ ...p, i }));
    const seen = new Set();
    const tickLabel = [];
    const ticks = [];
    line.forEach(p => {
      if (!seen.has(p.build)) { seen.add(p.build); ticks.push(p.i); tickLabel[p.i] = p.build; }
      else tickLabel[p.i] = '';
    });
    return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={line} margin={{ top: 8, right: 12, left: -20, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-white/10" />
          <XAxis type="number" dataKey="i" domain={[-0.5, line.length - 0.5]}
                 ticks={ticks} tickFormatter={i => tickLabel[i] ?? ''}
                 angle={-40} textAnchor="end" height={42} tick={axisTick} />
          <YAxis type="number" dataKey="y" allowDecimals={false} domain={[0, 'dataMax + 1']} tick={axisTick}
                 label={{ value: 'run #', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: '3 3' }} />
          <Line type="monotone" dataKey="y" stroke="#94a3b8" strokeWidth={2}
                dot={<RunDot />} activeDot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bars} margin={{ top: 8, right: 12, left: -20, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-white/10" />
        <XAxis dataKey="build" interval={interval} angle={-40} textAnchor="end" height={42} tick={axisTick} />
        <YAxis allowDecimals={false} tick={axisTick} />
        <Tooltip content={<BarTip />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar name="pass" dataKey="pass" stackId="a" fill={PASS} radius={[2, 2, 0, 0]} />
        <Bar name="fail" dataKey="fail" stackId="a" fill={FAIL} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function TrendModal({ job, onClose }) {
  const [chartType, setChartType] = useState('bar');
  if (!job) return null;

  const baseVer = (job.build || '').split('-')[0];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['jobtrend', baseVer, job.os, job.component, job.name],
    queryFn:  () => api.getJobTrend('server', baseVer, job.os, job.component, job.name),
    enabled:  !!(baseVer && job.os && job.component && job.name),
  });

  const latestFail = data && data.fail_count > 0 && data.pass_count === 0;
  const status = data ? (latestFail ? 'Failing' : data.fail_count === 0 ? 'Passing' : 'Flaky') : null;
  const statusCls = status === 'Passing'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : status === 'Failing'
    ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={18} className="text-brand-600 dark:text-brand-400 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Job Trend</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{job.displayName || job.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>}
            <select
              value={chartType}
              onChange={e => setChartType(e.target.value)}
              className="text-xs border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-600 dark:text-gray-300 rounded-lg px-2 py-1"
            >
              <option value="bar">Bars</option>
              <option value="scatter">Scatter</option>
            </select>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {isError && <p className="text-center text-red-600 dark:text-red-400 py-10">No trend data available for this job.</p>}
          {data && (
            <>
              <p className="text-xs text-gray-400 mb-2">
                {chartType === 'bar' ? 'pass/fail runs per build' : 'each dot is a run (rerun = higher)'} · oldest → newest
                {chartType === 'scatter' && ' · click a run to open in Jenkins'}
              </p>
              <TrendChart data={data} type={chartType} />
            </>
          )}
        </div>

        {data && (
          <div className="flex items-center gap-6 px-6 pb-5 text-sm flex-wrap">
            <div><span className="text-gray-500">Total runs:</span> <span className="font-semibold">{data.total_runs}</span></div>
            <div><span className="text-gray-500">Passed:</span> <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.pass_count}</span></div>
            <div><span className="text-gray-500">Failed:</span> <span className="font-semibold text-red-600 dark:text-red-400">{data.fail_count}</span></div>
            {data.last_pass && (
              <div className="ml-auto text-xs text-gray-400">
                Last pass: <span className="font-mono">{data.last_pass.version}</span>
                {data.last_pass.url && (
                  <a href={data.last_pass.url} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 dark:text-brand-400 hover:underline">↗</a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
