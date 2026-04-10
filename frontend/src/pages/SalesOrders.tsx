import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface SalesOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  createdAt: string;
}

interface SOFormLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  confirmed: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  fulfilled: 'bg-green-900/30 text-green-400 border-green-700/30',
  cancelled: 'bg-red-900/30 text-red-400 border-red-700/30',
};

const STATUS_ACTIONS: Record<string, { label: string; action: string }[]> = {
  draft: [{ label: 'Confirm', action: 'confirm' }],
  confirmed: [{ label: 'Generate Invoice', action: 'invoice' }],
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyLine = (): SOFormLine => ({ description: '', quantity: 1, unitPrice: 0 });

export default function SalesOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<SalesOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [customer, setCustomer] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [lines, setLines] = useState<SOFormLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.orders(1, 50);
      setItems(res.data as SalesOrder[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const updateLine = (idx: number, field: keyof SOFormLine, value: string | number) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createOrder({
        customerName: customer,
        orderDate: orderDate || undefined,
        lineItems: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: Math.round(l.unitPrice * 100),
          })),
      });
      setShowCreate(false);
      setCustomer('');
      setOrderDate('');
      setLines([emptyLine()]);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create order');
    }
    setSubmitting(false);
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await endpoints.orderAction(id, action);
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
            <h1 className="text-2xl font-medium text-drydock-text">Sales Orders</h1>
            <p className="text-drydock-text-dim text-sm mt-1">
              {total} total — Orders are auto-created from accepted quotes, or create manually below
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Sales Order
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Sales Order</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    <label className="block text-sm text-drydock-text-dim mb-1">Order Date</label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
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
                          <th className="text-left px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-24">Qty</th>
                          <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-36">Unit Price ($)</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={idx} className="border-b border-drydock-border/50">
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={line.description}
                                onChange={(e) => updateLine(idx, 'description', e.target.value)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm
                                  text-drydock-text focus:outline-none focus:border-drydock-accent"
                                placeholder="Item description"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.unitPrice || ''}
                                onChange={(e) => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                                  text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              {lines.length > 1 && (
                                <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-300 text-sm">x</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
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
                    disabled={submitting || !customer.trim() || lines.every((l) => !l.description.trim())}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Sales Order'}
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Order #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Customer</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Order Date</th>
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
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No sales orders found</td></tr>
              ) : (
                items.map((o) => {
                  const actions = STATUS_ACTIONS[o.status] ?? [];
                  return (
                    <tr key={o.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{o.orderNumber}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{o.customerName}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[o.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(o.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 flex gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.action}
                            onClick={() => handleAction(o.id, a.action)}
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
