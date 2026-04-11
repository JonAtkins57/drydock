import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface JiraConnectResult {
  ok: boolean;
  configId: string;
  webhookSecret: string;
}

interface SyncLog {
  id: string;
  syncType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number | null;
  recordsFailed: number | null;
}

interface StatusMapping {
  jiraStatusId: string;
  jiraStatusName: string;
  projectKey: string;
  workOrderMapping: { id: string; drydockStatus: string } | null;
  projectMapping: { id: string; drydockStatus: string } | null;
}

interface FieldMapping {
  id: string;
  sourceField: string;
  targetEntity: string;
  targetField: string;
  transformRule: string | null;
  isActive: boolean;
}

const WORK_ORDER_STATUSES = ['open', 'assigned', 'in_progress', 'completed', 'invoiced'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-900/30 text-green-400 border border-green-700/30',
  completed_with_errors: 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/30',
  running: 'bg-blue-900/30 text-blue-400 border border-blue-700/30',
  failed: 'bg-red-900/30 text-red-400 border border-red-700/30',
};

export default function JiraIntegration() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Connect form
  const [host, setHost] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [configName, setConfigName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connected, setConnected] = useState<JiraConnectResult | null>(null);

  // Config ID for subsequent operations
  const [configId, setConfigId] = useState('');

  // Test connection
  const [testResult, setTestResult] = useState<{ ok: boolean; accountId?: string; displayName?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncResults, setSyncResults] = useState<Record<string, string>>({});

  // Sync logs
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Status mappings
  const [statusMappings, setStatusMappings] = useState<StatusMapping[]>([]);
  const [loadingStatusMappings, setLoadingStatusMappings] = useState(false);
  const [statusMappingEdits, setStatusMappingEdits] = useState<Record<string, { workOrder: string; project: string }>>({});
  const [savingStatusMappings, setSavingStatusMappings] = useState(false);

  // Field mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [loadingFieldMappings, setLoadingFieldMappings] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
  }, [user, navigate]);

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const result = await endpoints.jiraConnect({ host, email, apiToken, configName }) as JiraConnectResult;
      setConnected(result);
      setConfigId(result.configId);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleTest = async () => {
    if (!configId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await endpoints.jiraTest(configId) as { ok: boolean; accountId: string; displayName: string };
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (type: 'projects' | 'issues' | 'worklogs') => {
    if (!configId) return;
    setSyncing((s) => ({ ...s, [type]: true }));
    setSyncResults((r) => ({ ...r, [type]: '' }));
    try {
      const result = await endpoints.jiraSync(configId, type) as { recordsProcessed: number; recordsFailed: number };
      setSyncResults((r) => ({ ...r, [type]: `Done: ${result.recordsProcessed} processed, ${result.recordsFailed} failed` }));
      if (type === 'projects' || type === 'issues') {
        await loadStatusMappings();
      }
      await loadSyncLogs();
    } catch (err) {
      setSyncResults((r) => ({ ...r, [type]: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setSyncing((s) => ({ ...s, [type]: false }));
    }
  };

  const loadSyncLogs = async () => {
    if (!configId) return;
    setLoadingLogs(true);
    try {
      const result = await endpoints.jiraSyncLogs(configId) as { data: SyncLog[] };
      setSyncLogs(result.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadStatusMappings = async () => {
    if (!configId) return;
    setLoadingStatusMappings(true);
    try {
      const result = await endpoints.jiraStatusMappings(configId) as { data: StatusMapping[] };
      setStatusMappings(result.data ?? []);
      const edits: Record<string, { workOrder: string; project: string }> = {};
      for (const m of result.data ?? []) {
        edits[m.jiraStatusName] = {
          workOrder: m.workOrderMapping?.drydockStatus ?? '',
          project: m.projectMapping?.drydockStatus ?? '',
        };
      }
      setStatusMappingEdits(edits);
    } catch {
      // ignore
    } finally {
      setLoadingStatusMappings(false);
    }
  };

  const loadFieldMappings = async () => {
    if (!configId) return;
    setLoadingFieldMappings(true);
    try {
      const result = await endpoints.jiraFieldMappings(configId) as { data: FieldMapping[] };
      setFieldMappings(result.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingFieldMappings(false);
    }
  };

  const handleSaveStatusMappings = async () => {
    if (!configId) return;
    setSavingStatusMappings(true);
    try {
      const payload: Array<{ jiraStatus: string; drydockStatus: string; entityType: 'work_order' | 'project' }> = [];
      for (const [jiraStatus, vals] of Object.entries(statusMappingEdits)) {
        if (vals.workOrder) payload.push({ jiraStatus, drydockStatus: vals.workOrder, entityType: 'work_order' });
        if (vals.project) payload.push({ jiraStatus, drydockStatus: vals.project, entityType: 'project' });
      }
      await endpoints.jiraSetStatusMappings(configId, payload);
      await loadStatusMappings();
    } catch {
      // ignore
    } finally {
      setSavingStatusMappings(false);
    }
  };

  useEffect(() => {
    if (configId) {
      loadSyncLogs();
      loadStatusMappings();
      loadFieldMappings();
    }
  }, [configId]);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-2xl font-bold text-white">JIRA Cloud Integration</h1>

          {/* Connect Form */}
          <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-lg font-semibold text-white mb-4">Connect to JIRA Cloud</h2>
            {connected ? (
              <div className="bg-green-900/30 border border-green-700/30 rounded p-4 space-y-2">
                <p className="text-green-400 font-medium">Connected successfully</p>
                <p className="text-gray-300 text-sm">Config ID: <span className="font-mono text-xs">{connected.configId}</span></p>
                <p className="text-gray-300 text-sm">
                  Webhook Secret: <span className="font-mono text-xs bg-gray-800 px-1 py-0.5 rounded">{connected.webhookSecret}</span>
                  <span className="text-yellow-400 text-xs ml-2">(shown once only — save it now)</span>
                </p>
              </div>
            ) : (
              <form onSubmit={handleConnect} className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">JIRA Host</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="yourcompany.atlassian.net"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Config Name</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="My JIRA Integration"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">API Token</label>
                  <input
                    type="password"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="JIRA API token"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    required
                  />
                </div>
                {connectError && (
                  <p className="col-span-2 text-red-400 text-sm">{connectError}</p>
                )}
                <div className="col-span-2">
                  <button
                    type="submit"
                    disabled={connecting}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
                  >
                    {connecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Use Existing Config */}
          {!connected && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-4">Use Existing Config</h2>
              <div className="flex gap-3">
                <input
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono"
                  placeholder="Config UUID"
                  value={configId}
                  onChange={(e) => setConfigId(e.target.value)}
                />
              </div>
            </section>
          )}

          {/* Test Connection */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">Connection Test</h2>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                >
                  {testing ? 'Testing...' : 'Test'}
                </button>
              </div>
              {testResult && (
                testResult.ok
                  ? <p className="text-green-400 text-sm">OK — {testResult.displayName} ({testResult.accountId})</p>
                  : <p className="text-red-400 text-sm">{testResult.error}</p>
              )}
            </section>
          )}

          {/* Sync Controls */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-4">Sync</h2>
              <div className="grid grid-cols-3 gap-4">
                {(['projects', 'issues', 'worklogs'] as const).map((type) => (
                  <div key={type} className="space-y-2">
                    <button
                      onClick={() => handleSync(type)}
                      disabled={!!syncing[type]}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm font-medium capitalize"
                    >
                      {syncing[type] ? `Syncing ${type}...` : `Sync ${type}`}
                    </button>
                    {syncResults[type] && (
                      <p className="text-xs text-gray-400">{syncResults[type]}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Status Mappings */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Status Mappings</h2>
                <div className="flex gap-2">
                  <button
                    onClick={loadStatusMappings}
                    disabled={loadingStatusMappings}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                  >
                    {loadingStatusMappings ? 'Loading...' : 'Refresh'}
                  </button>
                  <button
                    onClick={handleSaveStatusMappings}
                    disabled={savingStatusMappings}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                  >
                    {savingStatusMappings ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {statusMappings.length === 0 ? (
                <p className="text-gray-500 text-sm">No JIRA statuses found. Run project sync first.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2 pr-4">JIRA Status</th>
                      <th className="pb-2 pr-4">Work Order Status</th>
                      <th className="pb-2">Project Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {statusMappings.map((m) => (
                      <tr key={m.jiraStatusName}>
                        <td className="py-2 pr-4 text-gray-300">{m.jiraStatusName}</td>
                        <td className="py-2 pr-4">
                          <select
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            value={statusMappingEdits[m.jiraStatusName]?.workOrder ?? ''}
                            onChange={(e) => setStatusMappingEdits((prev) => ({
                              ...prev,
                              [m.jiraStatusName]: { ...prev[m.jiraStatusName], workOrder: e.target.value },
                            }))}
                          >
                            <option value="">— none —</option>
                            {WORK_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="py-2">
                          <select
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                            value={statusMappingEdits[m.jiraStatusName]?.project ?? ''}
                            onChange={(e) => setStatusMappingEdits((prev) => ({
                              ...prev,
                              [m.jiraStatusName]: { ...prev[m.jiraStatusName], project: e.target.value },
                            }))}
                          >
                            <option value="">— none —</option>
                            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Field Mappings */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Field Mappings</h2>
                <button
                  onClick={loadFieldMappings}
                  disabled={loadingFieldMappings}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                >
                  {loadingFieldMappings ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {fieldMappings.length === 0 ? (
                <p className="text-gray-500 text-sm">No field mappings configured.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2 pr-4">Source Field</th>
                      <th className="pb-2 pr-4">Target Entity</th>
                      <th className="pb-2 pr-4">Target Field</th>
                      <th className="pb-2">Transform Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {fieldMappings.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 pr-4 text-gray-300 font-mono text-xs">{m.sourceField}</td>
                        <td className="py-2 pr-4 text-gray-300">{m.targetEntity}</td>
                        <td className="py-2 pr-4 text-gray-300 font-mono text-xs">{m.targetField}</td>
                        <td className="py-2 text-gray-500 text-xs">{m.transformRule ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Sync Logs */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Sync Log History</h2>
                <button
                  onClick={loadSyncLogs}
                  disabled={loadingLogs}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                >
                  {loadingLogs ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {syncLogs.length === 0 ? (
                <p className="text-gray-500 text-sm">No sync history yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Started</th>
                      <th className="pb-2 pr-4">Processed</th>
                      <th className="pb-2">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {syncLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 pr-4 text-gray-300 capitalize">{log.syncType}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${STATUS_COLORS[log.status] ?? 'bg-gray-800 text-gray-400'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-400 text-xs">{new Date(log.startedAt).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-gray-300">{log.recordsProcessed ?? 0}</td>
                        <td className="py-2 text-gray-300">{log.recordsFailed ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
