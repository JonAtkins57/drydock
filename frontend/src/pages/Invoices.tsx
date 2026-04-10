import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  dueDate: string;
  paidAmount: number;
  createdAt: string;
}

interface ArAgingBucket {
  label: string;
  amount: number;
}

interface ArAgingData {
  current: number;
  '1-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  sent: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  paid: 'bg-green-900/30 text-green-400 border-green-700/30',
  overdue: 'bg-red-900/30 text-red-400 border-red-700/30',
  cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
  credited: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
};

const STATUS_ACTIONS: Record<string, { label: string; action: string }[]> = {
  draft: [{ label: 'Send', action: 'send' }, { label: 'Email', action: 'send-email' }],
  sent: [{ label: 'Record Payment', action: 'pay' }, { label: 'Email', action: 'send-email' }],
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Invoices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [aging, setAging] = useState<ArAgingData | null>(null);

  // Create form
  const [customer, setCustomer] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
    loadAging();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.invoices(1, 50);
      setItems(res.data as Invoice[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const loadAging = async () => {
    try {
      const res = await endpoints.arAging();
      setAging(res as ArAgingData);
    } catch { /* */ }
  };

  const isOverdue = (inv: Invoice) =>
    inv.status === 'sent' && inv.dueDate && new Date(inv.dueDate) < new Date();

  const getDisplayStatus = (inv: Invoice) => {
    if (isOverdue(inv)) return 'overdue';
    return inv.status;
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createInvoice({
        customerName: customer,
        dueDate: dueDate || undefined,
        description,
        totalAmount: Math.round(parseFloat(amount) * 100),
      });
      setShowCreate(false);
      setCustomer('');
      setDueDate('');
      setDescription('');
      setAmount('');
      load();
      loadAging();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create invoice');
    }
    setSubmitting(false);
  };

  const handleAction = async (inv: Invoice, action: string) => {
    if (action === 'pay') {
      setShowPayment(inv);
      setPaymentAmount('');
      return;
    }
    try {
      await endpoints.invoiceAction(inv.id, action);
      load();
      loadAging();
    } catch { /* */ }
  };

  const handlePayment = async () => {
    if (!showPayment) return;
    try {
      await endpoints.invoiceAction(showPayment.id, 'pay', {
        amount: Math.round(parseFloat(paymentAmount) * 100),
      });
      setShowPayment(null);
      load();
      loadAging();
    } catch { /* */ }
  };

  const agingBuckets: ArAgingBucket[] = aging
    ? [
        { label: 'Current', amount: aging.current },
        { label: '1-30', amount: aging['1-30'] },
        { label: '31-60', amount: aging['31-60'] },
        { label: '61-90', amount: aging['61-90'] },
        { label: '90+', amount: aging['90+'] },
      ]
    : [];

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Invoices</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Invoice
          </button>
        </div>

        {/* AR Aging Summary */}
        {aging && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-4 mb-6">
            <h2 className="text-sm font-medium text-drydock-text-dim mb-3 uppercase tracking-wider">AR Aging Summary</h2>
            <div className="flex gap-4">
              {agingBuckets.map((b) => (
                <div
                  key={b.label}
                  className={`flex-1 rounded-lg p-3 border ${
                    b.label === '90+' && b.amount > 0
                      ? 'bg-red-900/20 border-red-700/30'
                      : 'bg-drydock-bg border-drydock-border'
                  }`}
                >
                  <p className="text-xs text-drydock-steel mb-1">{b.label} days</p>
                  <p className={`text-lg font-mono font-medium ${
                    b.label === '90+' && b.amount > 0 ? 'text-red-400' : 'text-drydock-text'
                  }`}>
                    {fmtDollars(b.amount)}
                  </p>
                </div>
              ))}
              <div className="flex-1 rounded-lg p-3 bg-drydock-accent/10 border border-drydock-accent/30">
                <p className="text-xs text-drydock-accent mb-1">Total Outstanding</p>
                <p className="text-lg font-mono font-medium text-drydock-accent">{fmtDollars(aging.total)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Invoice</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Customer</label>
                  <input
                    type="text"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Customer name"
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
                    placeholder="Invoice description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
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
                    disabled={submitting || !customer.trim() || !amount}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowPayment(null)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">
                Record Payment: {showPayment.invoiceNumber}
              </h2>
              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-drydock-text-dim">Invoice Total</span>
                  <span className="font-mono text-drydock-text">{fmtDollars(showPayment.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-drydock-text-dim">Already Paid</span>
                  <span className="font-mono text-drydock-text">{fmtDollars(showPayment.paidAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-drydock-border pt-2">
                  <span className="text-drydock-text-dim font-medium">Remaining Balance</span>
                  <span className="font-mono text-drydock-accent font-medium">
                    {fmtDollars(showPayment.totalAmount - (showPayment.paidAmount ?? 0))}
                  </span>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-drydock-text-dim mb-1">Payment Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={(showPayment.totalAmount - (showPayment.paidAmount ?? 0)) / 100}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                    text-drydock-text font-mono
                    focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPayment(null)}
                  className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                    hover:text-drydock-text hover:border-drydock-steel transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                    text-drydock-dark font-medium rounded-md
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Record Payment
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Invoice #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Customer</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Due Date</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Paid</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-drydock-steel">No invoices found</td></tr>
              ) : (
                items.map((inv) => {
                  const displayStatus = getDisplayStatus(inv);
                  const actions = STATUS_ACTIONS[inv.status] ?? [];
                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors ${
                        isOverdue(inv) ? 'bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{inv.customerName}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[displayStatus] ?? 'bg-gray-800 text-gray-400'}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(inv.totalAmount)}</td>
                      <td className={`px-5 py-3 text-sm ${isOverdue(inv) ? 'text-red-400 font-medium' : 'text-drydock-text-dim'}`}>
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text-dim text-right">{fmtDollars(inv.paidAmount ?? 0)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(inv.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 flex gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.action}
                            onClick={() => handleAction(inv, a.action)}
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
