import React, { useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../store';

function prColor(pr) {
  if (pr === null || pr === undefined) return '#64748b';
  if (pr >= 85) return '#10b981';
  if (pr >= 65) return '#f59e0b';
  return '#ef4444';
}

function Node({ b, active, pr, onSelect, nodeRef }) {
  const buildNum = b.build.split('-')[1] || b.build;
  const version  = b.build.split('-')[0];
  const color    = prColor(pr);

  return (
    <button
      ref={nodeRef}
      onClick={onSelect}
      className="relative flex-shrink-0 flex flex-col items-center justify-center group"
      style={{ minWidth: 86, height: 78 }}
    >
      <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px]
                       bg-gray-200 dark:bg-white/10" />

      <span
        className={`h-5 flex items-end font-mono leading-none transition-all duration-150
          ${active
            ? 'text-[15px] font-black text-gray-900 dark:text-white'
            : 'text-[13px] font-bold text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
          }`}
      >
        {buildNum}
      </span>

      <span className="relative h-6 flex items-center justify-center my-0.5">
        {active && (
          <>
            <span
              className="absolute w-5 h-5 rounded-full animate-ping"
              style={{ backgroundColor: color + '50', animationDuration: '2s' }}
            />
            <span
              className="absolute w-7 h-7 rounded-full"
              style={{ backgroundColor: color + '18', boxShadow: `0 0 16px ${color}50` }}
            />
          </>
        )}
        <span
          className={`relative rounded-full transition-all duration-150 ${
            active
              ? 'ring-2 ring-white/30'
              : 'bg-slate-300 dark:bg-white/25 group-hover:bg-slate-400 dark:group-hover:bg-white/40'
          }`}
          style={active
            ? { width: 16, height: 16, backgroundColor: color, boxShadow: `0 0 10px ${color}90` }
            : { width: 9,  height: 9 }
          }
        />
      </span>

      <span className="h-5 flex items-start">
        {active && pr !== null && pr !== undefined ? (
          <span className="text-[10px] font-black leading-none tracking-wide" style={{ color }}>
            {pr}% PASS
          </span>
        ) : (
          <span className={`font-mono text-[9px] leading-none transition-colors
            ${active
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-300 group-hover:text-gray-400 dark:text-gray-600 dark:group-hover:text-gray-500'
            }`}
          >
            {version}
          </span>
        )}
      </span>
    </button>
  );
}

export default function BuildTimeline({ builds = [], loading, activeJobStats = null }) {
  const { build: activeBuild, setBuild } = useStore();
  const trackRef  = useRef(null);
  const activeRef = useRef(null);

  const scroll = (dir) => {
    trackRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeBuild, builds]);

  const activePR = activeJobStats && activeJobStats.build === activeBuild && activeJobStats.totalCount > 0
    ? Math.round(((activeJobStats.totalCount - activeJobStats.failCount) / activeJobStats.totalCount) * 100)
    : null;

  if (loading) {
    return (
      <div className="card px-6 py-5 flex items-center gap-10 overflow-hidden">
        <div className="flex-1 h-[2px] bg-gray-200 dark:bg-white/10 relative">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i}
              className="absolute w-2.5 h-2.5 -top-1 rounded-full bg-gray-300 dark:bg-white/20 animate-pulse"
              style={{ left: `${(i + 0.5) * 11}%`, animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-1 px-2">
        <button
          onClick={() => scroll(-1)}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
                     text-gray-400 hover:text-gray-700 hover:bg-gray-100
                     dark:text-gray-600 dark:hover:text-gray-300 dark:hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        <div ref={trackRef} className="flex-1 flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {builds.map(b => (
            <Node
              key={b.build}
              b={b}
              active={b.build === activeBuild}
              pr={b.build === activeBuild ? activePR : null}
              onSelect={() => setBuild(b.build)}
              nodeRef={b.build === activeBuild ? activeRef : null}
            />
          ))}
          {builds.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 px-2">No builds found.</p>
          )}
        </div>

        <button
          onClick={() => scroll(1)}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
                     text-gray-400 hover:text-gray-700 hover:bg-gray-100
                     dark:text-gray-600 dark:hover:text-gray-300 dark:hover:bg-white/10 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
