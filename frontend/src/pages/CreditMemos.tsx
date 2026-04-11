import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface CreditMemo {
  id: string;
  memoNumber: string;
  customerId: string;
  invoiceId: string | null;
  reason: string;
  totalAmount: number;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  pending_approval: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  approved: 'bg-green-900/30 text-green-400 border-green-700/30',
  rejected: 'bg-red-900/30 text-red-400 border-red-700/30',
  voided: 'bg-gray-800 text-gray-400 border-gray-700',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditMemos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CreditMemo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showApprove, setShowApprove] = useState<CreditMemo | null>(null);

  // Create form
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Approve form
  const [periodId, setPeriodId] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [approveError, setApproveError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.creditMemos(1, 50);
      setItems((res as { data: CreditMemo[]; meta: { total: number } }).data);
      setTotal((res as { data: CreditMemo[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createCreditMemo({
        customerId: customerId.trim(),
        invoiceId: invoiceId.trim() || undefined,
        reason: reason.trim(),
        totalAmount: Math.round(parseFloat(amount) * 100),
        lines: [],
      });
      setShowCreate(false);
      setCustomerId('');
      setInvoiceId('');
      setReason('');
      setAmount('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create credit memo');
    }
    setSubmitting(false);
  };

  const handleAction = async (memo: CreditMemo, action: string) => {
    if (action === 'approve') {
      setShowApprove(memo);
      setPeriodId('');
      setDebitAccountId('');
      setCreditAccountId('');
      setApproveError('');
      return;
    }
    try {
      await endpoints.creditMemoAction(memo.id, action);
      load();
    } catch { /* */ }
  };

  const handleApprove = async () => {
    if (!showApprove) return;
    setApproveError('');
    try {
      await endpoints.creditMemoAction(showApprove.id, 'approve', {
        periodId: periodId.trim(),
        debitAccountId: debitAccountId.trim(),
        creditAccountId: creditAccountId.trim(),
      });
      setShowApprove(null);
      load();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const getActions = (memo: CreditMemo) => {
    if (memo.status === 'draft') return [{ label: 'Submit', action: 'submit' }];
    if (memo.status === 'pending_approval') return [{ label: 'Approve', action: 'approve' }, { label: 'Reject', action: 'reject' }];
    return [];
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Credit Memos</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Credit Memo
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Credit Memo</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Customer ID</label>
                  <input
                    type="text"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="UUID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Invoice ID (optional)</label>
                  <input
                    type="text"
                    value={invoiceId}
                    onChange={(e) => setInvoiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="UUID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Reason</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    rows={3}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel resize-none
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Reason for credit memo"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text font-mono
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="0.00"
                  />
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
                    disabled={submitting || !customerId.trim() || !reason.trim() || !amount}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Credit Memo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Approve Modal */}
        {showApprove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowApprove(null)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-1">Approve Credit Memo</h2>
              <p className="text-sm text-drydock-steel mb-4 font-mono">{showApprove.memoNumber}</p>

              {approveError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{approveError}</div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Period ID</label>
                  <input
                    type="text"
                    value={periodId}
                    onChange={(e) => setPeriodId(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="UUID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Debit Account ID</label>
                  <input
                    type="text"
                    value={debitAccountId}
                    onChange={(e) => setDebitAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="UUID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Credit Account ID</label>
                  <input
                    type="text"
                    value={creditAccountId}
                    onChange={(e) => setCreditAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="UUID"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowApprove(null)}
                  className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                    hover:text-drydock-text hover:border-drydock-steel transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={!periodId.trim() || !debitAccountId.trim() || !creditAccountId.trim()}
                  className="flex-1 py-2 px-4 text-sm bg-green-600 hover:bg-green-500
                    text-white font-medium rounded-md
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Approve & Post GL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Memo #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Reason</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Amount</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Approved At</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No credit memos found</td></tr>
              ) : (
                items.map((memo) => {
                  const actions = getActions(memo);
                  return (
                    <tr key={memo.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{memo.memoNumber}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[memo.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {memo.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-text max-w-xs truncate">{memo.reason}</td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(memo.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">
                        {memo.approvedAt ? new Date(memo.approvedAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(memo.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 flex gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.action}
                            onClick={() => handleAction(memo, a.action)}
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
