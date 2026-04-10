import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Requisition {
  id: string;
  requisitionNumber: string;
  requestedBy: string;
  department: string;
  status: string;
  totalAmount: number;
  neededBy: string;
  notes: string;
  createdAt: string;
}

interface ReqLineItem {
  description: string;
  quantity: number;
  estimatedUnitPrice: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  pending_approval: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  approved: 'bg-green-900/30 text-green-400 border-green-700/30',
  rejected: 'bg-red-900/30 text-red-400 border-red-700/30',
  cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
};

const STATUS_ACTIONS: Record<string, { label: string; action: string }[]> = {
  draft: [{ label: 'Submit', action: 'submit' }],
  pending_approval: [{ label: 'Approve', action: 'approve' }],
  approved: [{ label: 'Convert to PO', action: 'convert-to-po' }],
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyLine = (): ReqLineItem => ({ description: '', quantity: 1, estimatedUnitPrice: 0 });

export default function Requisitions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Requisition[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [notes, setNotes] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [lines, setLines] = useState<ReqLineItem[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.requisitions(1, 50);
      setItems(res.data as Requisition[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const updateLine = (idx: number, field: keyof ReqLineItem, value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createRequisition({
        notes,
        neededBy: neededBy || undefined,
        lineItems: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            quantity: l.quantity,
            estimatedUnitPrice: Math.round(l.estimatedUnitPrice * 100),
          })),
      });
      setShowCreate(false);
      setNotes('');
      setNeededBy('');
      setLines([emptyLine()]);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create requisition');
    }
    setSubmitting(false);
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await endpoints.requisitionAction(id, action);
      load();
    } catch { /* */ }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Requisitions</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Requisition
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Requisition</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Requisition notes"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Needed By</label>
                    <input
                      type="date"
                      value={neededBy}
                      onChange={(e) => setNeededBy(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-drydock-text-dim font-medium">Line Items</label>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => [...prev, emptyLine()])}
                      className="text-xs text-drydock-accent hover:text-drydock-accent-dim transition-colors"
                    >
                      + Add Line
                    </button>
                  </div>
                  <div className="bg-drydock-bg border border-drydock-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-drydock-border">
                          <th className="text-left px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-24">Qty</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-36">Est. Unit Price ($)</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={idx} className="border-b border-drydock-border/50">
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={line.description}
                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm
                                  text-drydock-text focus:outline-none focus:border-drydock-accent"
                                placeholder="Item description"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.estimatedUnitPrice || ''}
                                onChange={(e) => updateLine(idx, 'estimatedUnitPrice', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              {lines.length > 1 && (
                                <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-300 text-sm">x</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || lines.every((l) => !l.description.trim())}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Requisition'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Req #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Requested By</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Department</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Needed By</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-drydock-steel">No requisitions found</td></tr>
              ) : (
                items.map((r) => {
                  const actions = STATUS_ACTIONS[r.status] ?? [];
                  return (
                    <tr key={r.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.requisitionNumber}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{r.requestedBy}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.department}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {r.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(r.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.neededBy ? new Date(r.neededBy).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 flex gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.action}
                            onClick={() => handleAction(r.id, a.action)}
                            className="text-xs px-3 py-1 bg-drydock-accent/20 text-drydock-accent border border-drydock-accent/30
                              rounded hover:bg-drydock-accent/30 transition-colors"
                          >
                            {a.label}
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
