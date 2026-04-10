import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  poNumber: string;
  poId: string;
  receivedBy: string;
  receiptDate: string;
  createdAt: string;
}

export default function GoodsReceipts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.goodsReceipts(1, 50);
      setReceipts(res.data as GoodsReceipt[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Goods Receipts</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
        </div>

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Receipt #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">PO #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Received By</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Receipt Date</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
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
              ) : receipts.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">No goods receipts found</td></tr>
              ) : (
                receipts.map((r) => (
                  <tr key={r.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.receiptNumber}</td>
                    <td className="px-5 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/purchase-orders`)}
                        className="text-drydock-accent hover:underline font-mono"
                      >
                        {r.poNumber}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{r.receivedBy}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.receiptDate ? new Date(r.receiptDate).toLocaleDateString() : '-'}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(r.createdAt).toLocaleDateString()}</td>
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
