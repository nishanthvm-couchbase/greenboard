import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import Dropdown from '../components/Common/Dropdown';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  GitCompare, ArrowLeft, TrendingDown, TrendingUp, AlertTriangle,
  PlusCircle, MinusCircle, ExternalLink, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TARGETS = ['server', 'cblite', 'sync_gateway', 'operator'];

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
const passPct = (total, fail) => (total > 0 ? Math.round(((total - fail) / total) * 100) : 0);
const runPct  = (total, pend) => (total + pend > 0 ? Math.round((total / (total + pend)) * 100) : 0);

const jobId = (j) => `${j.os}|${j.component}|${j.name}`;
const isPending = (j) => j.result === 'PENDING' || (num(j.totalCount) === 0 && num(j.pending) > 0);
const isReal    = (j) => j && !isPending(j) && num(j.totalCount) > 0;
const jobPassed = (j) => isReal(j) && num(j.failCount) === 0;

function buildIndex(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (j.deleted || j.olderBuild) continue;
    const id   = jobId(j);
    const prev = map.get(id);
    if (prev) {
      const prevReal = !isPending(prev), curReal = !isPending(j);
      if (prevReal && !curReal) continue;
      if (prevReal && curReal && num(j.totalCount) <= num(prev.totalCount)) continue;
    }
    map.set(id, j);
  }
  return map;
}

function aggregate(map, by, filterOS = null) {
  const out = {};
  for (const j of map.values()) {
    if (filterOS && j.os !== filterOS) continue;
    const k = by === 'component' ? j.component : j.os;
    const o = (out[k] ||= { total: 0, fail: 0, pend: 0 });
    o.total += num(j.totalCount);
    o.fail  += num(j.failCount);
    o.pend  += num(j.pending);
  }
  return out;
}

function totals(map) {
  let total = 0, fail = 0, pend = 0;
  for (const j of map.values()) { total += num(j.totalCount); fail += num(j.failCount); pend += num(j.pending); }
  return { total, fail, pend };
}

function diffRows(mapA, mapB, by, filterOS = null) {
  const a = aggregate(mapA, by, filterOS);
  const b = aggregate(mapB, by, filterOS);
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return keys.map(k => {
    const A = a[k] || { total: 0, fail: 0, pend: 0 };
    const B = b[k] || { total: 0, fail: 0, pend: 0 };
    const passA = passPct(A.total, A.fail), passB = passPct(B.total, B.fail);
    const runA  = runPct(A.total, A.pend),  runB  = runPct(B.total, B.pend);
    return {
      key: k, A, B, passA, passB, runA, runB,
      passDelta: passB - passA, runDelta: runB - runA,
    };
  });
}

const CATEGORIES = {
  regressed:    { label: 'Regressed',     icon: TrendingDown, cls: 'text-red-600 dark:text-red-400',       ring: 'ring-red-500/30' },
  fixed:        { label: 'Fixed',         icon: TrendingUp,   cls: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30' },
  stillFailing: { label: 'Still failing', icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-500/30' },
  added:        { label: 'New jobs',      icon: PlusCircle,   cls: 'text-blue-600 dark:text-blue-400',       ring: 'ring-blue-500/30' },
  dropped:      { label: 'Not run in B',  icon: MinusCircle,  cls: 'text-gray-500 dark:text-gray-400',       ring: 'ring-gray-500/20' },
};

function jobDiff(mapA, mapB) {
  const buckets = { regressed: [], fixed: [], stillFailing: [], added: [], dropped: [] };
  const ids = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const id of ids) {
    const a = mapA.get(id), b = mapB.get(id);
    const aReal = isReal(a), bReal = isReal(b);
    const aPass = jobPassed(a), bPass = jobPassed(b);
    const meta = b || a;
    const row = {
      id,
      os: meta.os, component: meta.component,
      name: meta.displayName || meta.name,
      url: (b && b.url) || (a && a.url) || '',
      aPass: aReal ? passPct(num(a.totalCount), num(a.failCount)) : null,
      bPass: bReal ? passPct(num(b.totalCount), num(b.failCount)) : null,
      aFail: aReal ? num(a.failCount) : null,
      bFail: bReal ? num(b.failCount) : null,
    };
    if (aReal && bReal) {
      if (aPass && !bPass)        buckets.regressed.push(row);
      else if (!aPass && bPass)   buckets.fixed.push(row);
      else if (!aPass && !bPass)  buckets.stillFailing.push(row);
    } else if (bReal && !aReal)   buckets.added.push(row);
    else if (aReal && !bReal)     buckets.dropped.push(row);
  }
  const byFail = (x, y) => (y.bFail ?? y.aFail ?? 0) - (x.bFail ?? x.aFail ?? 0);
  Object.values(buckets).forEach(arr => arr.sort(byFail));
  return buckets;
}

function Delta({ v, suffix = '%' }) {
  if (v === 0 || v == null) return <span className="text-gray-400">0{suffix}</span>;
  const up = v > 0;
  return (
    <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
      {up ? '+' : ''}{v}{suffix}
    </span>
  );
}

function GroupedBar({ title, data, dataKeyA, dataKeyB, labelA, labelB }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{title}</h3>
      {data.length === 0
        ? <p className="text-center text-gray-400 py-8 text-sm">No data</p>
        : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-white/10" />
              <XAxis dataKey="key" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={64} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar name={labelA} dataKey={dataKeyA} fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar name={labelB} dataKey={dataKeyB} fill="#22c55e" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
    </div>
  );
}

function CompareTable({ rows, labelA, labelB, onRowClick, activeKey }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 dark:bg-white/[0.03]">
        <tr>
          <th className="tbl-head text-left">Name</th>
          <th className="tbl-head">Run% {labelA}</th>
          <th className="tbl-head">Run% {labelB}</th>
          <th className="tbl-head">Δ</th>
          <th className="tbl-head">Pass% {labelA}</th>
          <th className="tbl-head">Pass% {labelB}</th>
          <th className="tbl-head">Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}
              onClick={onRowClick ? () => onRowClick(r.key) : undefined}
              className={`tbl-row ${onRowClick ? 'cursor-pointer' : ''} ${activeKey === r.key ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}>
            <td className="tbl-cell font-mono text-xs text-left flex items-center gap-1">
              {onRowClick && <ChevronRight size={12} className={`transition-transform ${activeKey === r.key ? 'rotate-90' : ''} text-gray-400`} />}
              {r.key}
            </td>
            <td className="tbl-cell tabular-nums">{r.runA}%</td>
            <td className="tbl-cell tabular-nums">{r.runB}%</td>
            <td className="tbl-cell tabular-nums font-medium"><Delta v={r.runDelta} /></td>
            <td className="tbl-cell tabular-nums">{r.passA}%</td>
            <td className="tbl-cell tabular-nums">{r.passB}%</td>
            <td className="tbl-cell tabular-nums font-medium"><Delta v={r.passDelta} /></td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={7} className="text-center text-gray-400 py-6 text-sm">No data</td></tr>
        )}
      </tbody>
    </table>
  );
}

function JobDiffSection({ catKey, rows, labelA, labelB, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const cat = CATEGORIES[catKey];
  const Icon = cat.icon;
  return (
    <div className={`card overflow-hidden ring-1 ${cat.ring}`}>
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <ChevronRight size={14} className={`transition-transform text-gray-400 ${open ? 'rotate-90' : ''}`} />
        <Icon size={16} className={cat.cls} />
        <h3 className={`text-sm font-semibold ${cat.cls}`}>{cat.label}</h3>
        <span className="ml-2 text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300">
          {rows.length}
        </span>
      </button>
      {open && rows.length > 0 && (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] sticky top-0">
              <tr>
                <th className="tbl-head text-left">Job</th>
                <th className="tbl-head text-left">Platform</th>
                <th className="tbl-head text-left">Component</th>
                <th className="tbl-head">{labelA}</th>
                <th className="tbl-head">{labelB}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="tbl-row">
                  <td className="tbl-cell text-left">
                    <span className="font-mono text-xs">{r.name}</span>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer"
                         className="ml-1.5 inline-flex text-brand-500 hover:text-brand-600 align-middle">
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </td>
                  <td className="tbl-cell text-left font-mono text-xs text-gray-500">{r.os}</td>
                  <td className="tbl-cell text-left font-mono text-xs text-gray-500">{r.component}</td>
                  <td className="tbl-cell tabular-nums">{r.aPass == null ? '—' : `${r.aPass}%`}{r.aFail ? <span className="text-red-500 text-xs ml-1">({r.aFail}✗)</span> : null}</td>
                  <td className="tbl-cell tabular-nums">{r.bPass == null ? '—' : `${r.bPass}%`}{r.bFail ? <span className="text-red-500 text-xs ml-1">({r.bFail}✗)</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Compare() {
  const nav = useNavigate();
  const [target, setTarget] = useState('server');
  const [vA, setVA] = useState('');
  const [vB, setVB] = useState('');
  const [bA, setBA] = useState('');
  const [bB, setBB] = useState('');
  const [activeOS, setActiveOS] = useState(null);

  const { data: versions = [] } = useQuery({
    queryKey: ['versions', target], queryFn: () => api.getVersions(target), enabled: !!target,
  });
  const { data: buildsA = [] } = useQuery({
    queryKey: ['compare-builds', target, vA], queryFn: () => api.getCompareBuilds(target, vA), enabled: !!(target && vA),
  });
  const { data: buildsB = [] } = useQuery({
    queryKey: ['compare-builds', target, vB], queryFn: () => api.getCompareBuilds(target, vB), enabled: !!(target && vB),
  });

  useEffect(() => {
    if (versions.length) {
      if (!vA) setVA(versions[0]);
      if (!vB) setVB(versions[0]);
    }
  }, [versions]); // eslint-disable-line
  useEffect(() => { if (buildsB.length && !bB) setBB(buildsB[0].build); }, [buildsB]); // eslint-disable-line
  useEffect(() => {
    if (buildsA.length && !bA) setBA((buildsA[1] || buildsA[0]).build);
  }, [buildsA]); // eslint-disable-line

  const onVA = (v) => { setVA(v); setBA(''); };
  const onVB = (v) => { setVB(v); setBB(''); };
  const onTarget = (t) => { setTarget(t); setVA(''); setVB(''); setBA(''); setBB(''); setActiveOS(null); };

  const ready = !!(bA && bB && bA !== bB);

  const { data: compareData, isLoading } = useQuery({
    queryKey: ['compare-jobs', target, bA, bB],
    queryFn:  () => api.getCompareJobs(target, [bA, bB]),
    enabled:  ready,
  });

  const mapA = useMemo(() => buildIndex(compareData?.[bA]), [compareData, bA]);
  const mapB = useMemo(() => buildIndex(compareData?.[bB]), [compareData, bB]);

  const osRows   = useMemo(() => diffRows(mapA, mapB, 'os'), [mapA, mapB]);
  const compRows = useMemo(() => activeOS ? diffRows(mapA, mapB, 'component', activeOS) : [], [mapA, mapB, activeOS]);
  const diff     = useMemo(() => jobDiff(mapA, mapB), [mapA, mapB]);

  const tA = useMemo(() => totals(mapA), [mapA]);
  const tB = useMemo(() => totals(mapB), [mapB]);

  useEffect(() => {
    if (compareData && osRows.length && (!activeOS || !osRows.find(r => r.key === activeOS))) {
      setActiveOS(osRows[0].key);
    }
  }, [compareData, osRows]); // eslint-disable-line

  const buildOpts = (list) => list.map(b => ({ value: b.build, label: b.build }));

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-16 bg-sidebar flex flex-col items-center py-4 gap-4">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">G</div>
        <button onClick={() => nav('/')} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 mt-auto mb-2">
          <ArrowLeft size={16} />
        </button>
      </aside>

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-20">
          <div className="flex items-center gap-3 mb-5">
            <GitCompare size={20} className="text-brand-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Compare Builds</h1>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</label>
              <Dropdown value={target} onChange={onTarget}
                        options={TARGETS.map(t => ({ value: t, label: t }))} className="w-40" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Build A</label>
              <div className="flex gap-2">
                <Dropdown value={vA} onChange={onVA} options={versions.map(v => ({ value: v, label: v }))} placeholder="Version" className="w-28" />
                <Dropdown value={bA} onChange={setBA} options={buildOpts(buildsA)} placeholder={vA ? 'Build' : 'Pick version'} className="w-40" />
              </div>
            </div>

            <div className="text-xl text-gray-300 dark:text-gray-600 pb-1.5 font-semibold">vs</div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-emerald-500 uppercase tracking-wide">Build B</label>
              <div className="flex gap-2">
                <Dropdown value={vB} onChange={onVB} options={versions.map(v => ({ value: v, label: v }))} placeholder="Version" className="w-28" />
                <Dropdown value={bB} onChange={setBB} options={buildOpts(buildsB)} placeholder={vB ? 'Build' : 'Pick version'} className="w-40" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {!ready && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
              <GitCompare size={32} className="opacity-30" />
              <p>{bA && bA === bB ? 'Pick two different builds' : 'Select two builds to compare'}</p>
            </div>
          )}

          {ready && isLoading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {ready && !isLoading && compareData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Pass %', a: passPct(tA.total, tA.fail), b: passPct(tB.total, tB.fail), suffix: '%' },
                  { label: 'Run %',  a: runPct(tA.total, tA.pend),  b: runPct(tB.total, tB.pend),  suffix: '%' },
                  { label: 'Tests run', a: tA.total, b: tB.total, suffix: '' },
                  { label: 'Failures',  a: tA.fail,  b: tB.fail,  suffix: '', invert: true },
                ].map(c => {
                  const d = c.b - c.a;
                  const good = c.invert ? d < 0 : d > 0;
                  return (
                    <div key={c.label} className="card p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.label}</p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{c.b}{c.suffix}</span>
                        <span className="text-xs text-gray-400">from {c.a}{c.suffix}</span>
                      </div>
                      {d !== 0 && (
                        <span className={`text-xs font-medium ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {d > 0 ? '+' : ''}{d}{c.suffix}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <GroupedBar title="Pass % by Platform" data={osRows} dataKeyA="passA" dataKeyB="passB" labelA={bA} labelB={bB} />
                <GroupedBar title="Run % by Platform"  data={osRows} dataKeyA="runA"  dataKeyB="runB"  labelA={bA} labelB={bB} />
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Platform summary <span className="text-gray-400 font-normal">— click a row to break down by component</span></h3>
                </div>
                <CompareTable rows={osRows} labelA={bA} labelB={bB}
                              onRowClick={(k) => setActiveOS(k === activeOS ? null : k)} activeKey={activeOS} />
              </div>

              {activeOS && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <GroupedBar title={`Pass % by Component — ${activeOS}`} data={compRows} dataKeyA="passA" dataKeyB="passB" labelA={bA} labelB={bB} />
                    <GroupedBar title={`Run % by Component — ${activeOS}`}  data={compRows} dataKeyA="runA"  dataKeyB="runB"  labelA={bA} labelB={bB} />
                  </div>
                  <div className="card overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Component summary — {activeOS}</h3>
                    </div>
                    <CompareTable rows={compRows} labelA={bA} labelB={bB} />
                  </div>
                </>
              )}

              <div>
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <GitCompare size={15} /> Job changes — {bA} → {bB}
                </h2>
                <div className="space-y-3">
                  <JobDiffSection catKey="regressed"    rows={diff.regressed}    labelA={bA} labelB={bB} defaultOpen />
                  <JobDiffSection catKey="fixed"         rows={diff.fixed}        labelA={bA} labelB={bB} defaultOpen />
                  <JobDiffSection catKey="stillFailing"  rows={diff.stillFailing} labelA={bA} labelB={bB} defaultOpen={false} />
                  <JobDiffSection catKey="added"         rows={diff.added}        labelA={bA} labelB={bB} defaultOpen={false} />
                  <JobDiffSection catKey="dropped"       rows={diff.dropped}      labelA={bA} labelB={bB} defaultOpen={false} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
