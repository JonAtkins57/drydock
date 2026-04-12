import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Budget {
  id: string;
  fiscalYear: number;
  name: string;
  scenario: 'base' | 'optimistic' | 'pessimistic';
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'voided';
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

const SCENARIO_COLORS: Record<string, string> = {
  base: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  optimistic: 'bg-green-900/30 text-green-400 border-green-700/30',
  pessimistic: 'bg-red-900/30 text-red-400 border-red-700/30',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700/30',
  pending_approval: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  approved: 'bg-green-900/30 text-green-400 border-green-700/30',
  rejected: 'bg-red-900/30 text-red-400 border-red-700/30',
  voided: 'bg-gray-900/30 text-gray-600 border-gray-800/30',
};

export default function Budgets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Budget[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [scenario, setScenario] = useState<'base' | 'optimistic' | 'pessimistic'>('base');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.budgets(1, 50);
      setItems((res as { data: Budget[]; meta: { total: number } }).data);
      setTotal((res as { data: Budget[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createBudget({
        name: name.trim(),
        fiscalYear,
        scenario,
        notes: notes.trim() || undefined,
      });
      setShowCreate(false);
      setName('');
      setFiscalYear(new Date().getFullYear());
      setScenario('base');
      setNotes('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create budget');
    }
    setSubmitting(false);
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'void') => {
    setActionLoading(`${id}-${action}`);
    try {
      if (action === 'submit') await endpoints.submitBudget(id);
      else if (action === 'approve') await endpoints.approveBudget(id);
      else if (action === 'reject') await endpoints.rejectBudget(id);
      else await endpoints.voidBudget(id);
      await load();
    } catch { /* silently ignore — user sees stale state */ }
    setActionLoading(null);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Budgets</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Budget
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Budget</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Budget Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="e.g. FY2026 Operating Budget"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Fiscal Year</label>
                  <input
                    type="number"
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(parseInt(e.target.value, 10))}
                    required
                    min={2000}
                    max={2100}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Scenario</label>
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as 'base' | 'optimistic' | 'pessimistic')}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="base">Base</option>
                    <option value="optimistic">Optimistic</option>
                    <option value="pessimistic">Pessimistic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel resize-none
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Optional notes"
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
                    disabled={submitting || !name.trim()}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Budget'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Fiscal Year</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Scenario</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Notes</th>
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
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No budgets found</td></tr>
              ) : (
                items.map((budget) => {
                  const busy = (action: string) => actionLoading === `${budget.id}-${action}`;
                  return (
                    <tr key={budget.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-drydock-text font-medium">{budget.name}</td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{budget.fiscalYear}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${SCENARIO_COLORS[budget.scenario] ?? 'bg-gray-800 text-gray-400'}`}>
                          {budget.scenario}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[budget.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {budget.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel max-w-xs truncate">{budget.notes ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">
                        {new Date(budget.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          {budget.status === 'draft' && (
                            <button
                              onClick={() => handleAction(budget.id, 'submit')}
                              disabled={!!actionLoading}
                              className="text-xs px-2 py-1 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-700/30
                                hover:bg-yellow-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy('submit') ? '…' : 'Submit'}
                            </button>
                          )}
                          {budget.status === 'pending_approval' && (
                            <>
                              <button
                                onClick={() => handleAction(budget.id, 'approve')}
                                disabled={!!actionLoading}
                                className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 border border-green-700/30
                                  hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {busy('approve') ? '…' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleAction(budget.id, 'reject')}
                                disabled={!!actionLoading}
                                className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 border border-red-700/30
                                  hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {busy('reject') ? '…' : 'Reject'}
                              </button>
                            </>
                          )}
                          {(budget.status === 'draft' || budget.status === 'rejected') && (
                            <button
                              onClick={() => handleAction(budget.id, 'void')}
                              disabled={!!actionLoading}
                              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-500 border border-gray-700/30
                                hover:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy('void') ? '…' : 'Void'}
                            </button>
                          )}
                        </div>
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
