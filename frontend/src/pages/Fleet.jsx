import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './fleet.css';

const BUCKETS = [
  { key: 'available', label: 'available', color: '#5dd98a' },
  { key: 'inuse',     label: 'in use',    color: '#5aa0e0' },
  { key: 'broken',    label: 'broken',    color: '#f07868' },
  { key: 'disabled',  label: 'disabled',  color: '#6b7785' },
  { key: 'other',     label: 'other',     color: '#b87506' },
  { key: 'unknown',   label: 'unknown',   color: '#2a3441' },
];
const COLOR = Object.fromEntries(BUCKETS.map(b => [b.key, b.color]));

function fmtMem(kb) {
  const n = Number(kb);
  if (!n) return '—';
  return (n / 1024 / 1024).toFixed(1) + ' GB';
}

function Rail({ fleet }) {
  const counts = useMemo(() => {
    const c = {}; fleet.forEach(m => { c[m.bucket] = (c[m.bucket] || 0) + 1; });
    return c;
  }, [fleet]);
  const os = useMemo(() => {
    const c = {}; fleet.forEach(m => { const k = m.os || '(none)'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [fleet]);
  const total = fleet.length;
  const broken = counts.broken || 0;
  const inuse = counts.inuse || 0;

  return (
    <div className="fleet-rail">
      <div>
        <div className="fleet-rail-label">Fleet</div>
        <div className="fleet-stat">
          <div className="label">Total machines</div>
          <div className="val">{total.toLocaleString()}</div>
          <div className="sub">{inuse} in use · {counts.available || 0} free</div>
        </div>
      </div>
      <div className="fleet-stat bad">
        <div className="label">Broken / needs attention</div>
        <div className="val">{broken.toLocaleString()}</div>
        <div className="sub">{total ? Math.round((broken / total) * 100) : 0}% of fleet</div>
      </div>

      <div>
        <div className="fleet-rail-label">By state</div>
        <div className="fleet-breakdown">
          {BUCKETS.filter(b => counts[b.key]).map(b => (
            <div key={b.key} className="fleet-bd-row">
              <span className="sw" style={{ background: b.color }} />
              <span className="nm">{b.label}</span>
              <span className="ct">{counts[b.key].toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="fleet-rail-label">By OS</div>
        <div className="fleet-breakdown">
          {os.map(([name, ct]) => (
            <div key={name} className="fleet-bd-row">
              <span className="nm" style={{ color: '#8b95a3' }}>{name}</span>
              <span className="ct">{ct.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PoolSection({ name, machines, selected, onSelect }) {
  const counts = {};
  machines.forEach(m => { counts[m.bucket] = (counts[m.bucket] || 0) + 1; });
  const total = machines.length;

  return (
    <div className="fleet-pool">
      <div className="fleet-pool-hdr">
        <span className="fleet-pool-name">{name}</span>
        <span className="fleet-pool-count">{total}</span>
        <div className="fleet-pool-bar">
          {BUCKETS.filter(b => counts[b.key]).map(b => (
            <i key={b.key} style={{ width: `${(counts[b.key] / total) * 100}%`, background: b.color }} />
          ))}
        </div>
      </div>
      <div className="fleet-grid">
        {machines.map(m => (
          <button
            key={m.ip}
            className={`fleet-cell ${m.bucket} ${selected === m.ip ? 'sel' : ''}`}
            title={`${m.ip} · ${m.state || m.bucket}`}
            onClick={() => onSelect(m.ip)}
          />
        ))}
      </div>
    </div>
  );
}

function Detail({ ip, onClose }) {
  const { data: node, isLoading, isError } = useQuery({
    queryKey: ['fleet-node', ip], queryFn: () => api.getFleetNode(ip), enabled: !!ip, retry: false,
  });
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(ip); setCopied(true); setTimeout(() => setCopied(false), 1200); };

  const pools = node ? (Array.isArray(node.poolId) ? node.poolId : [node.poolId].filter(Boolean)) : [];
  const tags = node?.tags?.details || {};

  return (
    <div className="fleet-detail">
      <button className="close" onClick={onClose}>close ✕</button>
      <div className="ip">{ip}</div>
      {isLoading && <div className="fleet-detail-empty">loading…</div>}
      {isError && <div className="fleet-detail-empty">could not load machine</div>}
      {node && (
        <>
          {node.state && <span className="fleet-chip state on">{node.state}</span>}
          <div className="fleet-kv">
            <div className="k">vm name</div><div className="v">{node.vm_name || '—'}</div>
            <div className="k">os</div><div className="v">{node.os || '—'}</div>
            <div className="k">os version</div><div className="v">{node.os_version || '—'}</div>
            <div className="k">pools</div><div className="v">{pools.length ? pools.join(', ') : '—'}</div>
            <div className="k">memory</div><div className="v">{fmtMem(node.memory)}</div>
            <div className="k">mac</div><div className="v">{node.mac_address || '—'}</div>
            <div className="k">origin</div><div className="v">{node.origin || '—'}</div>
            {node.ver && (<><div className="k">ver</div><div className="v">{node.ver}</div></>)}
            <div className="k">conn check</div><div className="v">{tags.connection_check === undefined ? '—' : String(tags.connection_check)}</div>
            <div className="k">avx2</div><div className="v">{tags.avx2_present === undefined ? '—' : String(tags.avx2_present)}</div>
            <div className="k">current</div><div className="v">{node.username || '—'}</div>
            <div className="k">previous</div><div className="v">{node.prevUser || '—'}</div>
          </div>
          <button className="fleet-copy" onClick={copy}>{copied ? '✓ copied' : 'copy IP'}</button>
        </>
      )}
    </div>
  );
}

export default function Fleet() {
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: fleet = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['fleet'], queryFn: api.getFleet, retry: false, staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const c = {}; fleet.forEach(m => { c[m.bucket] = (c[m.bucket] || 0) + 1; });
    return c;
  }, [fleet]);

  const pools = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map();
    for (const m of fleet) {
      if (filter !== 'all' && m.bucket !== filter) continue;
      if (q && !(m.ip.toLowerCase().includes(q) || (m.vm_name || '').toLowerCase().includes(q))) continue;
      const ps = m.pools.length ? m.pools : ['(no pool)'];
      for (const p of ps) {
        if (!map.has(p)) map.set(p, []);
        map.get(p).push(m);
      }
    }
    return [...map.entries()]
      .map(([name, machines]) => ({ name, machines }))
      .sort((a, b) => b.machines.length - a.machines.length);
  }, [fleet, filter, search]);

  const poolCount = useMemo(() => new Set(fleet.flatMap(m => m.pools)).size, [fleet]);

  return (
    <div className="fleet-console">
      <div className="fleet-topbar">
        <span className="fleet-brand">QE·FLEET<span>.</span></span>
        <button className="fleet-back" onClick={() => nav('/')}>← greenboard</button>
        <div className="fleet-topright">
          <span>{fleet.length.toLocaleString()} machines · {poolCount} pools</span>
          <button className="fleet-refresh" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'refreshing…' : 'refresh'}
          </button>
        </div>
      </div>

      <div className={`fleet-main ${selected ? 'with-detail' : ''}`}>
        <Rail fleet={fleet} />

        <div className="fleet-center">
          <div className="fleet-title">
            <h2>Server pool</h2>
            <span className="meta">click a machine for detail · state is source of truth</span>
          </div>

          <div className="fleet-filterbar">
            <span className={`fleet-chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
              all · {fleet.length}
            </span>
            {BUCKETS.filter(b => counts[b.key]).map(b => (
              <span key={b.key} className={`fleet-chip ${filter === b.key ? 'on' : ''}`} onClick={() => setFilter(b.key)}>
                <span className="sw" style={{ background: b.color }} />{b.label} · {counts[b.key]}
              </span>
            ))}
            <input className="fleet-search" placeholder="search ip / vm name…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="fleet-scroller">
            {isLoading && <div className="fleet-detail-empty">loading fleet…</div>}
            {isError && <div className="fleet-detail-empty">could not load fleet (is QE-server-pool reachable?)</div>}
            {!isLoading && !pools.length && <div className="fleet-detail-empty">no machines match.</div>}
            {pools.map(p => (
              <PoolSection key={p.name} name={p.name} machines={p.machines}
                           selected={selected} onSelect={setSelected} />
            ))}
          </div>
        </div>

        {selected && <Detail ip={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}
