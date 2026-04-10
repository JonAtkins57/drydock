import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints, api } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface JournalEntry {
  id: string;
  journalNumber: string;
  type: string;
  postingDate: string;
  description: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface Account {
  id: string;
  accountNumber: string;
  name: string;
}

interface LineItem {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  pending_approval: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  approved: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  posted: 'bg-green-900/30 text-green-400 border-green-700/30',
  reversed: 'bg-red-900/30 text-red-400 border-red-700/30',
};

const STATUS_ACTIONS: Record<string, { label: string; action: string }> = {
  draft: { label: 'Submit', action: 'submit' },
  pending_approval: { label: 'Approve', action: 'approve' },
  approved: { label: 'Post', action: 'post' },
  posted: { label: 'Reverse', action: 'reverse' },
};

const fmtDollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyLine = (): LineItem => ({ accountId: '', debitAmount: 0, creditAmount: 0, description: '' });

export default function JournalEntries() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [periods, setPeriods] = useState<Period[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [description, setDescription] = useState('');
  const [postingDate, setPostingDate] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.journalEntries(1, 50);
      setEntries(res.data as JournalEntry[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const openCreate = async () => {
    setShowCreate(true);
    try {
      const [pRes, aRes] = await Promise.all([endpoints.periods(), endpoints.accounts()]);
      setPeriods(pRes as Period[]);
      setAccounts((aRes.data ?? aRes) as Account[]);
    } catch { /* */ }
  };

  const totalDebits = lines.reduce((s, l) => s + (l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.creditAmount || 0), 0);
  const balance = totalDebits - totalCredits;
  const isBalanced = totalDebits > 0 && balance === 0;

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createJournalEntry({
        description,
        postingDate,
        periodId: periodId || undefined,
        lines: lines
          .filter((l) => l.accountId && (l.debitAmount > 0 || l.creditAmount > 0))
          .map((l) => ({
            accountId: l.accountId,
            debitAmount: Math.round(l.debitAmount * 100),
            creditAmount: Math.round(l.creditAmount * 100),
            description: l.description,
          })),
      });
      setShowCreate(false);
      setDescription('');
      setPostingDate('');
      setPeriodId('');
      setLines([emptyLine(), emptyLine()]);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create journal entry');
    }
    setSubmitting(false);
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await endpoints.journalAction(id, action);
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
            <h1 className="text-2xl font-medium text-drydock-text">Journal Entries</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Journal Entry
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Journal Entry</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Journal description"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Posting Date</label>
                    <input
                      type="date"
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Period</label>
                    <select
                      value={periodId}
                      onChange={(e) => setPeriodId(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent"
                    >
                      <option value="">Select period...</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
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
                          <th className="text-left px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Account</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-32">Debit ($)</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-32">Credit ($)</th>
                          <th className="text-left px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={idx} className="border-b border-drydock-border/50">
                            <td className="px-3 py-1.5">
                              <select
                                value={line.accountId}
                                onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm
                                  text-drydock-text focus:outline-none focus:border-drydock-accent"
                              >
                                <option value="">Select account...</option>
                                {accounts.map((a) => (
                                  <option key={a.id} value={a.id}>{a.accountNumber} - {a.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.debitAmount || ''}
                                onChange={(e) => updateLine(idx, 'debitAmount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.creditAmount || ''}
                                onChange={(e) => updateLine(idx, 'creditAmount', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={line.description}
                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm
                                  text-drydock-text focus:outline-none focus:border-drydock-accent"
                                placeholder="Line description"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              {lines.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="text-red-400 hover:text-red-300 text-sm"
                                >
                                  x
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-drydock-border">
                          <td className="px-3 py-2 text-sm text-drydock-text font-medium text-right">Totals</td>
                          <td className="px-3 py-2 text-sm text-drydock-text font-mono text-right font-medium">
                            {fmtDollars(Math.round(totalDebits * 100))}
                          </td>
                          <td className="px-3 py-2 text-sm text-drydock-text font-mono text-right font-medium">
                            {fmtDollars(Math.round(totalCredits * 100))}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-sm font-mono font-medium ${balance === 0 ? 'text-green-400' : 'text-red-400'}`}>
                              Balance: {fmtDollars(Math.round(Math.abs(balance) * 100))}
                              {balance !== 0 && (balance > 0 ? ' DR' : ' CR')}
                            </span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
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
                    disabled={submitting || !isBalanced || !description.trim() || !postingDate}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Journal Entry'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Posting Date</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created By</th>
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
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No journal entries found</td></tr>
              ) : (
                entries.map((je) => {
                  const actionDef = STATUS_ACTIONS[je.status];
                  return (
                    <tr key={je.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{je.journalNumber}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{je.type}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{je.postingDate ? new Date(je.postingDate).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{je.description}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[je.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {je.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{je.createdBy}</td>
                      <td className="px-5 py-3">
                        {actionDef && (
                          <button
                            onClick={() => handleAction(je.id, actionDef.action)}
                            className="text-xs px-3 py-1 bg-drydock-accent/20 text-drydock-accent border border-drydock-accent/30
                              rounded hover:bg-drydock-accent/30 transition-colors"
                          >
                            {actionDef.label}
                          </button>
                        )}
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
