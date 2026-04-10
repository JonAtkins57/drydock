import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/store';
import { endpoints } from '../../lib/api';
import Sidebar from '../../components/Sidebar';

interface AccountRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  netAmount: number;
}

interface IncomeStatementResponse {
  revenue: AccountRow[];
  expenses: AccountRow[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

const fmtDollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function IncomeStatement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<IncomeStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
  }, [user, navigate]);

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) params.dateTo = new Date(dateTo).toISOString();
      const res = await endpoints.incomeStatement(Object.keys(params).length ? params : undefined);
      setData(res as IncomeStatementResponse);
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
            <h1 className="text-2xl font-medium text-drydock-text">Income Statement</h1>
            <p className="text-drydock-text-dim text-sm mt-1">Revenue and expenses for a date range</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
              placeholder="From"
            />
            <span className="text-drydock-steel text-sm">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
              placeholder="To"
            />
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

        {data && (
          <div className="space-y-6">
            {/* Revenue */}
            <section className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-drydock-border bg-drydock-bg/40">
                <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">Revenue</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-drydock-border">
                    <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account #</th>
                    <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account Name</th>
                    <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenue.length === 0 ? (
                    <tr><td colSpan={3} className="px-5 py-4 text-center text-drydock-steel text-sm">No revenue accounts</td></tr>
                  ) : (
                    data.revenue.map((row) => (
                      <tr key={row.accountId} className="border-b border-drydock-border/50 hover:bg-drydock-bg/40 transition-colors">
                        <td className="px-5 py-2.5 text-sm font-mono text-drydock-accent">{row.accountNumber}</td>
                        <td className="px-5 py-2.5 text-sm text-drydock-text">{row.accountName}</td>
                        <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.netAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-drydock-border bg-drydock-bg/30">
                    <td colSpan={2} className="px-5 py-2.5 text-sm font-medium text-drydock-text text-right">Total Revenue</td>
                    <td className="px-5 py-2.5 text-sm font-mono font-bold text-right text-drydock-text">{fmtDollars(data.totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Expenses */}
            <section className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-drydock-border bg-drydock-bg/40">
                <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">Expenses</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-drydock-border">
                    <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account #</th>
                    <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account Name</th>
                    <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.length === 0 ? (
                    <tr><td colSpan={3} className="px-5 py-4 text-center text-drydock-steel text-sm">No expense accounts</td></tr>
                  ) : (
                    data.expenses.map((row) => (
                      <tr key={row.accountId} className="border-b border-drydock-border/50 hover:bg-drydock-bg/40 transition-colors">
                        <td className="px-5 py-2.5 text-sm font-mono text-drydock-accent">{row.accountNumber}</td>
                        <td className="px-5 py-2.5 text-sm text-drydock-text">{row.accountName}</td>
                        <td className="px-5 py-2.5 text-sm font-mono text-right text-drydock-text">{fmtDollars(row.netAmount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-drydock-border bg-drydock-bg/30">
                    <td colSpan={2} className="px-5 py-2.5 text-sm font-medium text-drydock-text text-right">Total Expenses</td>
                    <td className="px-5 py-2.5 text-sm font-mono font-bold text-right text-drydock-text">{fmtDollars(data.totalExpenses)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Net Income */}
            <div className="bg-drydock-card border border-drydock-border rounded-lg px-5 py-4 flex items-center justify-between">
              <span className="text-base font-bold text-drydock-text">Net Income</span>
              <span className={`text-xl font-mono font-bold ${data.netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtDollars(data.netIncome)}
              </span>
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg px-5 py-12 text-center text-drydock-steel">
            Select a date range and click Run to generate the income statement.
          </div>
        )}
      </main>
    </div>
  );
}
