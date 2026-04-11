import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface WorkOrder {
  id: string;
  workOrderNumber: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  assignedToEmployeeId: string | null;
  scheduledDate: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  assigned: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  in_progress: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
  completed: 'bg-green-900/30 text-green-400 border-green-700/30',
  invoiced: 'bg-gray-800 text-gray-400 border-gray-700',
};

export default function WorkOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('maintenance');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.workOrders(1, 50);
      setItems((res as { data: WorkOrder[]; meta: { total: number } }).data);
      setTotal((res as { data: WorkOrder[]; meta: { total: number } }).meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await endpoints.createWorkOrder({
        title: title.trim(),
        type,
        priority,
      });
      setShowCreate(false);
      setTitle('');
      setType('maintenance');
      setPriority('normal');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create work order');
    }
    setSubmitting(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Work Orders</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Work Order
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Work Order</h2>

              {formError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{formError}</div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Work order title"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="installation">Installation</option>
                    <option value="repair">Repair</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !title.trim()}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Create Work Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">WO #</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Title</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Priority</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Assigned To</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Scheduled Date</th>
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
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-drydock-steel">No work orders found</td></tr>
              ) : (
                items.map((wo) => (
                  <tr key={wo.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{wo.workOrderNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{wo.title}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel capitalize">{wo.type.replace('_', ' ')}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel capitalize">{wo.priority}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[wo.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {wo.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">
                      {wo.assignedToEmployeeId ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">
                      {wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString() : '—'}
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
