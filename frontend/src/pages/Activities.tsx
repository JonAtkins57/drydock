import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Activity {
  id: string;
  type: string; // task, note, meeting, call, email
  subject: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  dueDate?: string;
  completedAt?: string;
  status?: string;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  task: '\u2611',        // ballot box with check
  note: '\uD83D\uDCC4', // page facing up
  meeting: '\uD83D\uDCC5', // calendar
  call: '\uD83D\uDCDE', // telephone receiver
  email: '\u2709',       // envelope
};

const TYPE_OPTIONS = ['task', 'note', 'meeting', 'call', 'email'] as const;

function groupByDate(activities: Activity[]): Record<string, Activity[]> {
  const groups: Record<string, Activity[]> = {};
  for (const a of activities) {
    const dateKey = new Date(a.createdAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(a);
  }
  return groups;
}

function CreateActivityModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<string>('task');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await endpoints.createActivity({
        type,
        subject,
        description: description || undefined,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        dueDate: dueDate || undefined,
      });
      setType('task'); setSubject(''); setDescription('');
      setEntityType(''); setEntityId(''); setDueDate('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create activity');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New Activity</h2>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent">
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Subject</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Activity subject" />
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30 resize-none"
              placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Entity Type</label>
              <input type="text" value={entityType} onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                placeholder="e.g. lead" />
            </div>
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Entity ID</label>
              <input type="text" value={entityId} onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text placeholder-drydock-steel focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                placeholder="UUID" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md hover:text-drydock-text hover:border-drydock-steel transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !subject.trim()}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Creating...' : 'Create Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Activities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [myOnly, setMyOnly] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadActivities();
  }, [user, navigate, myOnly]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const fetcher = myOnly ? endpoints.myActivities : endpoints.activities;
      const res = await fetcher(1, 50);
      setActivities(res.data as Activity[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const handleComplete = async (id: string) => {
    try {
      await endpoints.completeActivity(id);
      loadActivities();
    } catch { /* */ }
  };

  if (!user) return null;

  const grouped = groupByDate(activities);

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Activities</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMyOnly(!myOnly)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                myOnly
                  ? 'bg-drydock-accent text-drydock-dark border-drydock-accent font-medium'
                  : 'text-drydock-steel border-drydock-border hover:text-drydock-text hover:border-drydock-steel'
              }`}>
              My Activities
            </button>
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md transition-colors">
              + New Activity
            </button>
          </div>
        </div>

        <CreateActivityModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={loadActivities} />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-drydock-card border border-drydock-border rounded-lg p-4">
                <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-48 mb-3" />
                <div className="h-3 bg-drydock-border/30 rounded animate-pulse w-64" />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-8 text-center text-drydock-steel">
            No activities found
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, items]) => (
              <div key={date}>
                <h3 className="text-xs text-drydock-steel uppercase tracking-wider font-medium mb-3 px-1">{date}</h3>
                <div className="space-y-2">
                  {items.map((a) => {
                    const isCompleted = !!(a.completedAt || a.status === 'completed');
                    return (
                      <div key={a.id}
                        className={`bg-drydock-card border border-drydock-border rounded-lg p-4 flex items-start gap-4 transition-colors hover:border-drydock-steel/50 ${
                          isCompleted ? 'opacity-60' : ''
                        }`}>
                        {/* Type icon */}
                        <span className="text-lg w-7 text-center flex-shrink-0 mt-0.5" title={a.type}>
                          {TYPE_ICONS[a.type] ?? '\u25CF'}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm text-drydock-text font-medium ${isCompleted ? 'line-through' : ''}`}>
                            {a.subject}
                          </p>
                          {a.description && (
                            <p className={`text-xs text-drydock-text-dim mt-1 line-clamp-2 ${isCompleted ? 'line-through' : ''}`}>
                              {a.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] text-drydock-steel uppercase tracking-wider px-1.5 py-0.5 bg-drydock-bg rounded">
                              {a.type}
                            </span>
                            {a.entityType && (
                              <span className="text-xs text-drydock-text-dim">
                                {a.entityType}{a.entityId ? ` #${a.entityId.slice(0, 8)}` : ''}
                              </span>
                            )}
                            {a.dueDate && (
                              <span className={`text-xs ${
                                !isCompleted && new Date(a.dueDate) < new Date()
                                  ? 'text-red-400'
                                  : 'text-drydock-steel'
                              }`}>
                                Due {new Date(a.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {!isCompleted && (
                          <button onClick={() => handleComplete(a.id)}
                            className="flex-shrink-0 text-xs px-2 py-1 rounded bg-green-900/30 text-green-400 border border-green-700/30 hover:bg-green-900/50 transition-colors"
                            title="Mark complete">
                            Complete
                          </button>
                        )}
                        {isCompleted && (
                          <span className="flex-shrink-0 text-xs text-green-500">Done</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
