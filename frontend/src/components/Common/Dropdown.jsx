import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export default function Dropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  loading = false,
  size = 'md',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState(null);
  const triggerRef  = useRef(null);
  const menuRef     = useRef(null);
  const selectedRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));

  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey    = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, pos]);

  const sizeCls = size === 'sm'
    ? 'px-2.5 py-1 text-xs min-w-[88px]'
    : 'px-3 py-2 text-sm min-w-[120px]';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={loading}
        onClick={() => setOpen(o => !o)}
        className={`${sizeCls} w-full flex items-center justify-between gap-2 rounded-lg font-medium
                    bg-white border border-gray-300 text-gray-700 hover:border-gray-400
                    dark:bg-white/[0.045] dark:border-white/10 dark:text-gray-200 dark:hover:border-white/25
                    focus:outline-none focus:ring-2 focus:ring-brand-500/60 transition-colors
                    disabled:opacity-60`}
      >
        <span className="truncate">
          {loading ? 'Loading…' : (selected?.label ?? <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>)}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="dropdown-menu fixed z-[999] rounded-xl overflow-hidden
                     bg-white border border-gray-200
                     dark:bg-[#0d1424] dark:border-white/10"
          style={{
            top: pos.top,
            left: pos.left,
            minWidth: pos.width,
            boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
          }}
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No options</p>
            )}
            {options.map(o => {
              const isSel = String(o.value) === String(value);
              return (
                <button
                  key={o.value}
                  ref={isSel ? selectedRef : null}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition-colors
                    ${isSel
                      ? 'bg-brand-50 text-brand-700 font-semibold dark:bg-brand-500/10 dark:text-brand-300'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                    }`}
                >
                  <span className="truncate font-mono text-xs">{o.label}</span>
                  {isSel && <Check size={13} className="flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
