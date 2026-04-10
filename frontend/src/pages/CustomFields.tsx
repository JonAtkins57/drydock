import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface FieldDefinition {
  id: string;
  entityType: string;
  fieldKey: string;
  displayName: string;
  dataType: string;
  isRequired: boolean;
  helpText: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ListResponse {
  data: FieldDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

const DATA_TYPES = ['text', 'numeric', 'currency', 'date', 'boolean', 'single_select'];
const ENTITY_TYPES = ['customer', 'vendor', 'employee', 'item', 'project', 'contact', 'lead', 'opportunity'];

export default function CustomFields() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadFields();
  }, [user, navigate]);

  const loadFields = async () => {
    try {
      const res = await api<ListResponse>('/custom-fields?pageSize=100');
      setFields(res.data);
    } catch { /* */ }
    setLoading(false);
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api(`/custom-fields/${id}`, { method: 'DELETE' });
      loadFields();
    } catch { /* */ }
  };

  if (!user) return null;

  // Group fields by entity type
  const grouped = fields.reduce<Record<string, FieldDefinition[]>>((acc, f) => {
    const key = f.entityType;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(f);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Custom Fields</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{fields.length} definitions</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
              text-drydock-dark font-medium rounded-md transition-colors"
          >
            + New Field
          </button>
        </div>

        {showCreate && (
          <CreateFieldModal onClose={() => setShowCreate(false)} onCreated={loadFields} />
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-drydock-card border border-drydock-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-drydock-steel">No custom fields defined yet</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([entityType, defs]) => (
              <div key={entityType}>
                <h2 className="text-sm font-medium text-drydock-accent uppercase tracking-wider mb-3">
                  {entityType}
                </h2>
                <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-drydock-border">
                        <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Field Key</th>
                        <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Display Name</th>
                        <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
                        <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Required</th>
                        <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {defs.map((f) => (
                        <tr key={f.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                          <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{f.fieldKey}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text">{f.displayName}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text-dim">{f.dataType}</td>
                          <td className="px-5 py-3 text-sm text-drydock-text-dim">{f.isRequired ? 'Yes' : 'No'}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              f.isActive
                                ? 'bg-green-900/30 text-green-400 border border-green-700/30'
                                : 'bg-gray-800 text-gray-400 border border-gray-700'
                            }`}>
                              {f.isActive ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {f.isActive && (
                              <button
                                onClick={() => handleDeactivate(f.id)}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              >
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CreateFieldModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [entityType, setEntityType] = useState('customer');
  const [fieldKey, setFieldKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dataType, setDataType] = useState('text');
  const [isRequired, setIsRequired] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/custom-fields', {
        method: 'POST',
        body: {
          entityType,
          fieldKey,
          displayName,
          dataType,
          isRequired,
          helpText: helpText || undefined,
        },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create field');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New Custom Field</h2>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text focus:outline-none focus:border-drydock-accent"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Field Key</label>
            <input
              type="text"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder-drydock-steel
                focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="e.g. custom_field_name"
            />
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder-drydock-steel
                focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Friendly name"
            />
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Data Type</label>
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text focus:outline-none focus:border-drydock-accent"
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isRequired"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="w-4 h-4 rounded border-drydock-border bg-drydock-bg text-drydock-accent
                focus:ring-drydock-accent/30"
            />
            <label htmlFor="isRequired" className="text-sm text-drydock-text-dim">Required</label>
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Help Text</label>
            <input
              type="text"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder-drydock-steel
                focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Optional help text"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                hover:text-drydock-text hover:border-drydock-steel transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !fieldKey.trim() || !displayName.trim()}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
