import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface RecurringTemplate {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  nextRunDate: string;
  endDate: string | null;
  status: string;
  createdAt: string;
}

interface TemplateLine {
  lineNumber: number;
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

interface Account {
  id: string;
  accountNumber: string;
  name: string;
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/30 text-green-400 border-green-700/30',
  paused: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  completed: 'bg-gray-800 text-gray-400 border-gray-700',
};

const emptyLine = (): TemplateLine => ({
  lineNumber: 1,
  accountId: '',
  debitAmount: 0,
  creditAmount: 0,
  description: '',
});

export default function RecurringJournals() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextRunDate, setNextRunDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lines, setLines] = useState<TemplateLine[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  async function load() {
    setLoading(true);
    try {
      const [tmpl, accts] = await Promise.all([
        api<{ data: RecurringTemplate[] }>('/recurring-journals'),
        api<{ data: Account[] }>('/accounts'),
      ]);
      setTemplates(tmpl.data ?? []);
      setAccounts(accts.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function updateLine(idx: number, field: keyof TemplateLine, value: string | number) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? { ...l, [field]: field === 'debitAmount' || field === 'creditAmount' ? Number(value) : value }
          : l,
      ),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(), lineNumber: prev.length + 1 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((l, i) => ({ ...l, lineNumber: i + 1 })),
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      setFormError(`Lines are unbalanced: debits $${totalDebit / 100} ≠ credits $${totalCredit / 100}`);
      return;
    }
    setSubmitting(true);
    try {
      await api('/recurring-journals', {
        method: 'POST',
        body: {
          name,
          description: description || undefined,
          frequency,
          nextRunDate: new Date(nextRunDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          lines: lines.map((l) => ({
            lineNumber: l.lineNumber,
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            description: l.description || undefined,
          })),
        },
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      setFrequency('monthly');
      setNextRunDate('');
      setEndDate('');
      setLines([emptyLine(), emptyLine()]);
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePause(id: string, currentStatus: string) {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    try {
      await api(`/recurring-journals/${id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      await load();
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring journal template? This cannot be undone.')) return;
    try {
      await api(`/recurring-journals/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      // ignore
    }
  }

  const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  return (
    <div className="flex h-screen bg-drydock-bg overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-drydock-text">Recurring Journals</h1>
              <p className="text-sm text-drydock-steel mt-0.5">
                Scheduled journal entry templates generated automatically by the system.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-drydock-accent text-white text-sm rounded hover:bg-drydock-accent/80 transition-colors"
            >
              + New Template
            </button>
          </div>

          {/* Create form */}
          {showCreate && (
            <div className="bg-drydock-card border border-drydock-border rounded-lg p-6 mb-6">
              <h2 className="text-base font-medium text-drydock-text mb-4">New Recurring Journal Template</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-drydock-steel mb-1">Name *</label>
                    <input
                      className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2 text-sm text-drydock-text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-drydock-steel mb-1">Frequency *</label>
                    <select
                      className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2 text-sm text-drydock-text"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    >
                      {Object.entries(FREQ_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-drydock-steel mb-1">First Run Date *</label>
                    <input
                      type="date"
                      className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2 text-sm text-drydock-text"
                      value={nextRunDate}
                      onChange={(e) => setNextRunDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-drydock-steel mb-1">End Date (optional)</label>
                    <input
                      type="date"
                      className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2 text-sm text-drydock-text"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-drydock-steel mb-1">Description</label>
                    <input
                      className="w-full bg-drydock-bg border border-drydock-border rounded px-3 py-2 text-sm text-drydock-text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>

                {/* Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-drydock-text">Journal Lines</h3>
                    <button
                      type="button"
                      onClick={addLine}
                      className="text-xs text-drydock-accent hover:text-drydock-accent/80"
                    >
                      + Add Line
                    </button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <select
                            className="w-full bg-drydock-bg border border-drydock-border rounded px-2 py-1.5 text-xs text-drydock-text"
                            value={line.accountId}
                            onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                            required
                          >
                            <option value="">— Account —</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.accountNumber} {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            placeholder="Debit (¢)"
                            className="w-full bg-drydock-bg border border-drydock-border rounded px-2 py-1.5 text-xs text-drydock-text"
                            value={line.debitAmount || ''}
                            onChange={(e) => updateLine(idx, 'debitAmount', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={0}
                            placeholder="Credit (¢)"
                            className="w-full bg-drydock-bg border border-drydock-border rounded px-2 py-1.5 text-xs text-drydock-text"
                            value={line.creditAmount || ''}
                            onChange={(e) => updateLine(idx, 'creditAmount', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            placeholder="Description"
                            className="w-full bg-drydock-bg border border-drydock-border rounded px-2 py-1.5 text-xs text-drydock-text"
                            value={line.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {lines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-drydock-steel hover:text-red-400 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-8 mt-2 text-xs">
                    <span className={totalDebit > 0 ? 'text-drydock-text' : 'text-drydock-steel'}>
                      Debits: ${(totalDebit / 100).toFixed(2)}
                    </span>
                    <span className={balanced ? 'text-green-400' : totalCredit > 0 ? 'text-red-400' : 'text-drydock-steel'}>
                      Credits: ${(totalCredit / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                {formError && (
                  <p className="text-red-400 text-sm">{formError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !balanced}
                    className="px-4 py-2 bg-drydock-accent text-white text-sm rounded hover:bg-drydock-accent/80 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Template'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 border border-drydock-border text-drydock-text text-sm rounded hover:bg-drydock-card transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-drydock-steel text-sm">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="bg-drydock-card border border-drydock-border rounded-lg p-12 text-center">
              <p className="text-drydock-steel text-sm">No recurring journal templates yet.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-drydock-accent text-sm hover:underline"
              >
                Create your first template
              </button>
            </div>
          ) : (
            <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-drydock-border">
                    <th className="text-left px-4 py-3 text-xs text-drydock-steel font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-xs text-drydock-steel font-medium">Frequency</th>
                    <th className="text-left px-4 py-3 text-xs text-drydock-steel font-medium">Next Run</th>
                    <th className="text-left px-4 py-3 text-xs text-drydock-steel font-medium">End Date</th>
                    <th className="text-left px-4 py-3 text-xs text-drydock-steel font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-xs text-drydock-steel font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-b border-drydock-border last:border-0 hover:bg-drydock-bg/30">
                      <td className="px-4 py-3">
                        <p className="text-drydock-text font-medium">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-drydock-steel mt-0.5">{t.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-drydock-text">
                        {FREQ_LABELS[t.frequency] ?? t.frequency}
                      </td>
                      <td className="px-4 py-3 text-drydock-text">
                        {new Date(t.nextRunDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-drydock-steel">
                        {t.endDate ? new Date(t.endDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${STATUS_COLORS[t.status] ?? 'text-drydock-steel'}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {t.status !== 'completed' && (
                            <button
                              onClick={() => handlePause(t.id, t.status)}
                              className="text-xs text-drydock-steel hover:text-drydock-text transition-colors"
                            >
                              {t.status === 'paused' ? 'Resume' : 'Pause'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="text-xs text-drydock-steel hover:text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
