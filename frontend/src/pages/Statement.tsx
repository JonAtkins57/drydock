import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints, type StatementResponse, ApiError } from '../lib/api';
import Sidebar from '../components/Sidebar';

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(1);
  return toISODate(d);
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  overdue: 'bg-red-900/30 text-red-400 border-red-700/30',
};

const AGING_LABELS: Record<string, string> = {
  current: 'Current',
  '1_30': '1–30 Days',
  '31_60': '31–60 Days',
  '61_90': '61–90 Days',
  '90plus': '90+ Days',
};

export default function Statement() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(toISODate(new Date()));
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
  }, [user, navigate]);

  useEffect(() => {
    if (!id || !from || !to || from > to) return;
    loadStatement();
  }, [id, from, to]);

  const loadStatement = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.customerStatement(id!, from, to);
      setStatement(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load statement');
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!id) return;
    setSending(true);
    setSendStatus(null);
    try {
      const res = await endpoints.sendStatement(id);
      setSendStatus({ ok: true, message: `Statement sent to ${res.sentTo}` });
    } catch (e) {
      setSendStatus({ ok: false, message: e instanceof ApiError ? e.message : 'Failed to send statement' });
    }
    setSending(false);
  };

  if (!user) return null;

  const agingKeys = ['current', '1_30', '31_60', '61_90', '90plus'] as const;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">
              {statement ? statement.customer_name : 'Customer Statement'}
            </h1>
            <p className="text-drydock-text-dim text-sm mt-1">Account statement for date range</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-drydock-text-dim">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-drydock-card border border-drydock-border rounded px-3 py-1.5 text-sm text-drydock-text"
            />
            <label className="text-sm text-drydock-text-dim">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-drydock-card border border-drydock-border rounded px-3 py-1.5 text-sm text-drydock-text"
            />
            <button
              onClick={handleSend}
              disabled={sending || !statement}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send Statement'}
            </button>
          </div>
        </div>

        {sendStatus && (
          <div className={`mb-4 px-4 py-3 rounded text-sm border ${sendStatus.ok
            ? 'bg-green-900/20 border-green-700/30 text-green-400'
            : 'bg-red-900/20 border-red-700/30 text-red-400'}`}>
            {sendStatus.message}
          </div>
        )}

        {from > to && (
          <div className="mb-4 px-4 py-3 rounded text-sm border bg-yellow-900/20 border-yellow-700/30 text-yellow-400">
            "From" date must be before or equal to "To" date.
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded text-sm border bg-red-900/20 border-red-700/30 text-red-400">
            {error}
          </div>
        )}

        {statement && (
          <>
            <div className="grid grid-cols-5 gap-4 mb-6">
              {agingKeys.map((key) => {
                const bucket = statement.aging_summary[key];
                return (
                  <div key={key} className="bg-drydock-card border border-drydock-border rounded-lg p-4">
                    <p className="text-xs text-drydock-steel uppercase tracking-wider mb-2">{AGING_LABELS[key]}</p>
                    <p className="text-xl font-semibold text-drydock-text">{fmtDollars(bucket.totalOutstanding)}</p>
                    <p className="text-xs text-drydock-text-dim mt-1">{bucket.count} invoice{bucket.count !== 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-drydock-text-dim">
                Total Outstanding:{' '}
                <span className="text-drydock-text font-semibold">{fmtDollars(statement.total_outstanding)}</span>
                {statement.truncated && (
                  <span className="ml-3 text-yellow-400">
                    (Results truncated to 500 invoices)
                  </span>
                )}
              </div>
            </div>

            <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-drydock-border">
                    <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Invoice #</th>
                    <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Due Date</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Total</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Paid</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Outstanding</th>
                    <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-drydock-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-5 py-3">
                            <div className="h-4 bg-drydock-border/40 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : statement.open_invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-drydock-text-dim text-sm">
                        No open invoices in this date range
                      </td>
                    </tr>
                  ) : (
                    statement.open_invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-drydock-border/50 hover:bg-drydock-border/10">
                        <td className="px-5 py-3 text-sm text-drydock-text font-mono">{inv.invoiceNumber}</td>
                        <td className="px-5 py-3 text-sm text-drydock-text">{inv.dueDate}</td>
                        <td className="px-5 py-3 text-sm text-drydock-text text-right">{fmtDollars(inv.totalAmount)}</td>
                        <td className="px-5 py-3 text-sm text-drydock-text text-right">{fmtDollars(inv.paidAmount)}</td>
                        <td className="px-5 py-3 text-sm text-drydock-text text-right font-medium">{fmtDollars(inv.outstanding)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[inv.status] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                            {inv.status}
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

        {!statement && !loading && !error && (
          <div className="text-center py-16 text-drydock-text-dim text-sm">
            Select a date range to load the statement.
          </div>
        )}
      </main>
    </div>
  );
}
