import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Coins } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../api';
import './tokens.css';

const COOL = '#34e2b0', BLUE = '#5aa0e0', GOLD = '#ffc857', HOT = '#ff6a3d';
const PHASE_COLOR = { summarize: BLUE, analysis: GOLD };

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
const fmtInt = (n) => (Number(n) || 0).toLocaleString();
function cr(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B cr';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M cr';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K cr';
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' cr';
}
function fmtDur(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return s + 's';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtHour(t) {
  if (!t || t.length < 13) return t;
  const d = new Date(t + ':00:00Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
}

function Kpi({ label, value, sub, accent, credit }) {
  return (
    <div className={`tok-kpi ${accent ? 'accent' : ''}`}>
      <div className="k-label">{label}</div>
      <div className="k-val" style={credit ? { color: COOL } : undefined}>{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="tok-mini">
      <div className="m-label">{label}</div>
      <div className="m-val">{value}</div>
    </div>
  );
}

function Funnel({ input, output }) {
  const total = (input || 0) + (output || 0) || 1;
  const ratio = (output || 0) / total;
  const H = 150, pad = 14, fullH = H - pad * 2, mid = H / 2;
  const outH = Math.max(6, fullH * Math.max(ratio, 0.015));
  const pts = `0,${pad} 100,${mid - outH / 2} 100,${mid + outH / 2} 0,${H - pad}`;
  const pct = Math.round(ratio * 100);
  return (
    <div className="tok-funnel-row">
      <div className="tok-funnel-end left">
        <div className="cap">input</div>
        <div className="big">{fmt(input)}</div>
        <div className="mny">tokens read</div>
      </div>
      <div className="tok-funnel-wrap" style={{ height: H }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H }}>
          <defs>
            <linearGradient id="funnel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COOL} stopOpacity="0.92" />
              <stop offset="100%" stopColor={BLUE} stopOpacity="0.92" />
            </linearGradient>
          </defs>
          <polygon points={pts} fill="url(#funnel)" />
        </svg>
        <div className="tok-funnel-mid">{pct}%</div>
      </div>
      <div className="tok-funnel-end right">
        <div className="cap">output</div>
        <div className="big">{fmt(output)}</div>
        <div className="mny">generated</div>
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f1623', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
      <div style={{ color: '#9aa7b8', marginBottom: 4, fontFamily: 'ui-monospace, monospace' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#e5ecf5' }}>{fmtInt(p.value)} tokens</div>
      ))}
    </div>
  );
}

export default function Tokens() {
  const nav = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tokens'],
    queryFn: api.getTokens,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const t = data?.totals || {};
  const compMax  = useMemo(() => Math.max(1, ...(data?.byComponent || []).map(c => c.total)), [data]);
  const jobMax   = useMemo(() => Math.max(1, ...(data?.topJobs || []).map(j => j.total)), [data]);
  const phaseMax = useMemo(() => Math.max(1, ...(data?.byPhase || []).map(p => p.total)), [data]);
  const phasePie = (data?.byPhase || []).map(p => ({ name: p.phase, value: p.total }));
  const timeData = (data?.overTime || []).map(x => ({ ...x, label: fmtHour(x.t) }));
  const outputRatio = t.total ? (t.output / t.total) * 100 : 0;

  return (
    <div className="tok-page">
      <header className="tok-header">
        <button className="tok-back" onClick={() => nav('/')} title="Back to dashboard"><ArrowLeft size={17} /></button>
        <Coins size={20} style={{ color: COOL }} />
        <div>
          <div className="tok-title">Droid Token Utilization</div>
          <div className="tok-sub">AI test-analysis spend · {data?.byModel?.[0]?.model || 'deepseek-v4-pro'}</div>
        </div>
        <div className="tok-live">
          <span className="tok-dot" /> live · 30s
          {data?.generatedAt && <span>· {new Date(data.generatedAt).toLocaleTimeString()}</span>}
        </div>
      </header>

      <div className="tok-body">
        {isLoading && <div className="tok-empty">Loading token usage…</div>}
        {isError && <div className="tok-empty">Could not load token usage.</div>}

        {data && t.calls === 0 && (
          <div className="tok-empty">
            No droid calls recorded yet.<br />
            <span style={{ fontSize: 12 }}>Fills in as the Test Analysis reconciliation runs.</span>
          </div>
        )}

        {data && t.calls > 0 && (
          <>
            <div className="tok-kpis">
              <Kpi accent label="Total tokens" value={fmt(t.total)} sub={`${fmtInt(t.total)} total`} />
              <Kpi credit label="Est. credits" value={cr(t.credits)}
                   sub={`${fmt(data.creditsPerM)} cr / M tokens`} />
              <Kpi label="Droid calls" value={fmtInt(t.calls)}
                   sub={(data.byPhase || []).map(p => `${p.calls} ${p.phase.slice(0, 4)}`).join(' · ')} />
              <Kpi label="Avg / call" value={fmt(t.avg)} sub={`${fmtInt(t.avg)} tokens`} />
              <Kpi label="Output ratio" value={`${outputRatio.toFixed(1)}%`} sub={`${fmt(t.output)} of ${fmt(t.total)}`} />
              <Kpi label="Droid time" value={fmtDur(t.durationMs)} sub={`${fmtInt(t.tokensPerSec)} tok/s`} />
            </div>

            <div className="tok-grid">
              <div className="tok-panel col-8">
                <h3>Hourly throughput <span className="tok-rate-note">tokens / hour</span></h3>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={timeData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tokFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COOL} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={COOL} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7889', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                    <YAxis tickFormatter={fmt} tick={{ fill: '#6b7889', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" width={46} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="total" stroke={COOL} strokeWidth={2} fill="url(#tokFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="tok-panel col-4">
                <h3>By phase</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={phasePie} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                      {phasePie.map((p, i) => <Cell key={i} fill={PHASE_COLOR[p.name] || HOT} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                {(data.byPhase || []).map((p, i) => (
                  <div className="tok-phase-row" key={i}>
                    <span className="pname"><i style={{ background: PHASE_COLOR[p.phase] || HOT }} />{p.phase}</span>
                    <span className="ptrack"><span className="pfill" style={{ width: `${(p.total / phaseMax) * 100}%`, background: PHASE_COLOR[p.phase] || HOT }} /></span>
                    <span className="pmny">
                      <span className="ptok">{fmt(p.total)} tok</span>
                      <span className="pcr tok-cost">{cr(p.credits)}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="tok-panel col-7">
                <h3>Input → output conversion</h3>
                <Funnel input={t.input} output={t.output} />
                <div className="tok-funnel-note">
                  Only {outputRatio.toFixed(0)}% of tokens are generated — the rest is context the droids read.
                </div>
              </div>

              <div className="tok-panel col-5">
                <h3>Efficiency</h3>
                <div className="tok-mini-grid">
                  <Mini label="Credits / call" value={cr(t.creditsPerCall)} />
                  <Mini label="Credits / 1K tokens" value={cr(t.creditsPer1k)} />
                  <Mini label="Tokens / sec" value={fmtInt(t.tokensPerSec)} />
                  <Mini label="Output efficiency" value={`${outputRatio.toFixed(1)}%`} />
                </div>
              </div>

              <div className="tok-panel col-12">
                <h3>Top jobs by token spend</h3>
                <table className="tok-tbl">
                  <thead>
                    <tr>
                      <th>Job</th><th>Component</th>
                      <th style={{ textAlign: 'right' }}>Calls</th>
                      <th style={{ textAlign: 'right' }}>Tokens</th>
                      <th style={{ textAlign: 'right' }}>Est. credits</th>
                      <th style={{ width: 150 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.topJobs || []).map((j, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.job_name}>{j.job_name}</td>
                        <td><span className="tok-chip">{j.component || '—'}</span></td>
                        <td className="num">{fmtInt(j.calls)}</td>
                        <td className="num">{fmt(j.total)}</td>
                        <td className="num tok-cost">{cr(j.credits)}</td>
                        <td><span className="tok-bar-track"><span className="tok-bar-fill" style={{ width: `${(j.total / jobMax) * 100}%` }} /></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="tok-funnel-note" style={{ marginTop: 14 }}>
              Credits estimated at {fmt(data.creditsPerM)} cr / 1M tokens (Factory is metered in credits, not $).
              Set the real ratio in config (CREDITS_PER_1M_TOKENS) from app.factory.ai/settings/usage.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
