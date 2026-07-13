import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Zap, Flame, Sparkles, Activity, Search, Coins,
  Database, Layers, Radio,
} from 'lucide-react';
import './releasenotes.css';

const REDUCED = typeof window !== 'undefined'
  && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useCountUps(rootRef) {
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = [...root.querySelectorAll('[data-count]')];
    if (REDUCED) { els.forEach(e => e.textContent = e.dataset.count); return; }
    const run = (el) => {
      const to = +el.dataset.count; const dur = 1100; const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * e).toString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [rootRef]);
}

function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = [...root.querySelectorAll('.rn-reveal')];
    if (REDUCED) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [rootRef]);
}

const DEMO_INIT = [
  { nm: 'debian-eventing_curl_6.5', os: 'DEBIAN', st: 'pass' },
  { nm: 'win-2i_index_stats_plasma', os: 'WIN',    st: 'pend' },
  { nm: 'centos-fts_sanity_vector',  os: 'CENTOS', st: 'run'  },
];
const BADGE = { pend: ['b-pend','Pending'], run: ['b-run','Running'], pass: ['b-pass','Pass'], fail: ['b-fail','Fail'] };
function LiveDemo() {
  const [rows, setRows] = useState(DEMO_INIT);
  const [flash, setFlash] = useState(-1);
  useEffect(() => {
    if (REDUCED) return;
    let i = 0;
    const seq = [
      (r) => { r[1].st = 'run'; return 1; },
      (r) => { r[2].st = 'pass'; return 2; },
      (r) => { r[1].st = 'pass'; return 1; },
      (r) => { r[0].st = 'run';  return 0; },
      (r) => { r[0].st = 'fail'; return 0; },
      (r) => { r[2].st = 'run';  return 2; },
      (r) => { r[0].st = 'pend'; r[1].st = 'pend'; r[2].st = 'run'; return -1; },
    ];
    const id = setInterval(() => {
      setRows(prev => { const next = prev.map(x => ({ ...x })); const hit = seq[i % seq.length](next);
        setFlash(hit); return next; });
      i++;
      setTimeout(() => setFlash(-1), 700);
    }, 1700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rn-demo">
      <div className="rn-demo-bar">
        <Radio size={13} /> a build, updating itself
        <span className="live"><span className="rn-live-dot" /> LIVE</span>
      </div>
      {rows.map((r, i) => {
        const [cls, label] = BADGE[r.st];
        return (
          <div key={r.nm} className={`rn-row ${flash === i ? 'flash' : ''}`}>
            <span className="os">{r.os}</span>
            <span className="nm">{r.nm}</span>
            <span className={`rn-bdg ${cls}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReleaseNotes() {
  const nav = useNavigate();
  const pageRef = useRef(null);
  useCountUps(pageRef);
  useReveal(pageRef);

  return (
    <div className="rn-page" ref={pageRef}>
      <button className="rn-back" onClick={() => nav('/')} title="Back to dashboard"><ArrowLeft size={17} /></button>

      <div className="rn-hero">
        <div className="rn-hero-mask" />
        <div className="rn-hero-inner">
          <span className="rn-badge"><Sparkles size={12} /> What's new</span>
          <h1>Greenboard v4</h1>
          <div className="tag">Faster · live · with AI test-failure analysis</div>
          <div className="ver">
            <span>Version <b>4.0</b></span> · <span>Server</span> ·
            <span className="live"><span className="rn-live-dot" /> live</span> · July 2026
          </div>
        </div>
        <div className="rn-stat">
          <div className="big">~<span data-count="520">0</span>×</div>
          <div className="lil">
            <div className="n">7&nbsp;s&nbsp;→&nbsp;~14&nbsp;ms</div>
            <div className="l">a build now opens from memory, not a cold parse</div>
          </div>
          <div className="div" />
          <div className="lil">
            <div className="n">~<span data-count="13">0</span>&nbsp;s</div>
            <div className="l">from a result landing to it appearing on screen — no refresh</div>
          </div>
        </div>
      </div>

      <div className="rn-wrap">

        <div className="rn-h2 rn-reveal">Highlights</div>
        <div className="rn-grid">
          <div className="rn-card acc-green rn-reveal"><div className="ic"><Zap size={18} /></div>
            <h3>Instant &amp; live</h3>
            <p>Builds open in milliseconds, and the board updates itself as results land — changed rows light up in place. No spinner, no refresh button.</p></div>
          <div className="rn-card acc-green rn-reveal"><div className="ic"><Flame size={18} /></div>
            <h3>Test Insights heatmap</h3>
            <p>Pass-rate at a glance across platform × component, with a status donut. Click any cell to focus the board on it.</p></div>
          <div className="rn-card acc-violet rn-reveal"><div className="ic"><Sparkles size={18} /></div>
            <h3>AI Test Analysis</h3>
            <p>Every failing job gets an automated breakdown: a verdict (regression / flaky / infra…), the likely root cause, and a concrete next step — plus a per-component rollup.</p></div>
          <div className="rn-card acc-green rn-reveal"><div className="ic"><Activity size={18} /></div>
            <h3>Release readiness</h3>
            <p>Per-version cards with pass-rate, run %, and the delta vs the previous full build — always landing on the latest real build.</p></div>
          <div className="rn-card acc-sky rn-reveal"><div className="ic"><Search size={18} /></div>
            <h3>A jobs table that keeps up</h3>
            <p>Instant search, status tabs, filters, per-job trend, auto-triage, one-click rerun, Jenkins &amp; S3 log links, and copy-jobs.</p></div>
          <div className="rn-card acc-gold rn-reveal"><div className="ic"><Coins size={18} /></div>
            <h3>Token Usage tab</h3>
            <p>See exactly what the AI analysis costs — spend by phase, component and build, and over time — so the shared budget stays in view.</p></div>
        </div>

        <div className="rn-h2 rn-reveal">How it works</div>
        <div className="rn-flow">
          <div className="rn-step rn-reveal"><div className="num">01 · COLLECT</div>
            <h3>The collector</h3>
            <p>A rebuilt, modular service polls Jenkins, scrapes each build into a per-run doc, and a Couchbase <b>Eventing</b> function folds them into one build document (<code>os → component → job → runs</code>).</p></div>
          <div className="rn-step rn-reveal"><div className="num">02 · SNAPSHOT</div>
            <h3>Served from memory</h3>
            <p>That doc is large (up to ~20&nbsp;MB). It's parsed <b>in the background</b> and kept as a ready-to-serve snapshot in RAM — so a read is a memory lookup, not a multi-second parse.</p></div>
          <div className="rn-step rn-reveal"><div className="num">03 · STREAM</div>
            <h3>Live updates</h3>
            <p>When a snapshot changes, only the <b>changed rows</b> are streamed to open boards. The page patches itself — the numbers move while you watch. ↓</p></div>
        </div>
        <div className="rn-reveal"><LiveDemo /></div>

        <div className="rn-h2 rn-reveal">Under the hood</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="rn-prose rn-reveal">
            <h3><Database size={15} style={{ color: 'var(--sky)' }} /> The collector, rebuilt</h3>
            <p>The collector was rewritten from a single large script into a modular service. It polls Jenkins on an interval, turns each build into a per-run document, and lets a database-side Eventing function do the folding — so the heavy work happens close to the data.</p>
            <p>Component grouping is now driven by a curated catalog (<code>gb_label</code>) instead of a hard-coded, order-sensitive list. Regrouping a component is a data change, not a code change and redeploy — and it stays consistent across every build.</p>
          </div>
          <div className="rn-prose rn-reveal">
            <h3><Layers size={15} style={{ color: 'var(--green)' }} /> Snapshotting — the core idea</h3>
            <p>One rule shapes the whole backend: <b>never do heavy work on the request path.</b> Parsing a 20&nbsp;MB build document per click used to cost seconds and could stall the page. Instead, a background refresher keeps an in-memory snapshot of every active build:</p>
            <span className="mono-flow">build doc &nbsp;──▶&nbsp; <b>refresher</b> (background, one at a time) &nbsp;──▶&nbsp; <b>snapshot in RAM</b> &nbsp;──▶&nbsp; page read ≈ 1&nbsp;ms</span>
            <p>A change is detected cheaply (a metadata check, no full fetch), the heavy parse runs off the main thread, and the finished snapshot is swapped in atomically. Reads are always instant, and the build you land on is pre-warmed — so even the first view is instant.</p>
          </div>
          <div className="rn-prose rn-reveal">
            <h3><Radio size={15} style={{ color: 'var(--violet)' }} /> The live board</h3>
            <p>Once a build is on screen, it stays current on its own. When the snapshot changes, the server computes the difference and streams just the changed rows to every browser watching that build. No polling, no reload — a job that finishes, a rerun that lands, a count that ticks up all appear in place, typically within seconds.</p>
          </div>
          <div className="rn-prose rn-reveal">
            <h3><Sparkles size={15} style={{ color: 'var(--gold)' }} /> The AI analysis pipeline</h3>
            <p>For every failing run, the console log is first distilled to just the evidence — the failing tests, their tracebacks, and a tight window of error lines — so the model reads signal, not thousands of lines of noise. Then two passes run: a per-failure summary, and a per-job verdict that folds those together with the job's history and trend.</p>
            <p>The split is deliberate: <b>code owns the numbers</b> (counts, history, pass-rate) and the <b>model owns the judgement</b> (headline, verdict, action) — so figures stay exact and reproducible. Identical failures are analysed once and reused, with a per-job cap keeping the shared token budget under control.</p>
          </div>
        </div>

        <div className="rn-h2 rn-reveal">What you can do</div>
        <div className="rn-two">
          <ul className="rn-list rn-reveal">
            <li><b>Search &amp; slice instantly</b> — free-text search plus status tabs and platform/component filters.</li>
            <li><b>Understand a failure</b> — open <b>Test Analysis</b> on any failing job for the AI breakdown. <span className="rn-pill">AI</span></li>
            <li><b>Zoom out to a component</b> — <b>Component Analysis</b> rolls every job's analysis into verdicts, categories and recurring themes. <span className="rn-pill">AI</span></li>
            <li><b>See the trend</b> — per-job pass/fail across recent builds, plus a legacy per-build bar chart.</li>
          </ul>
          <ul className="rn-list rn-reveal">
            <li><b>Act without leaving</b> — jump to Jenkins &amp; S3 logs, view auto-triage, re-run a job, or copy the job list.</li>
            <li><b>Track AI spend</b> — the <b>Token Usage</b> tab breaks cost down by phase, component, build and time. <span className="rn-pill">AI</span></li>
            <li><b>Check the fleet</b> — the QE server-pool view (available / in-use / broken) with per-node detail.</li>
            <li><b>Save &amp; share views</b> — capture a filtered view and share it by link; dark / light mode included.</li>
          </ul>
        </div>

        <div className="rn-h2 rn-reveal">Good to know</div>
        <div className="rn-note rn-reveal">
          <b>Still filling in:</b> the AI analysis is reconciling historical builds, so a few components may read
          “partial — analysis still running” for a bit. Found a wrong grouping, an off verdict, or anything that
          looks strange? Please flag it — early feedback directly shapes the next iteration.
        </div>

        <div className="rn-foot">Greenboard v4 · QE Dashboard · greenboard.sc.couchbase.com</div>
      </div>
    </div>
  );
}
