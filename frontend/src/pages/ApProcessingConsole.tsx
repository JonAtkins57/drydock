import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface ApInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  totalAmount: number;
  status: string;
  source: string;
  createdAt: string;
}

interface QueueCounts {
  all: number;
  intake: number;
  ocr_pending: number;
  review: number;
  coding: number;
  approval: number;
  match_exception: number;
  ready_to_post: number;
  [key: string]: number;
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'intake', label: 'New' },
  { key: 'ocr_pending', label: 'OCR Review' },
  { key: 'review', label: 'Coding' },
  { key: 'coding', label: 'Coding' },
  { key: 'approval', label: 'Approval' },
  { key: 'match_exception', label: 'Match Exception' },
  { key: 'ready_to_post', label: 'Ready to Post' },
];

// Deduplicate — "Coding" appears twice above if review and coding are separate queues.
// Actually, spec says: All, New, OCR Review, Coding, Approval, Match Exception, Ready to Post
const TAB_CONFIG = [
  { key: 'all', label: 'All' },
  { key: 'intake', label: 'New' },
  { key: 'ocr_pending', label: 'OCR Review' },
  { key: 'coding', label: 'Coding' },
  { key: 'approval', label: 'Approval' },
  { key: 'match_exception', label: 'Match Exception' },
  { key: 'ready_to_post', label: 'Ready to Post' },
];

const STATUS_COLORS: Record<string, string> = {
  intake: 'bg-gray-800 text-gray-400 border-gray-700',
  ocr_pending: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  review: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  coding: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
  approval: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
  approved: 'bg-green-900/30 text-green-400 border-green-700/30',
  posted: 'bg-teal-900/30 text-teal-400 border-teal-700/30',
  rejected: 'bg-red-900/30 text-red-400 border-red-700/30',
  duplicate: 'bg-gray-800 text-gray-400 border-gray-700 border-dashed',
};

const fmtDollars = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ApProcessingConsole() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<ApInvoice[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({ all: 0, intake: 0, ocr_pending: 0, review: 0, coding: 0, approval: 0, match_exception: 0, ready_to_post: 0 });
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadQueue();
  }, [user, navigate]);

  useEffect(() => {
    if (user) loadInvoices();
  }, [activeTab]);

  const loadQueue = async () => {
    try {
      const res = await endpoints.apInvoiceQueue();
      setCounts(res as QueueCounts);
    } catch { /* */ }
  };

  const loadInvoices = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = activeTab === 'all' ? '' : `&filter={"status":"${activeTab}"}`;
      const res = await endpoints.apInvoices(1, 50, activeTab === 'all' ? undefined : activeTab);
      setInvoices(res.data as ApInvoice[]);
    } catch { /* */ }
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.id)));
  };

  const bulkApprove = async () => {
    for (const id of selected) {
      try { await endpoints.apInvoiceAction(id, 'approve'); } catch { /* */ }
    }
    loadInvoices();
    loadQueue();
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">AP Processing Console</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{counts.all} invoices</p>
          </div>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={bulkApprove}
                className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                  text-drydock-dark font-medium rounded-md transition-colors"
              >
                Approve Selected ({selected.size})
              </button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 border-b border-drydock-border overflow-x-auto">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors
                ${activeTab === tab.key
                  ? 'border-drydock-accent text-drydock-accent'
                  : 'border-transparent text-drydock-text-dim hover:text-drydock-text'
                }`}
            >
              {tab.label}
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-drydock-border/50 text-drydock-steel">
                {counts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={invoices.length > 0 && selected.size === invoices.length}
                    onChange={toggleAll}
                    className="accent-drydock-accent"
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Invoice #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Vendor</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Amount</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Source</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
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
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No invoices in this queue</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/ap-invoices/${inv.id}`)}
                  >
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="accent-drydock-accent"
                      />
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{inv.vendorName}</td>
                    <td className="px-5 py-3 text-sm font-mono text-drydock-text text-right">{fmtDollars(inv.totalAmount)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[inv.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {inv.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{inv.source}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(inv.createdAt).toLocaleDateString()}</td>
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
