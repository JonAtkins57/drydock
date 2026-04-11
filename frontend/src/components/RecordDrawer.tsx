import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Generic slide-over detail/edit panel for any entity.
// Fields config drives what's shown and editable.

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'readonly';
  options?: { value: string; label: string }[];
  readOnly?: boolean;
}

interface RecordDrawerProps {
  open: boolean;
  onClose: () => void;
  entityPath: string;        // e.g. '/vendors', '/customers'
  recordId: string | null;
  fields: FieldDef[];
  title: string;
  onSaved?: () => void;
}

export default function RecordDrawer({
  open, onClose, entityPath, recordId, fields, title, onSaved,
}: RecordDrawerProps) {
  const [record, setRecord] = useState<Record<string, unknown>>({});
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && recordId) {
      setLoading(true);
      setError(null);
      setEdits({});
      setSaved(false);
      api<Record<string, unknown>>(`${entityPath}/${recordId}`)
        .then((r) => { setRecord(r); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [open, recordId, entityPath]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const getValue = (key: string) =>
    key in edits ? edits[key] : (record[key] ?? '');

  const handleChange = (key: string, value: unknown) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!recordId || Object.keys(edits).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api(`${entityPath}/${recordId}`, { method: 'PATCH', body: edits });
      setRecord((prev) => ({ ...prev, ...edits }));
      setEdits({});
      setSaved(true);
      onSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = Object.keys(edits).length > 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-drydock-card border-l border-drydock-border z-50 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-drydock-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-drydock-text">{title}</h2>
            {record && (record.name as string) && (
              <p className="text-sm text-drydock-text-dim mt-0.5">{record.name as string}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-drydock-steel hover:text-drydock-text transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-drydock-border/30 rounded animate-pulse w-20 mb-1.5" />
                  <div className="h-8 bg-drydock-border/30 rounded animate-pulse w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((f) => {
                const val = getValue(f.key) as string;
                const isReadonly = f.readOnly || f.type === 'readonly';
                return (
                  <div key={f.key}>
                    <label className="block text-xs text-drydock-steel uppercase tracking-wider mb-1.5">
                      {f.label}
                    </label>
                    {isReadonly ? (
                      <div className="text-sm text-drydock-text-dim bg-drydock-bg/50 border border-drydock-border/50 rounded px-3 py-2">
                        {val || <span className="text-drydock-steel italic">—</span>}
                      </div>
                    ) : f.type === 'select' ? (
                      <select
                        value={val}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2
                          text-sm text-drydock-text focus:outline-none focus:border-drydock-accent"
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea
                        value={val}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        rows={3}
                        className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2
                          text-sm text-drydock-text focus:outline-none focus:border-drydock-accent resize-none"
                      />
                    ) : (
                      <input
                        type={f.type ?? 'text'}
                        value={val}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2
                          text-sm text-drydock-text focus:outline-none focus:border-drydock-accent"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-drydock-border flex-shrink-0">
          <div className="text-sm">
            {error && <span className="text-red-400">{error}</span>}
            {saved && !isDirty && <span className="text-green-400">Saved</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-drydock-steel hover:text-drydock-text transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
