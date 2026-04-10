import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface OcrField {
  field: string;
  value: string;
  confidence: number;
}

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  glAccountId: string;
  glAccountName: string;
  department: string;
  project: string;
}

interface MatchResult {
  poNumber: string;
  matchStatus: string;
  varianceAmount: number;
  variancePercent: number;
}

interface ApInvoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  vendorId: string;
  status: string;
  totalAmount: number;
  subtotal: number;
  taxAmount: number;
  invoiceDate: string;
  dueDate: string;
  receivedDate: string;
  source: string;
  createdAt: string;
  ocrResults?: OcrField[];
  lineItems: InvoiceLine[];
  matchResult?: MatchResult;
}

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

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-drydock-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-drydock-steel font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function ApInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<ApInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [coding, setCoding] = useState<Record<string, { glAccountId: string; department: string; project: string }>>({});

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (id) loadInvoice();
  }, [user, navigate, id]);

  const loadInvoice = async () => {
    try {
      const res = await endpoints.apInvoiceDetail(id!);
      const inv = res as ApInvoice;
      setInvoice(inv);
      const c: typeof coding = {};
      (inv.lineItems ?? []).forEach((li) => {
        c[li.id] = { glAccountId: li.glAccountId ?? '', department: li.department ?? '', project: li.project ?? '' };
      });
      setCoding(c);
    } catch { /* */ }
    setLoading(false);
  };

  const handleAction = async (action: string) => {
    if (!invoice) return;
    try {
      await endpoints.apInvoiceAction(invoice.id, action);
      loadInvoice();
    } catch { /* */ }
  };

  const handleApplyCoding = async () => {
    if (!invoice) return;
    try {
      await endpoints.apApplyCoding(invoice.id, { lineItems: Object.entries(coding).map(([lineItemId, c]) => ({ lineItemId, ...c })) });
      loadInvoice();
    } catch { /* */ }
  };

  const updateCoding = (lineId: string, field: string, value: string) => {
    setCoding((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }));
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen bg-drydock-bg">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-drydock-border/30 rounded w-64" />
            <div className="h-64 bg-drydock-border/30 rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen bg-drydock-bg">
        <Sidebar />
        <main className="flex-1 p-8">
          <p className="text-drydock-steel">Invoice not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => navigate('/ap-console')} className="text-sm text-drydock-accent hover:underline mb-2 block">
              &larr; Back to AP Console
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-medium text-drydock-text">{invoice.invoiceNumber}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[invoice.status] ?? 'bg-gray-800 text-gray-400'}`}>
                {invoice.status?.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-drydock-text-dim text-sm mt-1">{invoice.vendorName}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApplyCoding}
              className="px-3 py-2 text-xs bg-orange-900/30 text-orange-400 border border-orange-700/30
                rounded hover:bg-orange-900/50 transition-colors"
            >
              Apply Coding Rules
            </button>
            {['intake', 'review', 'coding'].includes(invoice.status) && (
              <button
                onClick={() => handleAction('submit')}
                className="px-3 py-2 text-xs bg-drydock-accent/20 text-drydock-accent border border-drydock-accent/30
                  rounded hover:bg-drydock-accent/30 transition-colors"
              >
                Submit for Approval
              </button>
            )}
            {invoice.status === 'approval' && (
              <button
                onClick={() => handleAction('approve')}
                className="px-3 py-2 text-xs bg-green-900/30 text-green-400 border border-green-700/30
                  rounded hover:bg-green-900/50 transition-colors"
              >
                Approve
              </button>
            )}
            {invoice.status === 'approved' && (
              <button
                onClick={() => handleAction('post')}
                className="px-3 py-2 text-xs bg-teal-900/30 text-teal-400 border border-teal-700/30
                  rounded hover:bg-teal-900/50 transition-colors"
              >
                Post to GL
              </button>
            )}
            {!['posted', 'rejected'].includes(invoice.status) && (
              <button
                onClick={() => handleAction('reject')}
                className="px-3 py-2 text-xs bg-red-900/30 text-red-400 border border-red-700/30
                  rounded hover:bg-red-900/50 transition-colors"
              >
                Reject
              </button>
            )}
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Left: Invoice Data */}
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider mb-4">Invoice Data</h2>
            <dl className="space-y-3">
              {[
                ['Total Amount', fmtDollars(invoice.totalAmount)],
                ['Subtotal', fmtDollars(invoice.subtotal ?? 0)],
                ['Tax', fmtDollars(invoice.taxAmount ?? 0)],
                ['Invoice Date', invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : '-'],
                ['Due Date', invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'],
                ['Received', invoice.receivedDate ? new Date(invoice.receivedDate).toLocaleDateString() : '-'],
                ['Source', invoice.source ?? '-'],
                ['Vendor', invoice.vendorName],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-sm text-drydock-steel">{label}</dt>
                  <dd className="text-sm text-drydock-text font-mono">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right: OCR Results */}
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider mb-4">OCR Results</h2>
            {invoice.ocrResults && invoice.ocrResults.length > 0 ? (
              <div className="space-y-3">
                {invoice.ocrResults.map((field, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-drydock-steel">{field.field}</span>
                      <span className="text-xs text-drydock-text font-mono">{field.value}</span>
                    </div>
                    <ConfidenceBar confidence={field.confidence} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-drydock-steel">No OCR data available.</p>
            )}
          </div>
        </div>

        {/* Match Results */}
        {invoice.matchResult && (
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-5 mb-6">
            <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider mb-4">PO Match Results</h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-drydock-steel">PO Number</p>
                <p className="text-sm text-drydock-accent font-mono">{invoice.matchResult.poNumber}</p>
              </div>
              <div>
                <p className="text-xs text-drydock-steel">Match Status</p>
                <p className={`text-sm font-medium ${invoice.matchResult.matchStatus === 'matched' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {invoice.matchResult.matchStatus?.replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <p className="text-xs text-drydock-steel">Variance Amount</p>
                <p className="text-sm text-drydock-text font-mono">{fmtDollars(invoice.matchResult.varianceAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-drydock-steel">Variance %</p>
                <p className="text-sm text-drydock-text font-mono">{(invoice.matchResult.variancePercent ?? 0).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Line Items with Coding */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-drydock-border">
            <h2 className="text-sm font-medium text-drydock-text uppercase tracking-wider">Line Items & Coding</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Description</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-16">Qty</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-28">Unit Price</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-28">Amount</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-40">GL Account</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-32">Department</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium w-32">Project</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lineItems ?? []).length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No line items</td></tr>
              ) : (
                (invoice.lineItems ?? []).map((li) => (
                  <tr key={li.id} className="border-b border-drydock-border/50">
                    <td className="px-5 py-3 text-sm text-drydock-text">{li.description}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim text-right font-mono">{li.quantity}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim text-right font-mono">{fmtDollars(li.unitPrice)}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text text-right font-mono">{fmtDollars(li.amount)}</td>
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        value={coding[li.id]?.glAccountId ?? ''}
                        onChange={(e) => updateCoding(li.id, 'glAccountId', e.target.value)}
                        className="w-full px-2 py-1.5 bg-drydock-bg border border-drydock-border rounded text-xs
                          text-drydock-text focus:outline-none focus:border-drydock-accent"
                        placeholder="Account"
                      />
                    </td>
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        value={coding[li.id]?.department ?? ''}
                        onChange={(e) => updateCoding(li.id, 'department', e.target.value)}
                        className="w-full px-2 py-1.5 bg-drydock-bg border border-drydock-border rounded text-xs
                          text-drydock-text focus:outline-none focus:border-drydock-accent"
                        placeholder="Department"
                      />
                    </td>
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        value={coding[li.id]?.project ?? ''}
                        onChange={(e) => updateCoding(li.id, 'project', e.target.value)}
                        className="w-full px-2 py-1.5 bg-drydock-bg border border-drydock-border rounded text-xs
                          text-drydock-text focus:outline-none focus:border-drydock-accent"
                        placeholder="Project"
                      />
                    </td>
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
