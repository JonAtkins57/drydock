import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Opportunity {
  id: string;
  name: string;
  customer?: { id: string; name: string } | null;
  customerName?: string;
  stage: string;
  probability: number;
  expectedAmount: number; // cents
  expectedCloseDate?: string;
  description?: string;
  createdAt: string;
}

interface PipelineStage {
  stage: string;
  count: number;
  totalAmount: number; // cents
}

const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;

const stageBadge = (stage: string) => {
  const map: Record<string, string> = {
    prospecting: 'bg-gray-800 text-gray-400 border-gray-700',
    qualification: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
    proposal: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
    negotiation: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
    closed_won: 'bg-green-900/30 text-green-400 border-green-700/30',
    closed_lost: 'bg-red-900/30 text-red-400 border-red-700/30',
  };
  return map[stage] ?? 'bg-gray-800 text-gray-400 border-gray-700';
};

const stageLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const formatCurrency = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CreateOpportunityModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [stage, setStage] = useState<string>('prospecting');
  const [probability, setProbability] = useState('20');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await endpoints.createOpportunity({
        name,
        customerName: customer || undefined,
        stage,
        probability: parseInt(probability),
        expectedAmount: Math.round(parseFloat(expectedAmount) * 100),
        expectedCloseDate: expectedCloseDate || undefined,
        description: description || undefined,
      });
      setName(''); setCustomer(''); setStage('prospecting'); setProbability('20');
      setExpectedAmount(''); setExpectedCloseDate(''); setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create opportunity');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New Opportunity</h2>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Opportunity name" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Customer</label>
            <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Customer name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Stage</label>
              <select value={stage} onChange={(e) => setStage(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent">
                {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Probability (%)</label>
              <input type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Expected Amount ($)</label>
              <input type="number" step="0.01" min="0" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} required
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Expected Close</label>
              <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30 resize-none"
              placeholder="Optional" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md hover:text-drydock-text hover:border-drydock-steel transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim() || !expectedAmount}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Creating...' : 'Create Opportunity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KanbanCard({ opp }: { opp: Opportunity }) {
  const customerName = opp.customer?.name ?? opp.customerName;
  return (
    <div className="bg-drydock-bg border border-drydock-border rounded-md p-3 mb-2 hover:border-drydock-steel/50 transition-colors">
      <p className="text-sm text-drydock-text font-medium truncate">{opp.name}</p>
      {customerName && <p className="text-xs text-drydock-text-dim mt-1 truncate">{customerName}</p>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-drydock-accent font-mono">{formatCurrency(opp.expectedAmount)}</span>
        <span className="text-xs text-drydock-steel">{opp.probability}%</span>
      </div>
    </div>
  );
}

export default function Opportunities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<'table' | 'kanban'>('table');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [oppRes, pipeRes] = await Promise.all([
        endpoints.opportunities(1, 100),
        endpoints.pipeline(),
      ]);
      setOpportunities(oppRes.data as Opportunity[]);
      setTotal(oppRes.meta.total);
      setPipeline(Array.isArray(pipeRes) ? pipeRes as PipelineStage[] : (pipeRes as { data: PipelineStage[] }).data ?? []);
    } catch { /* */ }
    setLoading(false);
  };

  if (!user) return null;

  const oppsByStage = (stage: string) => opportunities.filter((o) => o.stage === stage);

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8 overflow-x-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Opportunities</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-drydock-card border border-drydock-border rounded-md overflow-hidden">
              <button onClick={() => setView('table')}
                className={`px-3 py-1.5 text-xs transition-colors ${view === 'table' ? 'bg-drydock-accent text-drydock-dark font-medium' : 'text-drydock-steel hover:text-drydock-text'}`}>
                Table
              </button>
              <button onClick={() => setView('kanban')}
                className={`px-3 py-1.5 text-xs transition-colors ${view === 'kanban' ? 'bg-drydock-accent text-drydock-dark font-medium' : 'text-drydock-steel hover:text-drydock-text'}`}>
                Kanban
              </button>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md transition-colors">
              + New Opportunity
            </button>
          </div>
        </div>

        {/* Pipeline summary */}
        {!loading && pipeline.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {STAGES.map((stage) => {
              const p = pipeline.find((x) => x.stage === stage);
              return (
                <div key={stage} className="bg-drydock-card border border-drydock-border rounded-md px-3 py-2 text-center min-w-[120px]">
                  <p className="text-[10px] text-drydock-steel uppercase tracking-wider">{stageLabel(stage)}</p>
                  <p className="text-sm text-drydock-text font-medium mt-0.5">{p?.count ?? 0}</p>
                  <p className="text-xs text-drydock-accent font-mono">{formatCurrency(p?.totalAmount ?? 0)}</p>
                </div>
              );
            })}
          </div>
        )}

        <CreateOpportunityModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={loadData} />

        {view === 'table' ? (
          <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-drydock-border">
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Customer</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Stage</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Probability</th>
                  <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Amount</th>
                  <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Close Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-drydock-border/50">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-drydock-steel">No opportunities found</td>
                  </tr>
                ) : (
                  opportunities.map((o) => (
                    <tr key={o.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-drydock-text">{o.name}</td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{o.customer?.name ?? o.customerName ?? '--'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${stageBadge(o.stage)}`}>
                          {stageLabel(o.stage)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-text-dim">{o.probability}%</td>
                      <td className="px-5 py-3 text-sm text-drydock-accent font-mono text-right">{formatCurrency(o.expectedAmount)}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">
                        {o.expectedCloseDate ? new Date(o.expectedCloseDate).toLocaleDateString() : '--'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Kanban view */
          <div className="flex gap-3 min-w-max pb-4">
            {STAGES.map((stage) => {
              const stageOpps = oppsByStage(stage);
              return (
                <div key={stage} className="w-64 flex-shrink-0">
                  <div className="bg-drydock-card border border-drydock-border rounded-lg">
                    <div className="px-3 py-2 border-b border-drydock-border flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${stageBadge(stage)}`}>
                        {stageLabel(stage)}
                      </span>
                      <span className="text-xs text-drydock-steel">{stageOpps.length}</span>
                    </div>
                    <div className="p-2 min-h-[100px]">
                      {loading ? (
                        <div className="h-16 bg-drydock-border/20 rounded animate-pulse" />
                      ) : stageOpps.length === 0 ? (
                        <p className="text-xs text-drydock-steel text-center py-4">Empty</p>
                      ) : (
                        stageOpps.map((o) => <KanbanCard key={o.id} opp={o} />)
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
