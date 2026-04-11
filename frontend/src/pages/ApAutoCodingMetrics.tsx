import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface TopAccount {
  accountId: string;
  accountName: string;
  frequency: number;
  acceptanceRate: number;
}

interface Metrics {
  totalSuggestions: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate: number;
  topAccounts: TopAccount[];
}

export default function ApAutoCodingMetrics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.apAutocodingMetrics();
      setMetrics(res);
    } catch { /* */ }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-drydock-text">ML Coding Metrics</h1>
          <p className="text-sm text-drydock-steel mt-1">Frequency-based GL account suggestion performance</p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-drydock-border/30 rounded" />
            <div className="h-64 bg-drydock-border/30 rounded" />
          </div>
        ) : !metrics ? (
          <p className="text-drydock-steel">Failed to load metrics.</p>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Total Suggestions</p>
                <p className="text-2xl font-semibold text-drydock-text">{metrics.totalSuggestions.toLocaleString()}</p>
              </div>
              <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Accepted</p>
                <p className="text-2xl font-semibold text-green-400">{metrics.acceptedCount.toLocaleString()}</p>
              </div>
              <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Rejected</p>
                <p className="text-2xl font-semibold text-red-400">{metrics.rejectedCount.toLocaleString()}</p>
              </div>
              <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
                <p className="text-xs text-drydock-steel uppercase tracking-wider mb-1">Acceptance Rate</p>
                <p className="text-2xl font-semibold text-drydock-accent">
                  {(metrics.acceptanceRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Top Accounts Table */}
            <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-drydock-border">
                <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">Top Accounts by Frequency</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-drydock-border">
                    <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Account Name</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-32">Times Chosen</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-36">Acceptance Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.topAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-drydock-steel text-sm">
                        No feedback data yet. Suggestions will be tracked as coders accept or override them.
                      </td>
                    </tr>
                  ) : (
                    metrics.topAccounts.map((acct) => (
                      <tr key={acct.accountId} className="border-b border-drydock-border/50">
                        <td className="px-5 py-3 text-sm text-drydock-text">{acct.accountName}</td>
                        <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right">{acct.frequency.toLocaleString()}</td>
                        <td className="px-5 py-3 text-sm font-mono text-right">
                          <span className={acct.acceptanceRate >= 0.7 ? 'text-green-400' : acct.acceptanceRate >= 0.4 ? 'text-yellow-400' : 'text-red-400'}>
                            {(acct.acceptanceRate * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
