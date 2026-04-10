import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Period {
  id: string;
  name: string;
}

interface TrialBalanceRow {
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
}

interface TrialBalanceResponse {
  rows: TrialBalanceRow[];
  totals: { debitTotal: number; creditTotal: number; netBalance: number };
}

const fmtDollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export default function TrialBalance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadPeriods();
  }, [user, navigate]);

  const loadPeriods = async () => {
    try {
      const res = await endpoints.periods();
      setPeriods(res as Period[]);
    } catch { /* */ }
  };

  const loadReport = async (periodId?: string) => {
    setLoading(true);
    try {
      const res = await endpoints.trialBalance(periodId ? { periodId } : undefined);
      setData(res as TrialBalanceResponse);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadReport(selectedPeriod || undefined);
  }, [selectedPeriod, user]);

  if (!user) return null;

  // Group rows by account type
  const grouped: Record<string, TrialBalanceRow[]> = {};
  if (data?.rows) {
    for (const row of data.rows) {
      const type = row.accountType || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(row);
    }
  }

  const sortedTypes = TYPE_ORDER.filter((t) => grouped[t]?.length).concat(
    Object.keys(grouped).filter((t) => !TYPE_ORDER.includes(t))
  );

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Trial Balance</h1>
            <p className="text-drydock-text-dim text-sm mt-1">Period summary of all accounts</p>
          </div>
          <div>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 bg-drydock-card border border-drydock-border rounded-md
                text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
            >
              <option value="">All periods</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Account #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Account Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Debit</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Credit</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Net Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : !data?.rows?.length ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-drydock-steel">No data available</td></tr>
              ) : (
                sortedTypes.map((type) => {
                  const rows = grouped[type];
                  const subtotalDebit = rows.reduce((s, r) => s + r.debitTotal, 0);
                  const subtotalCredit = rows.reduce((s, r) => s + r.creditTotal, 0);
                  const subtotalNet = rows.reduce((s, r) => s + r.netBalance, 0);
                  return (
                    <Fragment key={type}>
                      {rows.map((row) => (
                        <tr key={row.accountNumber} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                          <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{row.accountNumber}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text">{row.accountName}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{row.accountType}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right">{fmtDollars(row.debitTotal)}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right">{fmtDollars(row.creditTotal)}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right">{fmtDollars(row.netBalance)}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-drydock-border bg-drydock-bg/30">
                        <td colSpan={3} className="px-5 py-2 text-sm text-drydock-text font-medium capitalize text-right">
                          {type} subtotal
                        </td>
                        <td className="px-5 py-2 text-sm text-drydock-text font-mono text-right font-medium">{fmtDollars(subtotalDebit)}</td>
                        <td className="px-5 py-2 text-sm text-drydock-text font-mono text-right font-medium">{fmtDollars(subtotalCredit)}</td>
                        <td className="px-5 py-2 text-sm text-drydock-text font-mono text-right font-medium">{fmtDollars(subtotalNet)}</td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {data?.totals && (
              <tfoot>
                <tr className="border-t-2 border-drydock-accent/30 bg-drydock-card">
                  <td colSpan={3} className="px-5 py-3 text-sm text-drydock-text font-bold text-right">Grand Total</td>
                  <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right font-bold">{fmtDollars(data.totals.debitTotal)}</td>
                  <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right font-bold">{fmtDollars(data.totals.creditTotal)}</td>
                  <td className="px-5 py-3 text-sm text-drydock-text font-mono text-right font-bold">{fmtDollars(data.totals.netBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </div>
  );
}
