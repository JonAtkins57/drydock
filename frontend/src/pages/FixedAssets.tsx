import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  assetClass: string;
  status: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/30 text-green-400 border-green-700/30',
  disposed: 'bg-gray-800 text-gray-400 border-gray-700',
  fully_depreciated: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FixedAssets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<FixedAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState('equipment');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('');
  const [depreciationMethod, setDepreciationMethod] = useState('straight_line');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.assets(1, 50);
      setItems((res as { data: FixedAsset[]; meta: { total: number } }).data);
      setTotal((res as { data: FixedAsset[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createAsset({
        name: name.trim(),
        assetClass,
        acquisitionDate: new Date(acquisitionDate).toISOString(),
        acquisitionCost: Math.round(parseFloat(acquisitionCost) * 100),
        usefulLifeMonths: parseInt(usefulLifeMonths, 10),
        depreciationMethod,
      });
      setShowCreate(false);
      setName('');
      setAssetClass('equipment');
      setAcquisitionDate('');
      setAcquisitionCost('');
      setUsefulLifeMonths('');
      setDepreciationMethod('straight_line');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create asset');
    }
    setSubmitting(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Fixed Assets</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Asset
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Fixed Asset</h2>

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
                    placeholder="Asset name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Asset Class</label>
                  <select
                    value={assetClass}
                    onChange={(e) => setAssetClass(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="land">Land</option>
                    <option value="building">Building</option>
                    <option value="equipment">Equipment</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="furniture">Furniture</option>
                    <option value="software">Software</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Acquisition Date</label>
                  <input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Acquisition Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={acquisitionCost}
                    onChange={(e) => setAcquisitionCost(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text font-mono
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Useful Life (months)</label>
                  <input
                    type="number"
                    min="1"
                    value={usefulLifeMonths}
                    onChange={(e) => setUsefulLifeMonths(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text font-mono
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Depreciation Method</label>
                  <select
                    value={depreciationMethod}
                    onChange={(e) => setDepreciationMethod(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="straight_line">Straight Line</option>
                    <option value="declining_balance">Declining Balance</option>
                    <option value="units_of_production">Units of Production</option>
                  </select>
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
                    disabled={submitting || !name.trim() || !acquisitionDate || !acquisitionCost || !usefulLifeMonths}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Asset'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Asset #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Class</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Depreciation Method</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Acquisition Date</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Cost</th>
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
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No fixed assets found</td></tr>
              ) : (
                items.map((asset) => (
                  <tr key={asset.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{asset.assetNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{asset.name}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel capitalize">{asset.assetClass.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel capitalize">{asset.depreciationMethod.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[asset.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {asset.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">
                      {new Date(asset.acquisitionDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(asset.acquisitionCost)}</td>
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
