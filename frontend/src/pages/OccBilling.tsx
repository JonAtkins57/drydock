import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface RateCard {
  id: string;
  name: string;
  meterType: string;
  unitPriceCents: number;
  currency: string;
  description: string | null;
  isActive: boolean;
}

interface PullRun {
  id: string;
  integrationConfigId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmountCents: number | null;
  invoiceId: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-900/30 text-green-400 border-green-700/30',
  running: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  pending: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  failed: 'bg-red-900/30 text-red-400 border-red-700/30',
};

function formatCents(cents: number | null): string {
  if (cents === null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OccBilling() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [runs, setRuns] = useState<PullRun[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // Pull form
  const [showPull, setShowPull] = useState(false);
  const [configId, setConfigId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [lastResult, setLastResult] = useState<{ runId: string; invoiceId: string | null } | null>(null);

  // Rate card CRUD form
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<RateCard | null>(null);
  const [cardName, setCardName] = useState('');
  const [cardMeterType, setCardMeterType] = useState('');
  const [cardUnitPriceCents, setCardUnitPriceCents] = useState('');
  const [cardCurrency, setCardCurrency] = useState('USD');
  const [cardDescription, setCardDescription] = useState('');
  const [cardFormError, setCardFormError] = useState('');
  const [cardSubmitting, setCardSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadRateCards();
  }, [user, navigate]);

  const loadRateCards = async () => {
    setLoadingCards(true);
    try {
      const res = await endpoints.occRateCards();
      setRateCards((res as { data: RateCard[] }).data ?? []);
    } catch { /* */ }
    setLoadingCards(false);
  };

  const loadRuns = async (cid: string) => {
    if (!cid) return;
    setLoadingRuns(true);
    try {
      const res = await endpoints.occRuns(cid, 50);
      setRuns((res as { data: PullRun[] }).data ?? []);
    } catch { /* */ }
    setLoadingRuns(false);
  };

  const handlePull = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setLastResult(null);
    try {
      const res = await endpoints.occPullAndInvoice(configId.trim(), periodStart, periodEnd);
      setLastResult(res);
      setShowPull(false);
      setConfigId('');
      setPeriodStart('');
      setPeriodEnd('');
      loadRuns(res.runId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Pull failed');
    }
    setSubmitting(false);
  };

  const openCreateCard = () => {
    setEditingCard(null);
    setCardName('');
    setCardMeterType('');
    setCardUnitPriceCents('');
    setCardCurrency('USD');
    setCardDescription('');
    setCardFormError('');
    setShowCardForm(true);
  };

  const openEditCard = (card: RateCard) => {
    setEditingCard(card);
    setCardName(card.name);
    setCardMeterType(card.meterType);
    setCardUnitPriceCents(String(card.unitPriceCents));
    setCardCurrency(card.currency);
    setCardDescription(card.description ?? '');
    setCardFormError('');
    setShowCardForm(true);
  };

  const handleCardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const priceCents = parseInt(cardUnitPriceCents, 10);
    if (isNaN(priceCents) || priceCents <= 0) {
      setCardFormError('Unit price must be a positive integer (cents)');
      return;
    }
    setCardSubmitting(true);
    setCardFormError('');
    try {
      if (editingCard) {
        await endpoints.occUpdateRateCard(editingCard.id, {
          name: cardName.trim(),
          unitPriceCents: priceCents,
          currency: cardCurrency.trim() || 'USD',
          description: cardDescription.trim() || undefined,
        });
      } else {
        await endpoints.occCreateRateCard({
          name: cardName.trim(),
          meterType: cardMeterType.trim(),
          unitPriceCents: priceCents,
          currency: cardCurrency.trim() || 'USD',
          description: cardDescription.trim() || undefined,
        });
      }
      setShowCardForm(false);
      loadRateCards();
    } catch (err) {
      setCardFormError(err instanceof Error ? err.message : 'Save failed');
    }
    setCardSubmitting(false);
  };

  const handleDeleteCard = async (card: RateCard) => {
    if (!window.confirm(`Delete rate card "${card.name}"? This will deactivate it.`)) return;
    try {
      await endpoints.occDeleteRateCard(card.id);
      loadRateCards();
    } catch { /* */ }
  };

  // Reconciliation stats — computed from already-fetched runs (no extra API calls)
  const totalRuns = runs.length;
  const runsByStatus = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalBilledCents = runs.reduce((sum, r) => sum + (r.totalAmountCents ?? 0), 0);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">OCC Usage-Based Billing</h1>
            <p className="text-drydock-text-dim text-sm mt-1">
              Pull meter data from Oracle Commerce Cloud, rate against local rate cards, and generate invoices.
            </p>
          </div>
          <button
            onClick={() => setShowPull(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + Pull &amp; Invoice
          </button>
        </div>

        {/* Last result banner */}
        {lastResult && (
          <div className="p-4 rounded-lg border border-green-700/40 bg-green-900/20 text-green-300 text-sm space-y-1">
            <p className="font-medium">Pull complete</p>
            <p>Run ID: <span className="font-mono text-xs">{lastResult.runId}</span></p>
            {lastResult.invoiceId ? (
              <p>Invoice created: <span className="font-mono text-xs">{lastResult.invoiceId}</span></p>
            ) : (
              <p className="text-drydock-steel">No invoice created (zero usage or no customer configured).</p>
            )}
          </div>
        )}

        {/* Pull & Invoice modal */}
        {showPull && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowPull(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">Pull OCC Usage &amp; Generate Invoice</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                  {formError}
                </div>
              )}

              <form onSubmit={handlePull} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Integration Config ID</label>
                  <input
                    type="text"
                    value={configId}
                    onChange={(e) => setConfigId(e.target.value)}
                    required
                    autoFocus
                    placeholder="UUID of your OCC integration config"
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel font-mono text-sm
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>

                <div className="pt-1 text-xs text-drydock-steel">
                  After pulling, load runs by entering the Config ID above and clicking "Load Runs".
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPull(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !configId.trim() || !periodStart || !periodEnd}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Pulling...' : 'Pull & Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rate Card create/edit modal */}
        {showCardForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCardForm(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">
                {editingCard ? 'Edit Rate Card' : 'Create Rate Card'}
              </h2>

              {cardFormError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                  {cardFormError}
                </div>
              )}

              <form onSubmit={handleCardSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g. API Calls — Standard"
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel text-sm
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                {!editingCard && (
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Meter Type</label>
                    <input
                      type="text"
                      value={cardMeterType}
                      onChange={(e) => setCardMeterType(e.target.value)}
                      required
                      placeholder="e.g. api_calls"
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel font-mono text-sm
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Unit Price (cents)</label>
                  <input
                    type="number"
                    value={cardUnitPriceCents}
                    onChange={(e) => setCardUnitPriceCents(e.target.value)}
                    required
                    min="1"
                    step="1"
                    placeholder="e.g. 100 = $1.00"
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel font-mono text-sm
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Currency</label>
                  <input
                    type="text"
                    value={cardCurrency}
                    onChange={(e) => setCardCurrency(e.target.value)}
                    placeholder="USD"
                    maxLength={3}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel font-mono text-sm uppercase
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
                  <input
                    type="text"
                    value={cardDescription}
                    onChange={(e) => setCardDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel text-sm
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCardForm(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={cardSubmitting}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {cardSubmitting ? 'Saving...' : (editingCard ? 'Save Changes' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rate Cards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-drydock-text">Rate Cards</h2>
            <button
              onClick={openCreateCard}
              className="px-3 py-1.5 text-sm border border-drydock-border text-drydock-text-dim
                hover:text-drydock-text hover:border-drydock-steel rounded-md transition-colors"
            >
              + Add Card
            </button>
          </div>
          <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-drydock-border">
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Meter Type</th>
                  <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Unit Price</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Currency</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                  <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingCards ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="border-b border-drydock-border/50">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : rateCards.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-drydock-steel">No rate cards configured</td></tr>
                ) : (
                  rateCards.map((card) => (
                    <tr key={card.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-drydock-text font-medium">{card.name}</td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{card.meterType}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-drydock-text">{formatCents(card.unitPriceCents)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{card.currency}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${card.isActive ? 'bg-green-900/30 text-green-400 border-green-700/30' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {card.isActive ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditCard(card)}
                            className="text-xs text-drydock-steel hover:text-drydock-text transition-colors px-2 py-1 rounded hover:bg-drydock-border/30"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCard(card)}
                            className="text-xs text-drydock-steel hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-900/20"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pull Runs */}
        <section>
          <div className="flex items-center gap-4 mb-3">
            <h2 className="text-base font-medium text-drydock-text">Pull Runs</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Config ID (UUID)"
                value={configId}
                onChange={(e) => setConfigId(e.target.value)}
                className="px-3 py-1.5 text-sm bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder-drydock-steel font-mono
                  focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30 w-72"
              />
              <button
                onClick={() => loadRuns(configId.trim())}
                disabled={!configId.trim() || loadingRuns}
                className="px-3 py-1.5 text-sm border border-drydock-border text-drydock-text-dim
                  hover:text-drydock-text hover:border-drydock-steel rounded-md transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingRuns ? 'Loading...' : 'Load Runs'}
              </button>
            </div>
          </div>
          <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-drydock-border">
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Period</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                  <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total Billed</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Invoice ID</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {loadingRuns ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-drydock-border/50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : runs.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">
                    {configId ? 'No runs found for this config' : 'Enter a Config ID above to view runs'}
                  </td></tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-drydock-text font-mono">
                        {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[run.status] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {run.status}
                        </span>
                        {run.errorMessage && (
                          <span className="ml-2 text-xs text-red-400 truncate max-w-xs" title={run.errorMessage}>
                            {run.errorMessage.slice(0, 60)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-drydock-text">
                        {formatCents(run.totalAmountCents)}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-steel text-xs">
                        {run.invoiceId ? (
                          <Link
                            to={`/invoices/${run.invoiceId}`}
                            className="text-drydock-accent hover:underline"
                          >
                            {run.invoiceId.slice(0, 8)}…
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reconciliation Summary — computed client-side from already-fetched runs */}
        {totalRuns > 0 && (
          <section>
            <h2 className="text-base font-medium text-drydock-text mb-3">Reconciliation Summary</h2>
            <div className="bg-drydock-card border border-drydock-border rounded-lg p-5 flex flex-wrap gap-8">
              <div>
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Total Runs</p>
                <p className="text-2xl font-medium text-drydock-text">{totalRuns}</p>
              </div>
              {Object.entries(runsByStatus).map(([status, count]) => (
                <div key={status}>
                  <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">{status}</p>
                  <p className={`text-2xl font-medium ${
                    status === 'complete' ? 'text-green-400'
                    : status === 'failed' ? 'text-red-400'
                    : status === 'running' ? 'text-blue-400'
                    : 'text-yellow-400'
                  }`}>{count}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Total Billed</p>
                <p className="text-2xl font-medium font-mono text-drydock-text">{formatCents(totalBilledCents)}</p>
              </div>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
