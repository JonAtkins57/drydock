import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface LeaseContract {
  id: string;
  leaseNumber: string;
  assetDescription: string;
  leaseType: 'operating' | 'finance';
  status: string;
  commencementDate: string;
  leaseEndDate: string;
  leaseTermMonths: number;
  paymentAmount: number;
  paymentFrequency: string;
  rouAssetAmount: number;
  leaseLiabilityAmount: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  active: 'bg-green-900/30 text-green-400 border-green-700/30',
  terminated: 'bg-red-900/30 text-red-400 border-red-700/30',
  expired: 'bg-gray-800 text-gray-500 border-gray-700',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LeaseContracts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<LeaseContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [description, setDescription] = useState('');
  const [leaseType, setLeaseType] = useState<'operating' | 'finance'>('operating');
  const [commencementDate, setCommencementDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaseTermMonths, setLeaseTermMonths] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [incrementalBorrowingRate, setIncrementalBorrowingRate] = useState('');
  const [rouAssetValue, setRouAssetValue] = useState('');
  const [leaseLiabilityValue, setLeaseLiabilityValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.leases(1, 50);
      setItems((res as { data: LeaseContract[]; meta: { total: number } }).data);
      setTotal((res as { data: LeaseContract[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const resetForm = () => {
    setDescription('');
    setLeaseType('operating');
    setCommencementDate('');
    setEndDate('');
    setLeaseTermMonths('');
    setPaymentAmount('');
    setPaymentFrequency('monthly');
    setIncrementalBorrowingRate('');
    setRouAssetValue('');
    setLeaseLiabilityValue('');
    setFormError('');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createLease({
        description: description.trim(),
        leaseType,
        commencementDate: new Date(commencementDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        leaseTermMonths: parseInt(leaseTermMonths, 10),
        paymentAmount: Math.round(parseFloat(paymentAmount) * 100),
        paymentFrequency,
        incrementalBorrowingRate: Math.round(parseFloat(incrementalBorrowingRate || '0') * 100),
        rouAssetValue: Math.round(parseFloat(rouAssetValue || '0') * 100),
        leaseLiabilityValue: Math.round(parseFloat(leaseLiabilityValue || '0') * 100),
      });
      setShowCreate(false);
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create lease contract');
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
            <h1 className="text-2xl font-medium text-drydock-text">Lease Contracts</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total · ASC 842</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); resetForm(); }}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Lease
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Lease Contract</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
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
                    placeholder="Office lease, equipment lease..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Lease Type</label>
                    <select
                      value={leaseType}
                      onChange={(e) => setLeaseType(e.target.value as 'operating' | 'finance')}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent"
                    >
                      <option value="operating">Operating</option>
                      <option value="finance">Finance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Payment Frequency</label>
                    <select
                      value={paymentFrequency}
                      onChange={(e) => setPaymentFrequency(e.target.value as 'monthly' | 'quarterly' | 'annual')}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Commencement Date</label>
                    <input
                      type="date"
                      value={commencementDate}
                      onChange={(e) => setCommencementDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Term (months)</label>
                    <input
                      type="number"
                      min="1"
                      value={leaseTermMonths}
                      onChange={(e) => setLeaseTermMonths(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono focus:outline-none focus:border-drydock-accent"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Payment Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono focus:outline-none focus:border-drydock-accent"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">IBR (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={incrementalBorrowingRate}
                      onChange={(e) => setIncrementalBorrowingRate(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono focus:outline-none focus:border-drydock-accent"
                      placeholder="5.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">ROU Asset ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rouAssetValue}
                      onChange={(e) => setRouAssetValue(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono focus:outline-none focus:border-drydock-accent"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Lease Liability ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={leaseLiabilityValue}
                      onChange={(e) => setLeaseLiabilityValue(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono focus:outline-none focus:border-drydock-accent"
                      placeholder="0.00"
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
                    disabled={submitting || !description.trim() || !commencementDate || !endDate || !leaseTermMonths || !paymentAmount}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Lease'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Lease #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Commencement</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">End</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Payment</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">ROU Asset</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Liability</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-drydock-steel">No lease contracts found</td>
                </tr>
              ) : (
                items.map((lease) => (
                  <tr key={lease.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{lease.leaseNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text max-w-xs truncate">{lease.assetDescription}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text capitalize">{lease.leaseType}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[lease.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {lease.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">
                      {new Date(lease.commencementDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">
                      {new Date(lease.leaseEndDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">
                      {fmtDollars(lease.paymentAmount)}
                      <span className="text-drydock-steel text-xs ml-1">/{lease.paymentFrequency.slice(0, 2)}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">
                      {fmtDollars(lease.rouAssetAmount)}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">
                      {fmtDollars(lease.leaseLiabilityAmount)}
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
