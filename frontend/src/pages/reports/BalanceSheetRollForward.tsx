import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/store';
import { endpoints } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

interface RollForwardRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  beginningBalance: number;
  periodDebits: number;
  periodCredits: number;
  endingBalance: number;
}

interface Period {
  id: string;
  periodName: string;
  startDate: string;
  endDate: string;
  fiscalYear: number;
  periodNumber: number;
  status: string;
}

const fmtDollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BalanceSheetRollForward() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [accountType, setAccountType] = useState('');
  const [rows, setRows] = useState<RollForwardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    endpoints.periods().then((data) => setPeriods(data as Period[])).catch(() => {});
  }, [user, navigate]);

  const loadReport = async () => {
    if (!periodId) {
      setError('Select a period first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { periodId };
      if (accountType) params.accountType = accountType;
      const data = await endpoints.balanceSheetRollforward(params);
      setRows(data as RollForwardRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Balance Sheet Roll-Forward</h1>
            <p className="text-drydock-text-dim text-sm mt-1">Beginning balance, period activity, and ending balance per account</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-drydock-steel text-sm">Period</label>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
            >
              <option value="">Select period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.periodName}
                </option>
              ))}
            </select>

            <label className="text-drydock-steel text-sm">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
            >
              <option value="">All</option>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
            </select>

            <button
              onClick={loadReport}
              disabled={loading}
              className="px-4 py-2 bg-drydock-accent text-white text-sm rounded-md
                hover:bg-drydock-accent/80 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading…' : 'Run'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-md text-red-400 text-sm">
            {error}
          </div>
        )}

        {rows !== null && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-drydock-border">
                  <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account #</th>
                  <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account Name</th>
                  <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Type</th>
                  <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Beginning</th>
                  <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Debits</th>
                  <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Credits</th>
                  <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Ending</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-drydock-steel text-sm">
                      No accounts with activity for this period.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.accountId} className="border-b border-drydock-border/50 hover:bg-drydock-bg/40 transition-colors">
                      <td className="px-5 py-2.5 text-sm font-mono text-drydock-accent">{row.accountNumber}</td>
                      <td className="px-5 py-2.5 text-sm text-drydock-text">{row.accountName}</td>
                      <td className="px-5 py-2.5 text-sm text-drydock-text capitalize">{row.accountType}</td>
                      <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.beginningBalance)}</td>
                      <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.periodDebits)}</td>
                      <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.periodCredits)}</td>
                      <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.endingBalance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {rows === null && !loading && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg px-5 py-12 text-center text-drydock-steel">
            Select a period and click Run to generate the roll-forward report.
          </div>
        )}
      </main>
    </div>
  );
}
