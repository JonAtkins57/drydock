import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorName: string;
  status: string;
  totalAmount: number;
  orderDate: string;
  expectedDelivery: string;
  createdAt: string;
  lineItems?: POLine[];
}

interface POLine {
  id: string;
  itemDescription: string;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
}

interface POFormLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  pending_approval: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  approved: 'bg-green-900/30 text-green-400 border-green-700/30',
  dispatched: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  received: 'bg-teal-900/30 text-teal-400 border-teal-700/30',
  cancelled: 'bg-gray-800 text-gray-400 border-gray-700',
  sent: 'bg-indigo-900/30 text-indigo-400 border-indigo-700/30',
};

const STATUS_ACTIONS: Record<string, { label: string; action: string }[]> = {
  draft: [{ label: 'Submit', action: 'submit' }, { label: 'Send to Vendor', action: 'send-to-vendor' }],
  pending_approval: [{ label: 'Approve', action: 'approve' }],
  approved: [{ label: 'Dispatch', action: 'dispatch' }],
  dispatched: [{ label: 'Receive', action: 'receive' }],
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const emptyLine = (): POFormLine => ({ description: '', quantity: 1, unitPrice: 0 });

export default function PurchaseOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showReceive, setShowReceive] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});

  // Create form
  const [vendor, setVendor] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POFormLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.purchaseOrders(1, 50);
      setOrders(res.data as PurchaseOrder[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const updateLine = (idx: number, field: keyof POFormLine, value: string | number) => {
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
      await endpoints.createPO({
        vendorName: vendor,
        orderDate,
        expectedDelivery: expectedDelivery || undefined,
        notes,
        lineItems: lines
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: Math.round(l.unitPrice * 100),
          })),
      });
      setShowCreate(false);
      setVendor('');
      setOrderDate('');
      setExpectedDelivery('');
      setNotes('');
      setLines([emptyLine()]);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create PO');
    }
    setSubmitting(false);
  };

  const handleAction = async (po: PurchaseOrder, action: string) => {
    if (action === 'receive') {
      setShowReceive(po);
      const qtys: Record<string, number> = {};
      (po.lineItems ?? []).forEach((li) => { qtys[li.id] = 0; });
      setReceiveQtys(qtys);
      return;
    }
    try {
      await endpoints.poAction(po.id, action);
      load();
    } catch { /* */ }
  };

  const handleReceive = async () => {
    if (!showReceive) return;
    try {
      await endpoints.receivePO(showReceive.id, {
        lineItems: Object.entries(receiveQtys)
          .filter(([, qty]) => qty > 0)
          .map(([lineItemId, quantityReceived]) => ({ lineItemId, quantityReceived })),
      });
      setShowReceive(null);
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
            <h1 className="text-2xl font-medium text-drydock-text">Purchase Orders</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Purchase Order
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Purchase Order</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Vendor</label>
                    <input
                      type="text"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Vendor name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Order Date</label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Expected Delivery</label>
                    <input
                      type="date"
                      value={expectedDelivery}
                      onChange={(e) => setExpectedDelivery(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="Notes"
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
                    disabled={submitting || !vendor.trim() || !orderDate || lines.every((l) => !l.description.trim())}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Purchase Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Receive Modal */}
        {showReceive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowReceive(null)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-medium text-drydock-text mb-4">
                Receive PO: {showReceive.poNumber}
              </h2>
              <div className="bg-drydock-bg border border-drydock-border rounded-lg overflow-hidden mb-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-drydock-border">
                      <th className="text-left px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium">Item</th>
                      <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-20">Ordered</th>
                      <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-20">Received</th>
                      <th className="text-right px-3 py-2 text-xs text-drydock-steel uppercase tracking-wider font-medium w-28">Receiving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showReceive.lineItems ?? []).map((li) => (
                      <tr key={li.id} className="border-b border-drydock-border/50">
                        <td className="px-3 py-2 text-sm text-drydock-text">{li.itemDescription || li.description}</td>
                        <td className="px-3 py-2 text-sm text-drydock-text-dim text-right font-mono">{li.orderedQuantity}</td>
                        <td className="px-3 py-2 text-sm text-drydock-text-dim text-right font-mono">{li.receivedQuantity ?? 0}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max={li.orderedQuantity - (li.receivedQuantity ?? 0)}
                            value={receiveQtys[li.id] ?? 0}
                            onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [li.id]: parseInt(e.target.value) || 0 }))}
                            className="w-full px-2 py-1.5 bg-drydock-card border border-drydock-border rounded text-sm text-right
                              text-drydock-text focus:outline-none focus:border-drydock-accent font-mono"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowReceive(null)}
                  className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                    hover:text-drydock-text hover:border-drydock-steel transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReceive}
                  className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                    text-drydock-dark font-medium rounded-md transition-colors"
                >
                  Confirm Receipt
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
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">PO #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Vendor</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Order Date</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Expected Delivery</th>
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
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No purchase orders found</td></tr>
              ) : (
                orders.map((po) => {
                  const actions = STATUS_ACTIONS[po.status] ?? [];
                  return (
                    <tr key={po.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{po.poNumber}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text">{po.vendorName}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[po.status] ?? 'bg-gray-800 text-gray-400'}`}>
                          {po.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(po.totalAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString() : '-'}</td>
                      <td className="px-5 py-3 flex gap-1">
                        {actions.map((a) => (
                          <button
                            key={a.action}
                            onClick={() => handleAction(po, a.action)}
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
