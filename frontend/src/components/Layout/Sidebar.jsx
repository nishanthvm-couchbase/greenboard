import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useStore } from '../../store';
import {
  LayoutDashboard, GitCompare, Bookmark, Share2, Download,
  Server, Cloud, Smartphone, Layers, Shield, Menu, X, Sun, Moon, Cpu, Coins, Rocket, Activity,
} from 'lucide-react';

// Plain http — link out instead of iframe (this https page can't embed it, mixed content).
const HEALTH_URL = 'http://172.23.222.138:8080';

const TARGETS = [
  { id: 'server',       label: 'Server',       icon: Server },
  { id: 'capella',      label: 'Capella',      icon: Cloud, href: 'https://greenboard.sc.couchbase.com:4001' },
];

export default function Sidebar({ onSaveView, onShareView, onImportView }) {
  const { target: pTarget } = useParams();
  const nav = useNavigate();
  const isHome = useLocation().pathname === '/';
  const { target, darkMode, toggleDark } = useStore();
  const activeTarget = pTarget || target;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col h-full transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}
      style={{
        background: '#0a0f1c',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 0 16px rgba(99,102,241,0.45)',
              }}
            >
              G
            </div>
            <span className="font-semibold text-sm tracking-wide text-gray-100">Greenboard</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
        >
          {collapsed ? <Menu size={16} /> : <X size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <button
          onClick={() => nav('/')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} ${
            isHome ? 'nav-item-active' : 'nav-item-idle'
          }`}
          title="Dashboard"
        >
          <LayoutDashboard size={16} />
          {!collapsed && <span>Dashboard</span>}
        </button>

        <button
          onClick={() => window.open('/compare', '_blank')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Compare Builds"
        >
          <GitCompare size={16} />
          {!collapsed && <span>Compare Builds</span>}
        </button>

        <button
          onClick={() => nav('/fleet')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Fleet"
        >
          <Cpu size={16} />
          {!collapsed && <span>Fleet</span>}
        </button>

        <button
          onClick={() => window.open(HEALTH_URL, '_blank', 'noopener')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Health Status — QE Monitoring dashboard"
        >
          <Activity size={16} />
          {!collapsed && <span>Health Status</span>}
        </button>

        <button
          onClick={() => nav('/tokens')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Token Usage"
        >
          <Coins size={16} />
          {!collapsed && <span>Token Usage</span>}
        </button>

        <button
          onClick={() => nav('/release-notes')}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Release Notes"
        >
          <Rocket size={16} />
          {!collapsed && <span>Release Notes</span>}
        </button>

        <div className="border-t border-white/[0.06] my-2" />

        {!collapsed && (
          <p className="px-3 py-1 text-[10px] font-bold text-gray-600 uppercase tracking-[0.18em]">Targets</p>
        )}
        {TARGETS.map(({ id, label, icon: Icon, href, disabled }) => {
          const onClick = disabled ? undefined
            : href ? () => window.open(href, '_blank')
            : () => nav(`/${id}/8.1.0`);
          return (
            <button
              key={id}
              onClick={onClick}
              disabled={disabled}
              className={`nav-item w-full ${collapsed ? 'justify-center' : ''} ${
                disabled ? 'opacity-40 cursor-not-allowed' :
                activeTarget === id && !isHome ? 'nav-item-active' : 'nav-item-idle'
              }`}
              title={disabled ? `${label} — not available yet` : label}
            >
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-2 space-y-0.5">
        {onSaveView && (
          <button onClick={onSaveView} className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`} title="Save View">
            <Bookmark size={16} />
            {!collapsed && <span>Save View</span>}
          </button>
        )}
        {onShareView && (
          <button onClick={onShareView} className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`} title="Share View">
            <Share2 size={16} />
            {!collapsed && <span>Share View</span>}
          </button>
        )}
        {onImportView && (
          <button onClick={onImportView} className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`} title="Import View">
            <Download size={16} />
            {!collapsed && <span>Import View</span>}
          </button>
        )}

        <button
          onClick={toggleDark}
          className={`nav-item w-full ${collapsed ? 'justify-center' : ''} nav-item-idle`}
          title="Toggle theme"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
      </div>
    </aside>
  );
}
