import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { api } from '../../api';

const TARGET = 'server';

function timeAgo(ms) {
  if (!ms) return null;
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

const passColor = (p) => p >= 95 ? 'text-emerald-600 dark:text-emerald-400'
                       : p >= 80 ? 'text-amber-600 dark:text-amber-400'
                       :           'text-red-600 dark:text-red-400';
const passBar   = (p) => p >= 95 ? 'bg-emerald-500' : p >= 80 ? 'bg-amber-500' : 'bg-red-500';

function Delta({ v }) {
  if (v == null || v === 0) return null;
  const up = v > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      <Icon size={12} />{up ? '+' : ''}{v}%
    </span>
  );
}

function ReadinessCard({ d }) {
  const nav = useNavigate();
  const buildNo = d.latestBuild.split('-')[1];
  const ago = timeAgo(d.lastTimestamp);
  return (
    <button
      onClick={() => nav(`/${TARGET}/${d.version}/${buildNo}`)}
      className="card p-5 text-left flex flex-col transition-transform hover:-translate-y-0.5
                 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{d.version}</span>
            {d.codename && <span className="text-xs font-medium text-brand-500">{d.codename}</span>}
          </div>
          <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{d.latestBuild}</p>
        </div>
        {ago && (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
            <Clock size={11} />{ago}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <span className={`text-3xl font-bold tabular-nums leading-none ${passColor(d.passPct)}`}>{d.passPct}%</span>
        <span className="text-xs text-gray-400 mb-0.5">pass</span>
        <span className="ml-auto mb-0.5"><Delta v={d.passDelta} /></span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${passBar(d.passPct)}`} style={{ width: `${d.passPct}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{d.runPct}%</p>
          <p className="text-[11px] text-gray-400">run</p>
        </div>
        <div>
          <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{(d.pending || 0).toLocaleString()}</p>
          <p className="text-[11px] text-gray-400">pending</p>
        </div>
        <div>
          <p className={`text-sm font-semibold tabular-nums ${d.redComponents ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {d.redComponents}<span className="text-gray-400 font-normal">/{d.components}</span>
          </p>
          <p className="text-[11px] text-gray-400">red comps</p>
        </div>
      </div>
    </button>
  );
}

export default function ReadinessCards() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['readiness', TARGET],
    queryFn:  () => api.getReadiness(TARGET, 4),
    retry: false,
    refetchInterval: 60_000,
  });

  if (isError) return null;
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="card p-5 h-44 animate-pulse" />)}
      </div>
    );
  }
  if (!data.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {data.map(d => <ReadinessCard key={d.version} d={d} />)}
    </div>
  );
}
