import React from 'react';

const MAP = {
  SUCCESS:   { cls: 'badge-success',   dot: '#34d399', label: 'Pass'      },
  FAILURE:   { cls: 'badge-failure',   dot: '#f87171', label: 'Fail'      },
  UNSTABLE:  { cls: 'badge-unstable',  dot: '#fbbf24', label: 'Unstable'  },
  ABORTED:   { cls: 'badge-aborted',   dot: '#94a3b8', label: 'Aborted'   },
  PENDING:   { cls: 'badge-pending',   dot: '#38bdf8', label: 'Pending'   },
  INST_FAIL: { cls: 'badge-inst-fail', dot: '#fb923c', label: 'Inst Fail' },
};

export default function StatusBadge({ result }) {
  const m = MAP[result] || { cls: 'badge-aborted', dot: '#94a3b8', label: result || '—' };
  return (
    <span className={m.cls}>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: m.dot, boxShadow: `0 0 6px ${m.dot}` }}
      />
      {m.label}
    </span>
  );
}

export const STATUS_COLOR = {
  SUCCESS:   'text-emerald-400',
  FAILURE:   'text-red-400',
  UNSTABLE:  'text-amber-400',
  ABORTED:   'text-gray-400',
  PENDING:   'text-sky-400',
  INST_FAIL: 'text-orange-400',
};

export const STATUS_ROW_BG = {
  SUCCESS:   '',
  FAILURE:   'bg-red-500/[0.05]',
  UNSTABLE:  'bg-amber-500/[0.04]',
  ABORTED:   '',
  PENDING:   'bg-sky-500/[0.03]',
  INST_FAIL: 'bg-orange-500/[0.05]',
};
