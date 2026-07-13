import React, { useState } from 'react';
import { X, Bookmark, Share2, Download, Copy, Check, Trash2 } from 'lucide-react';
import { useStore } from '../../store';

function SaveView({ onClose }) {
  const [name, setName] = useState('');
  const { saveView }    = useStore();

  const save = () => {
    if (!name.trim()) return;
    saveView(name.trim());
    onClose();
  };

  return (
    <div>
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Save Current View</h2>
      <input
        autoFocus className="input mb-4" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        placeholder="My view name…"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={save} disabled={!name.trim()} className="btn btn-primary disabled:opacity-50">
          <Bookmark size={14} /> Save
        </button>
      </div>
    </div>
  );
}

function ShareView({ onClose }) {
  const { savedViews, encodeView } = useStore();
  const [selected, setSelected]    = useState('');
  const [copied, setCopied]        = useState('');

  const code = selected
    ? (savedViews.find(v => v.id === selected)
        ? btoa(JSON.stringify({ n: savedViews.find(v=>v.id===selected)?.name, ...savedViews.find(v=>v.id===selected) }))
        : '')
    : encodeView();
  const url = code ? `${window.location.origin}${window.location.pathname}?view=${code}` : '';

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div>
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Share View</h2>
      <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Select saved view (or share current)</label>
      <select value={selected} onChange={e => setSelected(e.target.value)} className="input mb-4">
        <option value="">Current filters</option>
        {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>

      {code && (
        <>
          <div className="mb-3">
            <label className="text-xs text-gray-500 block mb-1">Share Code</label>
            <div className="flex gap-2">
              <input readOnly value={code} className="input font-mono text-xs flex-1" />
              <button onClick={() => copy(code, 'code')} className="btn btn-ghost">
                {copied === 'code' ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-1">Share URL</label>
            <div className="flex gap-2">
              <input readOnly value={url} className="input text-xs flex-1" />
              <button onClick={() => copy(url, 'url')} className="btn btn-ghost">
                {copied === 'url' ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </>
      )}
      <div className="flex justify-end">
        <button onClick={onClose} className="btn btn-ghost">Close</button>
      </div>
    </div>
  );
}

function ImportView({ onClose }) {
  const [input, setInput]   = useState('');
  const [error, setError]   = useState('');
  const { decodeAndApplyView, saveView } = useStore();

  const importIt = () => {
    let code = input.trim();
    try {
      const url = new URL(code);
      code = url.searchParams.get('view') || code;
    } catch (_) {}

    if (decodeAndApplyView(code)) {
      onClose();
    } else {
      setError('Invalid code or URL. Please check and try again.');
    }
  };

  return (
    <div>
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Import View</h2>
      <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Paste share code or full URL</label>
      <input
        autoFocus className={`input mb-1 ${error ? 'border-red-400' : ''}`}
        value={input} onChange={e => { setInput(e.target.value); setError(''); }}
        onKeyDown={e => e.key === 'Enter' && importIt()}
        placeholder="Share code or URL…"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={importIt} disabled={!input.trim()} className="btn btn-primary disabled:opacity-50">
          <Download size={14} /> Import
        </button>
      </div>
    </div>
  );
}

export default function ViewsModal({ mode, onClose }) {
  if (!mode) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-md p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10">
          <X size={16} />
        </button>
        {mode === 'save'   && <SaveView   onClose={onClose} />}
        {mode === 'share'  && <ShareView  onClose={onClose} />}
        {mode === 'import' && <ImportView onClose={onClose} />}
      </div>
    </div>
  );
}
