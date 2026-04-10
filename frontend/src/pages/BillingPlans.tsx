import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface BillingPlan {
  id: string;
  name: string;
  customerName: string;
  planType: string;
  billingMethod: string;
  frequency: string;
  status: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  scheduleLines?: ScheduleLine[];
}

interface ScheduleLine {
  id: string;
  billingDate: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-900/30 text-green-400 border-green-700/30',
  paused: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  completed: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
};

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  scheduled: 'text-blue-400',
  invoiced: 'text-green-400',
  cancelled: 'text-gray-400',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BillingPlans() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<BillingPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [planType, setPlanType] = useState('fixed');
  const [billingMethod, setBillingMethod] = useState('advance');
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.billingPlans(1, 50);
      setItems(res.data as BillingPlan[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createBillingPlan({
        name,
        customerName: customer,
        planType,
        billingMethod,
        frequency,
        startDate,
        endDate: endDate || undefined,
        totalAmount: Math.round(parseFloat(totalAmount) * 100),
      });
      setShowCreate(false);
      setName('');
      setCustomer('');
      setPlanType('fixed');
      setBillingMethod('advance');
      setFrequency('monthly');
      setStartDate('');
      setEndDate('');
      setTotalAmount('');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create billing plan');
    }
    setSubmitting(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Billing Plans</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Billing Plan
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Billing Plan</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Plan Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Plan name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Customer</label>
                    <input
                      type="text"
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Plan Type</label>
                    <select
                      value={planType}
                      onChange={(e) => setPlanType(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="recurring">Recurring</option>
                      <option value="milestone">Milestone</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Billing Method</label>
                    <select
                      value={billingMethod}
                      onChange={(e) => setBillingMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    >
                      <option value="advance">Advance</option>
                      <option value="arrears">Arrears</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Frequency</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                      <option value="one_time">One Time</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Total Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text font-mono
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
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
                    disabled={submitting || !name.trim() || !customer.trim() || !startDate || !totalAmount}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Billing Plan'}
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
                <th className="w-8" />
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Customer</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Method</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Frequency</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Start</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">End</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-drydock-steel">No billing plans found</td></tr>
              ) : (
                items.map((bp) => (
                  <>
                    <tr
                      key={bp.id}
                      className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(bp.id)}
                    >
                      <td className="pl-3 py-3 text-drydock-steel text-xs">
                        {expandedId === bp.id ? '-' : '+'}
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-accent font-medium">{bp.name}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{bp.customerName}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{bp.planType}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{bp.billingMethod}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{bp.frequency?.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[bp.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {bp.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(bp.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{bp.startDate ? new Date(bp.startDate).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{bp.endDate ? new Date(bp.endDate).toLocaleDateString() : '-'}</td>
                    </tr>
                    {expandedId === bp.id && bp.scheduleLines && bp.scheduleLines.length > 0 && (
                      <tr key={`${bp.id}-schedule`}>
                        <td colSpan={10} className="px-8 py-4 bg-drydock-bg/50">
                          <h3 className="text-sm font-medium text-drydock-text-dim mb-2 uppercase tracking-wider">Billing Schedule</h3>
                          <div className="bg-drydock-bg border border-drydock-border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-drydock-border">
                                  <th className="text-left px-4 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Billing Date</th>
                                  <th className="text-left px-4 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Period</th>
                                  <th className="text-right px-4 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Amount</th>
                                  <th className="text-left px-4 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bp.scheduleLines.map((sl) => (
                                  <tr key={sl.id} className="border-b border-drydock-border/50">
                                    <td className="px-4 py-2 text-sm text-drydock-text font-mono">
                                      {new Date(sl.billingDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-drydock-text-dim">
                                      {new Date(sl.periodStart).toLocaleDateString()} - {new Date(sl.periodEnd).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-2 text-sm font-mono text-drydock-text text-right">{fmtDollars(sl.amount)}</td>
                                    <td className="px-4 py-2">
                                      <span className={`text-xs font-medium capitalize ${SCHEDULE_STATUS_COLORS[sl.status] ?? 'text-gray-400'}`}>
                                        {sl.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
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
