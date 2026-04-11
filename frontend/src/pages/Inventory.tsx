import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Warehouse {
  id: string;
  name: string;
  code: string;
  locationId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  itemId: string;
  warehouseId: string;
  quantityOnHand: string;
  unitCost: string;
  totalCost: string;
  createdAt: string;
}

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

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">Warehouses</h1>
          <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
        </div>
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Code</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Active</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
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
