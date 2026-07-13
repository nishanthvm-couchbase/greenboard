import React, { useMemo, useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as ReTip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../api';

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function heatColor(rate) {
  if (rate === null) return { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', text: 'transparent', glow: 'none' };
  if (rate >= 97)    return { bg: '#4ade80',       border: '#86efac',  text: '#052e16',     glow: '0 0 14px #4ade8090' };
  if (rate >= 92)    return { bg: '#22c55e',       border: '#4ade80',  text: '#f0fdf4',     glow: '0 0 10px #22c55e70' };
  if (rate >= 85)    return { bg: '#16a34a',       border: '#22c55e',  text: '#dcfce7',     glow: '0 0 8px #16a34a60'  };
  if (rate >= 75)    return { bg: '#15803d',       border: '#16a34a',  text: '#bbf7d0',     glow: '0 0 6px #15803d50'  };
  if (rate >= 62)    return { bg: '#166534',       border: '#15803d',  text: '#86efac',     glow: 'none'               };
  if (rate >= 50)    return { bg: '#ca8a04',       border: '#eab308',  text: '#fef9c3',     glow: '0 0 6px #ca8a0450'  };
  if (rate >= 35)    return { bg: '#c2410c',       border: '#f97316',  text: '#ffedd5',     glow: 'none'               };
  if (rate >= 15)    return { bg: '#dc2626',       border: '#ef4444',  text: '#fee2e2',     glow: '0 0 6px #dc262650'  };
  return               { bg: '#991b1b',       border: '#ef4444',  text: '#fecaca',     glow: '0 0 10px #ef444460' };
}

const STATUS = {
  SUCCESS:   { label: 'Passed',    color: '#22c55e' },
  FAILURE:   { label: 'Failed',    color: '#ef4444' },
  UNSTABLE:  { label: 'Unstable',  color: '#f59e0b' },
  ABORTED:   { label: 'Aborted',   color: '#64748b' },
  INST_FAIL: { label: 'Inst Fail', color: '#f97316' },
  PENDING:   { label: 'Pending',   color: '#38bdf8' },
};

function StatusHero({ jobs }) {
  const totTests = jobs.reduce((s, j) => s + (j.totalCount || 0), 0);
  const totFail  = jobs.reduce((s, j) => s + (j.failCount  || 0), 0);
  const totPass  = totTests - totFail;
  const passRate = pct(totPass, totTests) ?? 0;

  const slices = useMemo(() => {
    const counts = {};
    jobs.forEach(j => { counts[j.result] = (counts[j.result] || 0) + 1; });
    return Object.entries(STATUS)
      .map(([k, m]) => ({ ...m, value: counts[k] || 0, key: k }))
      .filter(s => s.value > 0);
  }, [jobs]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  const rateColor = passRate >= 85 ? '#22c55e' : passRate >= 65 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-64 flex-shrink-0 flex flex-col text-white overflow-hidden border-r border-white/[0.06]" style={{ background: "rgba(0,0,0,0.25)" }}>
      <div className="flex items-center gap-4 px-5 pt-5 pb-3">
        <div className="relative flex-shrink-0" style={{ width: 100, height: 100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                cx="50%" cy="50%"
                innerRadius={32} outerRadius={47}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                animationBegin={150}
                animationDuration={800}
              >
                {slices.map(s => <Cell key={s.key} fill={s.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-black tabular-nums leading-none" style={{ color: rateColor }}>
              {passRate}%
            </span>
          </div>
        </div>

        <div className="space-y-1.5 flex-1 min-w-0">
          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider">Tests run</p>
            <p className="text-xl font-black tabular-nums text-white leading-tight">
              {totTests.toLocaleString()}
            </p>
          </div>
          <div className="flex gap-4">
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">Passed</p>
              <p className="text-sm font-bold tabular-nums text-emerald-400">{totPass.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">Failed</p>
              <p className="text-sm font-bold tabular-nums text-red-400">{totFail.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4 space-y-1 border-t border-white/[0.06] pt-3 flex-1">
        {slices.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-gray-400 flex-1">{s.label}</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: s.color }}>
              {s.value.toLocaleString()}
            </span>
            <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatCell({ os, comp, stats, onClick, isActive, anyActive, animDelay }) {
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const c = heatColor(stats.passRate);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), animDelay);
    return () => clearTimeout(t);
  }, [animDelay]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={onClick}
        className="rounded-md cursor-pointer flex flex-col items-center justify-center transition-transform duration-100 select-none"
        style={{
          width: 50,
          height: 42,
          backgroundColor: c.bg,
          border: isActive ? '2px solid #a78bfa' : `1px solid ${c.border}60`,
          opacity: mounted ? (anyActive && !isActive ? 0.25 : 1) : 0,
          transform: mounted
            ? (hovered ? 'scale(1.28) translateY(-3px)' : 'scale(1)')
            : 'scale(0.3)',
          transition: 'opacity 0.3s ease, transform 0.12s ease, box-shadow 0.12s ease',
          boxShadow: hovered ? c.glow : (isActive ? '0 0 0 2px #7c3aed80' : 'none'),
          zIndex: hovered ? 20 : 1,
        }}
      >
        {stats.passRate !== null ? (
          <span className="text-[13px] font-black leading-none" style={{ color: c.text }}>
            {stats.passRate}
          </span>
        ) : (
          <span className="text-[9px]" style={{ color: '#334155' }}>·</span>
        )}
      </div>

      {hovered && (
        <div
          className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2
                     bg-gray-900 border border-gray-700 text-white text-[11px]
                     rounded-xl px-3 py-2.5 whitespace-nowrap shadow-2xl pointer-events-none"
        >
          <p className="font-semibold text-white mb-1">{os} × {comp}</p>
          {stats.passRate !== null ? (
            <>
              <p style={{ color: c.text }} className="font-bold text-sm">{stats.passRate}% pass</p>
              <p className="text-gray-400 mt-0.5">
                {stats.passed.toLocaleString()}/{stats.total.toLocaleString()} tests
                &nbsp;·&nbsp; {stats.jobs} jobs
              </p>
            </>
          ) : (
            <p className="text-gray-500">No test data</p>
          )}
        </div>
      )}
    </div>
  );
}

function Heatmap({ jobs, activePairs, onCellClick }) {
  const activePlatforms = useMemo(() => {
    const all = [...new Set(jobs.map(j => j.os).filter(Boolean))];
    return all
      .filter(os =>
        jobs.some(j => j.os === os && j.result !== 'PENDING' && (j.totalCount || 0) > 0)
      )
      .sort((a, b) => {
        const rate = (os) => {
          const hits = jobs.filter(j => j.os === os && (j.totalCount || 0) > 0);
          const t = hits.reduce((s, j) => s + (j.totalCount || 0), 0);
          const f = hits.reduce((s, j) => s + (j.failCount  || 0), 0);
          return pct(t - f, t) ?? 100;
        };
        return rate(a) - rate(b);
      });
  }, [jobs]);

  const activeComponents = useMemo(() => {
    const activePlatformSet = new Set(activePlatforms);
    const comps = [...new Set(
      jobs
        .filter(j => activePlatformSet.has(j.os) && j.result !== 'PENDING' && (j.totalCount || 0) > 0)
        .map(j => j.component)
        .filter(Boolean)
    )].sort();
    return comps;
  }, [jobs, activePlatforms]);

  const matrix = useMemo(() => {
    const m = {};
    activePlatforms.forEach(os => {
      m[os] = {};
      activeComponents.forEach(comp => {
        const hits   = jobs.filter(j => j.os === os && j.component === comp && (j.totalCount || 0) > 0);
        const total  = hits.reduce((s, j) => s + (j.totalCount || 0), 0);
        const failed = hits.reduce((s, j) => s + (j.failCount  || 0), 0);
        const passed = total - failed;
        m[os][comp] = total > 0
          ? { passRate: pct(passed, total), passed, failed, total, jobs: hits.length }
          : { passRate: null, passed: 0, failed: 0, total: 0, jobs: 0 };
      });
    });
    return m;
  }, [jobs, activePlatforms, activeComponents]);

  const anyActive = activePairs.size > 0;

  if (activePlatforms.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        <p className="text-sm">No test results yet for this build.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end mb-1">
        <div className="flex-shrink-0" style={{ width: 112 }} />
        <div className="flex gap-1">
          {activeComponents.map(comp => (
            <div
              key={comp}
              className="flex items-end justify-center flex-shrink-0 pb-1"
              style={{ width: 50, height: 72 }}
            >
              <span
                className="text-[10px] text-gray-400 font-semibold whitespace-nowrap"
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  maxHeight: 70,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {comp}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {activePlatforms.map((os, rowIdx) => {
          const hits    = jobs.filter(j => j.os === os && (j.totalCount || 0) > 0);
          const total   = hits.reduce((s, j) => s + (j.totalCount || 0), 0);
          const failed  = hits.reduce((s, j) => s + (j.failCount  || 0), 0);
          const osRate  = pct(total - failed, total);
          const osTheme = heatColor(osRate);

          return (
            <div key={os} className="flex items-center gap-1">
              <div className="flex-shrink-0 flex items-center justify-between gap-2 pr-2" style={{ width: 112 }}>
                <span className="text-[11px] font-mono font-bold text-gray-300 truncate">{os}</span>
                {osRate !== null && (
                  <span
                    className="text-[11px] font-black flex-shrink-0"
                    style={{ color: osTheme.bg !== '#1e293b' ? osTheme.text : '#94a3b8' }}
                  >
                    {osRate}%
                  </span>
                )}
              </div>

              <div className="flex gap-1.5">
                {activeComponents.map((comp, colIdx) => (
                  <HeatCell
                    key={comp}
                    os={os} comp={comp}
                    stats={matrix[os]?.[comp] ?? { passRate: null, jobs: 0, total: 0, passed: 0, failed: 0 }}
                    isActive={activePairs.has(`${os}::${comp}`)}
                    anyActive={anyActive}
                    onClick={() => onCellClick(os, comp)}
                    animDelay={rowIdx * 60 + colIdx * 18}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-4 pl-28">
        <span className="text-[9px] text-gray-500">0%</span>
        <div
          className="h-2 rounded-full flex-1 max-w-[180px]"
          style={{ background: 'linear-gradient(to right,#7f1d1d,#7c2d12,#78350f,#3f6212,#166534,#14532d)' }}
        />
        <span className="text-[9px] text-gray-500">100%</span>
        <div className="w-5 h-5 rounded ml-2 flex-shrink-0"
          style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
        <span className="text-[9px] text-gray-500">No data</span>
        <span className="text-[9px] text-gray-500 ml-2 italic">· click to filter</span>
      </div>
    </div>
  );
}

const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : `${n}`);

const LEGACY_BUILD_COUNT = 5;

function LegacyBars({ activeBuild }) {
  const { target, version, setBuild, testsFilter } = useStore();
  const { data: resp } = useQuery({
    queryKey: ['buildbars', target, version, testsFilter],
    queryFn:  () => api.getBuildBars(target, version || '8.1.0', LEGACY_BUILD_COUNT, testsFilter),
    enabled:  !!target,
    refetchInterval: (q) => (q.state.data?.ready ? false : 4000),
    staleTime: 0,
  });
  const ready = !!resp?.ready;
  const bars  = resp?.bars || [];

  const data = useMemo(
    () => bars.map(b => ({ ...b, num: b.build.split('-')[1] || b.build })),
    [bars]
  );

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        {ready ? 'No build data yet for this version.' : 'Building chart… (loads in the background)'}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 28 }} barCategoryGap="22%">
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="num" interval={0} height={56} tickMargin={8}
          angle={-40} textAnchor="end"
          tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
          stroke="rgba(255,255,255,0.12)"
        />
        <YAxis tickFormatter={kfmt} width={46} tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="rgba(255,255,255,0.12)" />
        <ReTip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            const rate = d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0;
            return (
              <div className="bg-gray-900 border border-gray-700 text-white text-[11px] rounded-xl px-3 py-2.5 shadow-2xl">
                <p className="font-semibold mb-1 font-mono">{d.build}</p>
                <p className="text-emerald-400">{d.passed.toLocaleString()} passed</p>
                <p className="text-red-400">{d.failed.toLocaleString()} failed</p>
                <p className="text-gray-400 mt-0.5">{d.total.toLocaleString()} total · {rate}% pass</p>
              </div>
            );
          }}
        />
        <Bar dataKey="passed" stackId="a" fill="#22c55e" cursor="pointer"
             onClick={(d) => d?.build && setBuild(d.build)}>
          {data.map((d) => <Cell key={d.build} fill={d.build === activeBuild ? '#16a34a' : '#22c55e'} />)}
        </Bar>
        <Bar dataKey="failed" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} cursor="pointer"
             onClick={(d) => d?.build && setBuild(d.build)}>
          {data.map((d) => <Cell key={d.build} fill={d.build === activeBuild ? '#dc2626' : '#ef4444'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InsightPanel({ jobs = [] }) {
  const [open, setOpen] = useState(true);
  const [activePairs, setActivePairs] = useState(new Set());
  const [legacy, setLegacy] = useState(() => {
    try { return localStorage.getItem('gb_legacy_insight') === '1'; } catch { return false; }
  });
  const toggleLegacy = (e) => {
    e.stopPropagation();
    setLegacy(v => { try { localStorage.setItem('gb_legacy_insight', v ? '0' : '1'); } catch {} return !v; });
  };
  const { togglePlatform, toggleFeature, build } = useStore();

  const platforms  = useMemo(() => [...new Set(jobs.map(j => j.os).filter(Boolean))].sort(), [jobs]);
  const components = useMemo(() => [...new Set(jobs.map(j => j.component).filter(Boolean))].sort(), [jobs]);

  const handleCell = (os, comp) => {
    const key = `${os}::${comp}`;
    setActivePairs(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    togglePlatform(os, platforms);
    toggleFeature(comp, components);
  };

  if (jobs.length === 0) return null;

  const activePlatformCount = [...new Set(
    jobs.filter(j => j.result !== 'PENDING' && (j.totalCount || 0) > 0).map(j => j.os).filter(Boolean)
  )].length;

  return (
    <div className="rounded-2xl overflow-hidden shadow-card border border-gray-300/60 dark:border-white/[0.07]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-2.5 text-gray-100
                   border-b border-white/[0.06] transition-colors"
        style={{ background: '#0d1322' }}
      >
        <Zap size={14} className="text-brand-400 flex-shrink-0" />
        <span className="text-sm font-bold tracking-wide flex-1 text-left">Test Insights</span>
        <span className="text-xs text-gray-400">
          {activePlatformCount} active platforms · {components.length} components
        </span>
        <span
          role="switch"
          aria-checked={legacy}
          onClick={toggleLegacy}
          title="Switch between the legacy per-build bar chart and the heatmap"
          className="ml-3 flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer select-none
                     bg-white/[0.06] hover:bg-white/[0.1] ring-1 ring-white/10 transition-colors"
        >
          <span className={`text-[11px] font-semibold tracking-wide ${legacy ? 'text-brand-300' : 'text-gray-400'}`}>
            {legacy ? 'Legacy chart' : 'Heatmap'}
          </span>
          <span className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0
                            ${legacy ? 'bg-brand-500' : 'bg-gray-600'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200
                              ${legacy ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </span>
        {open
          ? <ChevronUp size={13} className="text-gray-500 ml-2" />
          : <ChevronDown size={13} className="text-gray-500 ml-2" />
        }
      </button>

      {open && (
        <div className="flex" style={{ background: '#0a0f1c', minHeight: 260 }}>
          <StatusHero jobs={jobs} />

          <div className="flex-1 min-w-0 py-5 relative">
            <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-10"
              style={{ background: 'linear-gradient(to right, transparent, #0a0f1c)' }} />
            <div className="px-6 overflow-x-auto h-full">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
                {legacy ? 'Tests by Build — passed / failed' : 'Pass Rate — Platform × Component'}
              </p>
              {legacy ? (
                <LegacyBars activeBuild={build} />
              ) : (
                <Heatmap
                  jobs={jobs}
                  activePairs={activePairs}
                  onCellClick={handleCell}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
