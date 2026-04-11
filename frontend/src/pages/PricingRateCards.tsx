import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface RateCard {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RateCardTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCents: number;
}

export default function PricingRateCards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<RateCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [selectedCard, setSelectedCard] = useState<RateCard | null>(null);
  const [tiers, setTiers] = useState<RateCardTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await endpoints.rateCards(1, 50) as { data: RateCard[]; meta: { total: number } };
      setCards(res.data);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
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
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      setCurrency('USD');
      setEffectiveFrom('');
      setEffectiveTo('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create rate card');
    }
    setSubmitting(false);
  };

  const openTiers = async (card: RateCard) => {
    setSelectedCard(card);
    setTiersLoading(true);
    try {
      const rows = await endpoints.getRateCardTiers(card.id) as RateCardTier[];
      setTiers(rows);
    } catch { setTiers([]); }
    setTiersLoading(false);
  };

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Rate Cards</h1>
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
                    placeholder="e.g. Standard 2026"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    required
                    maxLength={3}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text font-mono
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Effective From</label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Effective To</label>
                    <input
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
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
                    disabled={submitting || !name.trim() || !effectiveFrom}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Rate Card'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tier Detail Panel */}
        {selectedCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedCard(null)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-drydock-text">{selectedCard.name} — Tiers</h2>
                <button onClick={() => setSelectedCard(null)} className="text-drydock-steel hover:text-drydock-text">✕</button>
              </div>
              {tiersLoading ? (
                <p className="text-drydock-steel text-sm">Loading...</p>
              ) : tiers.length === 0 ? (
                <p className="text-drydock-steel text-sm">No tiers defined.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-drydock-border">
                      <th className="text-left py-2 px-3 text-xs text-drydock-steel uppercase tracking-wider">Min Qty</th>
                      <th className="text-left py-2 px-3 text-xs text-drydock-steel uppercase tracking-wider">Max Qty</th>
                      <th className="text-left py-2 px-3 text-xs text-drydock-steel uppercase tracking-wider">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((tier) => (
                      <tr key={tier.id} className="border-b border-drydock-border/50">
                        <td className="py-2 px-3 font-mono text-drydock-text">{tier.minQuantity}</td>
                        <td className="py-2 px-3 font-mono text-drydock-text">{tier.maxQuantity ?? '∞'}</td>
                        <td className="py-2 px-3 font-mono text-drydock-accent">{formatPrice(tier.unitPriceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Rate Cards Table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Currency</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Effective From</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Effective To</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Tiers</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : cards.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-drydock-steel">No rate cards found</td></tr>
              ) : (
                cards.map((card) => (
                  <tr key={card.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-drydock-text font-medium">
                      <div>{card.name}</div>
                      {card.description && <div className="text-xs text-drydock-steel mt-0.5">{card.description}</div>}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{card.currency}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{card.effectiveFrom}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{card.effectiveTo ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        card.isActive
                          ? 'bg-green-900/30 text-green-400 border-green-700/30'
                          : 'bg-gray-800 text-gray-400 border-gray-700/30'
                      }`}>
                        {card.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openTiers(card)}
                        className="text-xs text-drydock-accent hover:underline"
                      >
                        View tiers
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
