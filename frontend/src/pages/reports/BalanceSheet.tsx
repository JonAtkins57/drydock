import { Fragment, useEffect, useState } from 'react';
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

interface BalanceSheetResponse {
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

const fmtDollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function AccountSection({ title, rows, total }: { title: string; rows: AccountRow[]; total: number }) {
  return (
    <section className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-drydock-border bg-drydock-bg/40">
        <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">{title}</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-drydock-border">
            <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account #</th>
            <th className="text-left px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Account Name</th>
            <th className="text-right px-5 py-2 text-xs text-drydock-steel uppercase tracking-wider">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className="px-5 py-4 text-center text-drydock-steel text-sm">No accounts</td></tr>
          ) : (
            rows.map((row) => (
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
            <td colSpan={2} className="px-5 py-2.5 text-sm font-medium text-drydock-text text-right">Total {title}</td>
            <td className="px-5 py-2.5 text-sm font-mono font-bold text-right text-drydock-text">{fmtDollars(total)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

export default function BalanceSheet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState('');
  const [data, setData] = useState<BalanceSheetResponse | null>(null);
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
      if (asOf) params.asOf = new Date(asOf).toISOString();
      const res = await endpoints.balanceSheet(Object.keys(params).length ? params : undefined);
      setData(res as BalanceSheetResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    }
    setLoading(false);
  };

  if (!user) return null;

  const balanced = data
    ? data.totalAssets === data.totalLiabilities + data.totalEquity
    : null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Balance Sheet</h1>
            <p className="text-drydock-text-dim text-sm mt-1">Assets, liabilities, and equity as of a date</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-drydock-steel text-sm">As of</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
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
            <AccountSection title="Assets" rows={data.assets} total={data.totalAssets} />
            <AccountSection title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} />
            <AccountSection title="Equity" rows={data.equity} total={data.totalEquity} />

            {/* Summary */}
            <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-drydock-border bg-drydock-bg/40">
                <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">Summary</h2>
              </div>
              <div className="px-5 py-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-drydock-text-dim">Total Assets</span>
                  <span className="font-mono text-drydock-text">{fmtDollars(data.totalAssets)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-drydock-text-dim">Total Liabilities</span>
                  <span className="font-mono text-drydock-text">{fmtDollars(data.totalLiabilities)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-drydock-text-dim">Total Equity</span>
                  <span className="font-mono text-drydock-text">{fmtDollars(data.totalEquity)}</span>
                </div>
                <div className="border-t border-drydock-border pt-2 flex justify-between text-sm font-bold">
                  <span className="text-drydock-text">Liabilities + Equity</span>
                  <span className="font-mono text-drydock-text">
                    {fmtDollars(data.totalLiabilities + data.totalEquity)}
                  </span>
                </div>
                {balanced !== null && (
                  <div className={`text-xs mt-1 ${balanced ? 'text-green-400' : 'text-red-400'}`}>
                    {balanced ? 'Balance sheet is balanced.' : 'Warning: balance sheet does not balance.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg px-5 py-12 text-center text-drydock-steel">
            Select an as-of date and click Run to generate the balance sheet.
          </div>
        )}
      </main>
    </div>
  );
}
