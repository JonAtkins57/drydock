import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/store';
import { endpoints } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

interface RevRecContract {
  id: string;
  contractNumber: string;
  customerId: string;
  status: string;
  totalTransactionPrice: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  active: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  completed: 'bg-green-900/30 text-green-400 border-green-700/30',
  cancelled: 'bg-red-900/30 text-red-400 border-red-700/30',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RevRec() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<RevRecContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.revRecContracts(1, 50);
      setItems((res as { data: RevRecContract[]; meta: { total: number } }).data);
      setTotal((res as { data: RevRecContract[]; meta: { total: number } }).meta.total);
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
            <h1 className="text-2xl font-medium text-drydock-text">Revenue Recognition</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} contracts</p>
          </div>
        </div>

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Contract #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Transaction Price</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Start Date</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">End Date</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
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
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-drydock-steel">No revenue recognition contracts found</td></tr>
              ) : (
                items.map((contract) => (
                  <tr key={contract.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{contract.contractNumber}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[contract.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {contract.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(contract.totalTransactionPrice)}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(contract.startDate).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{contract.endDate ? new Date(contract.endDate).toLocaleDateString() : '-'}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(contract.createdAt).toLocaleDateString()}</td>
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
