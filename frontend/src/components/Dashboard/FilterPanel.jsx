import React, { useMemo, useState } from 'react';
import { Sparkles, SlidersHorizontal, Search, X, ChevronDown, ChevronRight, ArrowLeftRight, Gauge } from 'lucide-react';
import { useStore } from '../../store';
import Dropdown from '../Common/Dropdown';

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function computeStats(jobs, field, value) {
  const hits    = jobs.filter(j => j[field] === value);
  const ran     = hits.filter(j => j.result !== 'PENDING' && (j.totalCount || 0) > 0);
  const tests   = ran.reduce((s, j) => s + (j.totalCount || 0), 0);
  const failed  = ran.reduce((s, j) => s + (j.failCount  || 0), 0);
  const pending = hits.filter(j => j.result === 'PENDING').length;
  return {
    jobs:     hits.length,
    runRate:  pct(ran.length,     hits.length + pending),
    passRate: pct(tests - failed, tests),
    failRate: pct(failed,         tests),
    tests, failed,
  };
}

function rateTheme(rate) {
  if (rate >= 95) return { border: '#10b981', text: '#059669', textDark: '#34d399', bar: '#10b981', dot: 'bg-emerald-500' };
  if (rate >= 70) return { border: '#f59e0b', text: '#b45309', textDark: '#fbbf24', bar: '#f59e0b', dot: 'bg-amber-500'  };
  return             { border: '#ef4444', text: '#dc2626', textDark: '#f87171', bar: '#ef4444', dot: 'bg-red-500'    };
}

function accentText(theme) {
  return document.documentElement.classList.contains('dark') ? theme.textDark : theme.text;
}

function ComponentCard({ name, stats, selected, anySelected, onToggle, onAIReport, version }) {
  const theme  = rateTheme(stats.passRate);
  const active = selected || !anySelected;
  const hasData = stats.tests > 0;

  return (
    <div
      onClick={onToggle}
      className={`
        relative cursor-pointer rounded-xl overflow-hidden transition-all duration-150
        ${selected ? '' : 'border-[1.5px] border-gray-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]'}
        ${!active ? 'opacity-40' : ''}
      `}
      style={selected ? {
        border: `1.5px solid ${theme.border}`,
        boxShadow: `0 0 0 2px ${theme.border}30, 0 0 16px ${theme.border}20`,
      } : {}}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl z-10"
        style={{ backgroundColor: theme.bar }}
      />

      <div className="relative overflow-hidden">
        {hasData && (
          <>
            <div
              className="absolute inset-y-0 left-0 transition-all duration-700"
              style={{
                width: `${stats.passRate}%`,
                background: `linear-gradient(90deg, ${theme.bar}38, ${theme.bar}14)`,
              }}
            />
          </>
        )}

        <div className="relative pl-4 pr-3 py-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className={`text-xs font-bold tracking-wide truncate ${
              active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500'
            }`}>
              {name}
            </p>
            {hasData && (
              <span className="text-sm font-black tabular-nums flex-shrink-0" style={{ color: accentText(theme) }}>
                {stats.passRate}%
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-500">
                run <span className={`font-bold ${active ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500'}`}>{stats.runRate}%</span>
              </span>
              <span className="text-[10px] text-gray-500">
                fail <span className={`font-bold ${stats.failRate > 0 ? 'text-red-500' : 'text-gray-500'}`}>{stats.failRate}%</span>
              </span>
            </div>

            {onAIReport && (
              <button
                onClick={e => { e.stopPropagation(); onAIReport(name, version); }}
                title="AI Error Analysis"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black tracking-wide
                           transition-all duration-150 hover:scale-110 flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(99,102,241,0.16))',
                  color: '#8b5cf6',
                  boxShadow: 'inset 0 0 0 1px rgba(139,92,246,0.35)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(139,92,246,0.7), 0 0 12px rgba(139,92,246,0.35)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(139,92,246,0.35)'; }}
              >
                <Sparkles size={9} />
                AI
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformRow({ name, stats, selected, anySelected, onToggle }) {
  const theme  = rateTheme(stats.passRate);
  const active = selected || !anySelected;

  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-100 text-left
        ${selected ? '' : 'hover:bg-gray-50 dark:hover:bg-white/[0.05]'}
        ${!active ? 'opacity-35' : ''}
      `}
      style={selected ? { backgroundColor: theme.border + '10', outline: `1.5px solid ${theme.border}40` } : {}}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${!active ? 'bg-gray-300 dark:bg-gray-600' : ''}`}
        style={active ? { backgroundColor: theme.bar, boxShadow: `0 0 6px ${theme.bar}80` } : {}}
      />

      <span className={`flex-1 text-xs font-mono font-semibold truncate ${
        active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500'
      }`}>
        {name}
      </span>

      {stats.tests > 0 && (
        <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: accentText(theme) }}>
          {stats.passRate}%
        </span>
      )}
    </button>
  );
}

function Group({ title, count, activeCount, children, onClearGroup, reverseOn, onToggleReverse, extra }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-gray-100 dark:border-white/[0.06] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex-1 text-left">
          {title}
          <span className="ml-1.5 text-gray-400 font-normal normal-case">{count}</span>
        </span>

        {extra}

        {onToggleReverse && (
          <span
            onClick={e => { e.stopPropagation(); onToggleReverse(); }}
            className={`p-1 rounded-md cursor-pointer transition-colors inline-flex items-center gap-1
              ${reverseOn
                ? 'text-brand-600 bg-brand-50 dark:text-brand-300 dark:bg-brand-500/15 ring-1 ring-inset ring-brand-400/40'
                : 'text-gray-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10'
              }`}
            title={reverseOn
              ? 'Reverse mode ON — clicking an item excludes it. Click to switch back.'
              : 'Reverse mode — when on, clicking an item excludes it instead of selecting it'}
          >
            <ArrowLeftRight size={11} />
            {reverseOn && <span className="text-[8px] font-black uppercase">rev</span>}
          </span>
        )}

        {activeCount > 0 && (
          <span
            onClick={e => { e.stopPropagation(); onClearGroup(); }}
            className="text-[10px] bg-brand-600 text-white rounded-full px-1.5 py-0 font-semibold cursor-pointer hover:bg-red-500 transition-colors"
            title="Clear group filters"
          >
            {activeCount} ×
          </span>
        )}
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
      </button>
      {open && children}
    </div>
  );
}

const THRESHOLD_METRICS = [
  { value: 'run_percentage',  label: 'Run % below',  defaultVal: 10 },
  { value: 'pass_percentage', label: 'Pass % below', defaultVal: 10 },
  { value: 'fail_count',      label: 'Fail count ≥', defaultVal: 1  },
];

function ThresholdFilter({ jobs, components, onApply, applied, onClear }) {
  const [open, setOpen]     = useState(false);
  const [metric, setMetric] = useState('run_percentage');
  const [value, setValue]   = useState(10);

  const apply = () => {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return;
    const matching = components.filter(comp => {
      const s = computeStats(jobs, 'component', comp);
      if (metric === 'fail_count')      return s.failed >= n;
      if (metric === 'pass_percentage') return s.tests > 0 && s.passRate < n;
      return s.runRate < n;
    });
    onApply(matching);
    setOpen(false);
  };

  return (
    <span className="relative" onClick={e => e.stopPropagation()}>
      <span
        onClick={() => setOpen(o => !o)}
        className={`p-1 rounded-md cursor-pointer transition-colors inline-flex
          ${applied
            ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
            : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
          }`}
        title="Threshold filter — select components by run rate, pass rate or fail count"
      >
        <Gauge size={11} />
      </span>

      {open && (
        <div
          className="absolute right-0 top-7 z-30 w-56 rounded-xl p-3 space-y-2
                     bg-white border border-gray-200 shadow-xl
                     dark:bg-[#0d1424] dark:border-white/10"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Select components where</p>
          <Dropdown
            size="sm"
            className="w-full"
            value={metric}
            onChange={(m) => {
              setMetric(m);
              setValue(THRESHOLD_METRICS.find(x => x.value === m)?.defaultVal ?? 10);
            }}
            options={THRESHOLD_METRICS.map(m => ({ value: m.value, label: m.label }))}
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && apply()}
              className="input py-1.5 text-xs flex-1"
              min={0}
            />
            <span className="text-xs text-gray-400">{metric === 'fail_count' ? '' : '%'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={apply} className="btn btn-primary text-xs py-1 flex-1 justify-center">Apply</button>
            {applied && (
              <button onClick={() => { onClear(); setOpen(false); }} className="btn btn-ghost text-xs py-1">Reset</button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

export default function FilterPanel({ jobs = [], onOpenAIReport, build }) {
  const {
    enabledPlatforms, enabledFeatures,
    togglePlatform, toggleFeature,
    setEnabledPlatforms, setEnabledFeatures,
  } = useStore();

  const [compSearch, setCompSearch] = useState('');
  const [thresholdApplied, setThresholdApplied] = useState(false);
  const [reverseMode, setReverseMode] = useState({ platforms: false, features: false });

  const reverseToggle = (item, all, enabled, setEnabled) => {
    const base = enabled.length ? enabled : all;
    const next = base.includes(item)
      ? base.filter(x => x !== item)
      : [...base, item];
    setEnabled(next.length === all.length ? [] : next);
  };

  const platforms  = useMemo(() => [...new Set(jobs.map(j => j.os).filter(Boolean))].sort(), [jobs]);
  const components = useMemo(() => [...new Set(jobs.map(j => j.component).filter(Boolean))].sort(), [jobs]);

  const componentJobs = useMemo(
    () => enabledPlatforms.length ? jobs.filter(j => enabledPlatforms.includes(j.os)) : jobs,
    [jobs, enabledPlatforms]
  );
  const platformJobs = useMemo(
    () => enabledFeatures.length ? jobs.filter(j => enabledFeatures.includes(j.component)) : jobs,
    [jobs, enabledFeatures]
  );

  const filteredComps = compSearch
    ? components.filter(c => c.toLowerCase().includes(compSearch.toLowerCase()))
    : components;

  const sortedComps = [...filteredComps].sort((a, b) => {
    if (!reverseMode.features) {
      const aOn = enabledFeatures.includes(a), bOn = enabledFeatures.includes(b);
      if (aOn !== bOn) return aOn ? -1 : 1;
    }
    return computeStats(componentJobs, 'component', b).passRate - computeStats(componentJobs, 'component', a).passRate;
  });

  const version = build || '';

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col overflow-y-auto
      bg-white border-r border-gray-200/80
      dark:bg-white/[0.015] dark:border-white/[0.06]">

      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200/80 dark:border-white/[0.06] sticky top-0 z-10 bg-white/95 dark:bg-[#090d18eb]" style={{ backdropFilter: "blur(12px)" }}>
        <SlidersHorizontal size={13} className="text-gray-400" />
        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex-1">Filters</span>
        {(enabledPlatforms.length > 0 || enabledFeatures.length > 0) && (
          <button
            onClick={() => { setEnabledPlatforms([]); setEnabledFeatures([]); }}
            className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-semibold transition-colors"
          >
            <X size={10} /> Clear all
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-300 py-12">
          <SlidersHorizontal size={28} className="opacity-30" />
          <p className="text-xs text-center text-gray-400 px-4">Select a build to see component health</p>
        </div>
      ) : (
        <>
          <Group
            title="Platforms"
            count={platforms.length}
            activeCount={enabledPlatforms.length}
            onClearGroup={() => setEnabledPlatforms([])}
            reverseOn={reverseMode.platforms}
            onToggleReverse={() => setReverseMode(m => ({ ...m, platforms: !m.platforms }))}
          >
            <div className="px-2 pb-2 space-y-0.5">
              {platforms.map(p => {
                const rev      = reverseMode.platforms;
                const included = enabledPlatforms.length === 0 || enabledPlatforms.includes(p);
                return (
                  <PlatformRow
                    key={p}
                    name={p}
                    stats={computeStats(platformJobs, 'os', p)}
                    selected={rev ? false : enabledPlatforms.includes(p)}
                    anySelected={rev ? !included : enabledPlatforms.length > 0}
                    onToggle={() => rev
                      ? reverseToggle(p, platforms, enabledPlatforms, setEnabledPlatforms)
                      : togglePlatform(p, platforms)}
                  />
                );
              })}
            </div>
          </Group>

          <Group
            title="Components"
            count={components.length}
            activeCount={enabledFeatures.length}
            onClearGroup={() => { setEnabledFeatures([]); setThresholdApplied(false); }}
            reverseOn={reverseMode.features}
            onToggleReverse={() => setReverseMode(m => ({ ...m, features: !m.features }))}
            extra={
              <ThresholdFilter
                jobs={componentJobs}
                components={components}
                applied={thresholdApplied}
                onApply={(matching) => {
                  setEnabledFeatures(matching.length === components.length ? [] : matching);
                  setThresholdApplied(true);
                }}
                onClear={() => { setEnabledFeatures([]); setThresholdApplied(false); }}
              />
            }
          >
            {components.length > 6 && (
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    value={compSearch}
                    onChange={e => setCompSearch(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-white/[0.05]
                               border border-gray-200 dark:border-white/10 rounded-lg
                               focus:outline-none focus:ring-1 focus:ring-brand-400 text-gray-700 dark:text-gray-300"
                    placeholder="Search components…"
                  />
                </div>
              </div>
            )}

            <div className="px-3 pb-3 space-y-2.5">
              {sortedComps.map(comp => {
                const rev      = reverseMode.features;
                const included = enabledFeatures.length === 0 || enabledFeatures.includes(comp);
                return (
                  <ComponentCard
                    key={comp}
                    name={comp}
                    stats={computeStats(componentJobs, 'component', comp)}
                    selected={rev ? false : enabledFeatures.includes(comp)}
                    anySelected={rev ? !included : enabledFeatures.length > 0}
                    onToggle={() => rev
                      ? reverseToggle(comp, components, enabledFeatures, setEnabledFeatures)
                      : toggleFeature(comp, components)}
                    onAIReport={onOpenAIReport}
                    version={version}
                  />
                );
              })}
              {filteredComps.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No components match</p>
              )}
            </div>
          </Group>
        </>
      )}
    </aside>
  );
}
