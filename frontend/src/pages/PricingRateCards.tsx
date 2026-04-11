import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface RateCardTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCents: number;
}

interface RateCard {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  tiers?: RateCardTier[];
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PricingRateCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<RateCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<RateCard | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Add tier state
  const [showAddTier, setShowAddTier] = useState(false);
  const [tierMin, setTierMin] = useState(0);
  const [tierMax, setTierMax] = useState<string>('');
  const [tierPrice, setTierPrice] = useState('');
  const [tierSubmitting, setTierSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.rateCards(1, 50);
      setItems((res as { data: RateCard[]; meta: { total: number } }).data);
      setTotal((res as { data: RateCard[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedCard(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetail(true);
    try {
      const card = await endpoints.getRateCard(id);
      setExpandedCard(card as RateCard);
    } catch { /* */ }
    setLoadingDetail(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createRateCard({
        name: name.trim(),
        description: description.trim() || undefined,
        currency,
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      setCurrency('USD');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create rate card');
    }
    setSubmitting(false);
  };

  const handleAddTier = async (e: FormEvent) => {
    e.preventDefault();
    if (!expandedId) return;
    setTierSubmitting(true);
    try {
      await endpoints.addRateCardTier(expandedId, {
        minQuantity: tierMin,
        maxQuantity: tierMax !== '' ? parseInt(tierMax, 10) : null,
        unitPriceCents: Math.round(parseFloat(tierPrice) * 100),
      });
      setShowAddTier(false);
      setTierMin(0);
      setTierMax('');
      setTierPrice('');
      // Reload the expanded card detail
      const card = await endpoints.getRateCard(expandedId);
      setExpandedCard(card as RateCard);
    } catch { /* */ }
    setTierSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this rate card?')) return;
    try {
      await endpoints.deleteRateCard(id);
      load();
      if (expandedId === id) { setExpandedId(null); setExpandedCard(null); }
    } catch { /* */ }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Pricing &amp; Rate Cards</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Rate Card
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Rate Card</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="e.g. Standard Delivery Rate"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel resize-none
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                    maxLength={3}
                    className="w-32 px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
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
                    {submitting ? 'Creating...' : 'Create'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Currency</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">No rate cards found</td></tr>
              ) : (
                items.map((card) => (
                  <>
                    <tr
                      key={card.id}
                      className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer"
                      onClick={() => handleExpand(card.id)}
                    >
                      <td className="px-5 py-3 text-sm text-drydock-text font-medium">
                        <span className="mr-2 text-drydock-steel">{expandedId === card.id ? '▾' : '▸'}</span>
                        {card.name}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{card.currency}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${card.isActive
                          ? 'bg-green-900/30 text-green-400 border-green-700/30'
                          : 'bg-gray-800 text-gray-400 border-gray-700/30'}`}>
                          {card.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(card.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(card.id); }}
                          className="text-xs text-drydock-steel hover:text-red-400 transition-colors"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>

                    {expandedId === card.id && (
                      <tr key={`${card.id}-detail`} className="border-b border-drydock-border/50 bg-drydock-bg/30">
                        <td colSpan={5} className="px-8 py-4">
                          {loadingDetail ? (
                            <div className="text-sm text-drydock-steel">Loading tiers...</div>
                          ) : expandedCard ? (
                            <div>
                              {expandedCard.description && (
                                <p className="text-sm text-drydock-text-dim mb-3">{expandedCard.description}</p>
                              )}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-drydock-steel uppercase tracking-wider">Pricing Tiers</span>
                                <button
                                  onClick={() => setShowAddTier(true)}
                                  className="text-xs px-2 py-1 bg-drydock-accent/10 hover:bg-drydock-accent/20
                                    text-drydock-accent border border-drydock-accent/30 rounded transition-colors"
                                >
                                  + Add Tier
                                </button>
                              </div>

                              {showAddTier && (
                                <form onSubmit={handleAddTier} className="mb-3 p-3 bg-drydock-card border border-drydock-border rounded-md flex gap-3 items-end">
                                  <div>
                                    <label className="block text-xs text-drydock-steel mb-1">Min Qty</label>
                                    <input
                                      type="number"
                                      value={tierMin}
                                      onChange={(e) => setTierMin(parseInt(e.target.value, 10))}
                                      min={0}
                                      className="w-24 px-2 py-1 text-sm bg-drydock-bg border border-drydock-border rounded text-drydock-text"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-drydock-steel mb-1">Max Qty (blank = ∞)</label>
                                    <input
                                      type="number"
                                      value={tierMax}
                                      onChange={(e) => setTierMax(e.target.value)}
                                      min={1}
                                      className="w-28 px-2 py-1 text-sm bg-drydock-bg border border-drydock-border rounded text-drydock-text"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-drydock-steel mb-1">Unit Price ($)</label>
                                    <input
                                      type="number"
                                      value={tierPrice}
                                      onChange={(e) => setTierPrice(e.target.value)}
                                      min={0}
                                      step={0.01}
                                      required
                                      className="w-28 px-2 py-1 text-sm bg-drydock-bg border border-drydock-border rounded text-drydock-text"
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    disabled={tierSubmitting || !tierPrice}
                                    className="px-3 py-1 text-sm bg-drydock-accent text-drydock-dark font-medium rounded
                                      disabled:opacity-50 transition-colors"
                                  >
                                    {tierSubmitting ? '...' : 'Add'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowAddTier(false)}
                                    className="px-3 py-1 text-sm text-drydock-steel border border-drydock-border rounded"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              )}

                              {!expandedCard.tiers || expandedCard.tiers.length === 0 ? (
                                <p className="text-sm text-drydock-steel">No tiers defined yet.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-drydock-steel">
                                      <th className="pb-1 pr-6">Min Qty</th>
                                      <th className="pb-1 pr-6">Max Qty</th>
                                      <th className="pb-1">Unit Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedCard.tiers.map((tier) => (
                                      <tr key={tier.id} className="border-t border-drydock-border/30">
                                        <td className="py-1 pr-6 font-mono text-drydock-text">{tier.minQuantity}</td>
                                        <td className="py-1 pr-6 font-mono text-drydock-text">{tier.maxQuantity ?? '∞'}</td>
                                        <td className="py-1 font-mono text-drydock-accent">{formatCents(tier.unitPriceCents)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
