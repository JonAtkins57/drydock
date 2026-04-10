import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  accountSubtype: string | null;
  normalBalance: string;
  isPostingAccount: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  liability: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
  equity: 'bg-indigo-900/30 text-indigo-400 border-indigo-700/30',
  revenue: 'bg-green-900/30 text-green-400 border-green-700/30',
  expense: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
};

export default function Accounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadAccounts();
  }, [user, navigate]);

  const loadAccounts = async () => {
    try {
      const res = await endpoints.accounts();
      setAccounts(res.data as Account[]);
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
            <h1 className="text-2xl font-medium text-drydock-text">Chart of Accounts</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{accounts.length} accounts</p>
          </div>
        </div>

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Normal Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                accounts.map((a) => (
                  <tr key={a.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{a.accountNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{a.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[a.accountType] ?? 'bg-gray-800 text-gray-400'}`}>
                        {a.accountType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{a.normalBalance}</td>
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
