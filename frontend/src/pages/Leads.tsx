import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';
import RecordDrawer, { type FieldDef } from '../components/RecordDrawer';

const LEAD_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Full Name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Source', type: 'select', options: [
    { value: 'website', label: 'Website' },
    { value: 'referral', label: 'Referral' },
    { value: 'cold_outreach', label: 'Cold Outreach' },
    { value: 'event', label: 'Event' },
    { value: 'partner', label: 'Partner' },
    { value: 'other', label: 'Other' },
  ]},
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'converted', label: 'Converted' },
    { value: 'lost', label: 'Lost' },
  ]},
  { key: 'notes', label: 'Notes', type: 'textarea' },
  { key: 'createdAt', label: 'Created', readOnly: true },
];

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  source: string;
  status: string;
  createdAt: string;
}

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const;

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    new: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
    contacted: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
    qualified: 'bg-green-900/30 text-green-400 border-green-700/30',
    converted: 'bg-purple-900/30 text-purple-400 border-purple-700/30',
    lost: 'bg-red-900/30 text-red-400 border-red-700/30',
  };
  return map[status] ?? 'bg-gray-800 text-gray-400 border-gray-700';
};

function CreateLeadModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('website');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await endpoints.createLead({ name, email, phone: phone || undefined, company: company || undefined, source });
      setName(''); setEmail(''); setPhone(''); setCompany(''); setSource('website');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New Lead</h2>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="email@example.com" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Company</label>
            <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent">
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="cold_call">Cold Call</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md hover:text-drydock-text hover:border-drydock-steel transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim() || !email.trim()}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertLeadModal({ open, onClose, onConverted, leadId, leadName }: { open: boolean; onClose: () => void; onConverted: () => void; leadId: string; leadName: string }) {
  const [opportunityName, setOpportunityName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setOpportunityName(`${leadName} - Opportunity`);
  }, [open, leadName]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await endpoints.convertLead(leadId, {
        opportunityName,
        expectedAmount: Math.round(parseFloat(expectedAmount) * 100),
      });
      setOpportunityName(''); setExpectedAmount('');
      onConverted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert lead');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">Convert to Opportunity</h2>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Opportunity Name</label>
            <input type="text" value={opportunityName} onChange={(e) => setOpportunityName(e.target.value)} required autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Expected Amount ($)</label>
            <input type="number" step="0.01" min="0" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} required
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="0.00" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md hover:text-drydock-text hover:border-drydock-steel transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !opportunityName.trim() || !expectedAmount}
              className="flex-1 py-2 px-4 text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadLeads();
  }, [user, navigate, statusFilter]);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const res = await endpoints.leads(1, 50, statusFilter === 'all' ? undefined : statusFilter);
      setLeads(res.data as Lead[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleConvert = (lead: Lead) => {
    setConvertLead(lead);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Leads</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="search"
              placeholder="Search leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 text-sm bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder:text-drydock-steel focus:outline-none focus:border-drydock-accent w-48"
            />
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md transition-colors">
              + New Lead
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mb-4 bg-drydock-card border border-drydock-border rounded-lg p-1 w-fit">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-drydock-accent text-drydock-dark font-medium'
                  : 'text-drydock-steel hover:text-drydock-text'
              }`}>
              {s}
            </button>
          ))}
        </div>

        <CreateLeadModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={loadLeads} />
        <ConvertLeadModal
          open={!!convertLead}
          onClose={() => setConvertLead(null)}
          onConverted={loadLeads}
          leadId={convertLead?.id ?? ''}
          leadName={convertLead?.name ?? ''}
        />

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Email</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Company</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Source</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : leads.filter((l) => !search || `${l.name} ${l.email} ${l.company ?? ''}`.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">{search ? 'No leads match your search' : 'No leads found'}</td>
                </tr>
              ) : (
                leads.filter((l) => !search || `${l.name} ${l.email} ${l.company ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((l) => (
                  <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer">
                    <td className="px-5 py-3 text-sm text-drydock-text font-medium">{l.name}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{l.email}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{l.company ?? '--'}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim capitalize">{l.source?.replace('_', ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(l.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {l.status === 'qualified' && (
                        <button onClick={(e) => { e.stopPropagation(); handleConvert(l); }}
                          className="text-xs px-2 py-1 rounded bg-purple-900/30 text-purple-400 border border-purple-700/30 hover:bg-purple-900/50 transition-colors">
                          Convert
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <RecordDrawer open={!!selectedId} onClose={() => setSelectedId(null)} entityPath="/leads"
        recordId={selectedId} fields={LEAD_FIELDS} title="Lead" onSaved={loadLeads} />
    </div>
  );
}
