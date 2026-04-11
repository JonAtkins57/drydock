<<<<<<< HEAD
import { useEffect, useState, type FormEvent } from 'react';
=======
import { useEffect, useState } from 'react';
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

<<<<<<< HEAD
=======
interface Warehouse {
  id: string;
  name: string;
  code: string;
  locationId: string | null;
  isActive: boolean;
  createdAt: string;
}

>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
interface InventoryItem {
  id: string;
  itemId: string;
  warehouseId: string;
  quantityOnHand: string;
<<<<<<< HEAD
  quantityReserved: string;
  quantityAvailable: string;
=======
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
  unitCost: string;
  totalCost: string;
  createdAt: string;
}

<<<<<<< HEAD
interface Warehouse {
  id: string;
  name: string;
  code: string;
}

export default function Inventory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouseList, setWarehouseList] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Create form
  const [transactionType, setTransactionType] = useState('receipt');
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadWarehouses();
    load();
  }, [user, navigate]);

  useEffect(() => {
    load();
  }, [warehouseFilter]);

  const loadWarehouses = async () => {
    try {
      const res = await endpoints.warehouses(1, 200);
      setWarehouseList((res as { data: Warehouse[] }).data);
    } catch { /* */ }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await endpoints.inventoryItems(1, 50, warehouseFilter || undefined);
      setItems((res as { data: InventoryItem[]; meta: { total: number } }).data);
      setTotal((res as { data: InventoryItem[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        transactionType,
        itemId: itemId.trim(),
        warehouseId: warehouseId.trim(),
        quantity: parseFloat(quantity),
        unitCost: parseFloat(unitCost),
        totalCost: parseFloat(totalCost),
        notes: notes.trim() || undefined,
      };
      if (transactionType === 'transfer') {
        body.fromWarehouseId = fromWarehouseId.trim();
      }
      await endpoints.createInventoryTransaction(body);
      setShowCreate(false);
      resetForm();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create transaction');
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setTransactionType('receipt');
    setItemId('');
    setWarehouseId('');
    setFromWarehouseId('');
    setQuantity('');
    setUnitCost('');
    setTotalCost('');
    setNotes('');
    setFormError('');
  };

=======
interface InventoryTransaction {
  id: string;
  transactionType: string;
  itemId: string;
  warehouseId: string;
  fromWarehouseId: string | null;
  quantity: string;
  unitCost: string;
  totalCost: string;
  referenceNumber: string | null;
  transactionDate: string;
}

const TX_TYPE_COLORS: Record<string, string> = {
  receipt: 'bg-green-900/30 text-green-400 border-green-700/30',
  issue: 'bg-red-900/30 text-red-400 border-red-700/30',
  transfer: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  count: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  adjustment: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
};

export function Warehouses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    endpoints.warehouses().then((res) => {
      const r = res as { data: Warehouse[]; meta: { total: number } };
      setItems(r.data);
      setTotal(r.meta.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user, navigate]);

>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
<<<<<<< HEAD
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Inventory</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Transaction
          </button>
        </div>

        {/* Warehouse Filter */}
        <div className="mb-4">
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
              text-drydock-text text-sm focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
          >
            <option value="">All Warehouses</option>
            {warehouseList.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
            ))}
          </select>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => { setShowCreate(false); resetForm(); }} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Transaction</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Transaction Type</label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="receipt">Receipt</option>
                    <option value="issue">Issue</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="transfer">Transfer</option>
                    <option value="count">Count</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Item ID (UUID)</label>
                  <input
                    type="text"
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Warehouse ID (UUID)</label>
                  <input
                    type="text"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>
                {transactionType === 'transfer' && (
                  <div>
                    <label className="block text-sm text-drydock-text-dim mb-1">From Warehouse ID (UUID)</label>
                    <input
                      type="text"
                      value={fromWarehouseId}
                      onChange={(e) => setFromWarehouseId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                        text-drydock-text placeholder-drydock-steel
                        focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    min="0.000001"
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Unit Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Total Cost</label>
                  <input
                    type="number"
                    step="any"
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Optional notes"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); resetForm(); }}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !itemId.trim() || !warehouseId.trim() || !quantity}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Transaction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
=======
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">Warehouses</h1>
          <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
        </div>
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
<<<<<<< HEAD
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Item</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">SKU</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Warehouse</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Qty On Hand</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Qty Reserved</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Qty Available</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Unit Cost</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total Value</th>
=======
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Code</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Active</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
<<<<<<< HEAD
                    {Array.from({ length: 8 }).map((_, j) => (
=======
                    {Array.from({ length: 4 }).map((_, j) => (
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
<<<<<<< HEAD
                <tr><td colSpan={8} className="px-5 py-8 text-center text-drydock-steel">No inventory records found</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{item.itemId}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">—</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{item.warehouseId}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text text-right">{Number(item.quantityOnHand).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel text-right">{Number(item.quantityReserved).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text text-right">{Number(item.quantityAvailable).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel text-right">{Number(item.unitCost).toFixed(2)}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text text-right">{Number(item.totalCost).toFixed(2)}</td>
=======
                <tr><td colSpan={4} className="px-5 py-8 text-center text-drydock-steel">No warehouses found</td></tr>
              ) : (
                items.map((w) => (
                  <tr key={w.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-drydock-text font-medium">{w.name}</td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{w.code}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{w.isActive ? 'Yes' : 'No'}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(w.createdAt).toLocaleDateString()}</td>
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

export function InventoryItemsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    endpoints.inventoryItems().then((res) => {
      const r = res as { data: InventoryItem[]; meta: { total: number } };
      setItems(r.data);
      setTotal(r.meta.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">Inventory Balances</h1>
          <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
        </div>
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Item ID</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Warehouse ID</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Qty On Hand</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Unit Cost</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total Cost</th>
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
                <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">No inventory balances found</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-xs font-mono text-drydock-steel truncate max-w-[140px]">{item.itemId}</td>
                    <td className="px-5 py-3 text-xs font-mono text-drydock-steel truncate max-w-[140px]">{item.warehouseId}</td>
                    <td className="px-5 py-3 text-sm text-right text-drydock-text">{parseFloat(item.quantityOnHand).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-right text-drydock-text">${parseFloat(item.unitCost).toFixed(4)}</td>
                    <td className="px-5 py-3 text-sm text-right text-drydock-accent">${parseFloat(item.totalCost).toFixed(2)}</td>
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

export function InventoryTransactionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    endpoints.inventoryTransactions().then((res) => {
      const r = res as { data: InventoryTransaction[]; meta: { total: number } };
      setItems(r.data);
      setTotal(r.meta.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">Inventory Transactions</h1>
          <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
        </div>
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Item ID</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Warehouse</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Qty</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total Cost</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Ref #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Date</th>
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
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No transactions found</td></tr>
              ) : (
                items.map((txn) => (
                  <tr key={txn.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${TX_TYPE_COLORS[txn.transactionType] ?? 'bg-gray-800 text-gray-400'}`}>
                        {txn.transactionType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-drydock-steel truncate max-w-[120px]">{txn.itemId}</td>
                    <td className="px-5 py-3 text-xs font-mono text-drydock-steel truncate max-w-[120px]">{txn.warehouseId}</td>
                    <td className="px-5 py-3 text-sm text-right text-drydock-text">{parseFloat(txn.quantity).toLocaleString()}</td>
                    <td className={`px-5 py-3 text-sm text-right font-medium ${parseFloat(txn.totalCost) < 0 ? 'text-red-400' : 'text-drydock-accent'}`}>
                      ${parseFloat(txn.totalCost).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{txn.referenceNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(txn.transactionDate).toLocaleDateString()}</td>
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
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
