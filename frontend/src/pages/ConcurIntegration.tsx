import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface ConnectResult {
  ok: boolean;
  configId: string;
}

interface ExpenseMapping {
  id: string;
  expenseTypeCode: string;
  expenseTypeName: string | null;
  debitAccountId: string;
  creditAccountId: string | null;
  isActive: boolean;
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

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-900/30 text-green-400 border border-green-700/30',
  completed_with_errors: 'bg-yellow-900/30 text-yellow-400 border border-yellow-700/30',
  running: 'bg-blue-900/30 text-blue-400 border border-blue-700/30',
  failed: 'bg-red-900/30 text-red-400 border border-red-700/30',
};

export default function ConcurIntegration() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Connect form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [configName, setConfigName] = useState('');
  const [clearingAccountId, setClearingAccountId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connected, setConnected] = useState<ConnectResult | null>(null);

  // Config ID for subsequent operations
  const [configId, setConfigId] = useState('');

  // Test
  const [testResult, setTestResult] = useState<{ ok: boolean; company?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  // Expense mappings
  const [expenseMappings, setExpenseMappings] = useState<ExpenseMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [mappingEdits, setMappingEdits] = useState<Array<{
    expenseTypeCode: string;
    expenseTypeName: string;
    debitAccountId: string;
    creditAccountId: string;
  }>>([]);
  const [savingMappings, setSavingMappings] = useState(false);

  // Sync logs
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Disconnect
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
  }, [user, navigate]);

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const result = await endpoints.concurConnect({ clientId, clientSecret, baseUrl, configName, clearingAccountId }) as ConnectResult;
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
      const result = await endpoints.concurTest(configId) as { ok: boolean; company?: string };
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!configId) return;
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await endpoints.concurSync(configId) as { recordsProcessed: number; recordsFailed: number };
      setSyncResult(`Done: ${result.recordsProcessed} processed, ${result.recordsFailed} failed`);
      await loadSyncLogs();
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const loadExpenseMappings = async () => {
    if (!configId) return;
    setLoadingMappings(true);
    try {
      const result = await endpoints.concurExpenseMappings(configId) as { data: ExpenseMapping[] };
      setExpenseMappings(result.data ?? []);
      setMappingEdits(
        (result.data ?? []).map((m) => ({
          expenseTypeCode: m.expenseTypeCode,
          expenseTypeName: m.expenseTypeName ?? '',
          debitAccountId: m.debitAccountId,
          creditAccountId: m.creditAccountId ?? '',
        }))
      );
    } catch {
      // ignore
    } finally {
      setLoadingMappings(false);
    }
  };

  const loadSyncLogs = async () => {
    if (!configId) return;
    setLoadingLogs(true);
    try {
      const result = await endpoints.concurSyncLogs(configId) as { data: SyncLog[] };
      setSyncLogs(result.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSaveMappings = async () => {
    if (!configId) return;
    setSavingMappings(true);
    try {
      const payload = mappingEdits
        .filter((m) => m.expenseTypeCode.trim() && m.debitAccountId.trim())
        .map((m) => ({
          expenseTypeCode: m.expenseTypeCode.trim(),
          expenseTypeName: m.expenseTypeName.trim() || undefined,
          debitAccountId: m.debitAccountId.trim(),
          creditAccountId: m.creditAccountId.trim() || undefined,
        }));
      await endpoints.concurSetExpenseMappings(configId, payload);
      await loadExpenseMappings();
    } catch {
      // ignore
    } finally {
      setSavingMappings(false);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!configId) return;
    try {
      await endpoints.concurDeleteExpenseMapping(configId, mappingId);
      await loadExpenseMappings();
    } catch {
      // ignore
    }
  };

  const handleDisconnect = async () => {
    if (!configId || !confirm('Disconnect Concur integration? This will remove stored credentials.')) return;
    setDisconnecting(true);
    try {
      await endpoints.concurDisconnect(configId);
      setConnected(null);
      setConfigId('');
      setExpenseMappings([]);
      setSyncLogs([]);
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  };

  const addMappingRow = () => {
    setMappingEdits((prev) => [...prev, { expenseTypeCode: '', expenseTypeName: '', debitAccountId: '', creditAccountId: '' }]);
  };

  useEffect(() => {
    if (configId) {
      loadExpenseMappings();
      loadSyncLogs();
    }
  }, [configId]);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-2xl font-bold text-white">SAP Concur Expense Integration</h1>

          {/* Connect Form */}
          <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-lg font-semibold text-white mb-4">Connect to Concur</h2>
            {connected ? (
              <div className="bg-green-900/30 border border-green-700/30 rounded p-4 space-y-2">
                <p className="text-green-400 font-medium">Connected successfully</p>
                <p className="text-gray-300 text-sm">Config ID: <span className="font-mono text-xs">{connected.configId}</span></p>
              </div>
            ) : (
              <form onSubmit={handleConnect} className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Client ID</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="Concur OAuth client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Client Secret</label>
                  <input
                    type="password"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="Concur OAuth client secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="https://us.api.concursolutions.com"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm text-gray-400 mb-1">Config Name</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                    placeholder="My Concur Integration"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Clearing Account ID (UUID)</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono"
                    placeholder="GL account UUID for expense clearing"
                    value={clearingAccountId}
                    onChange={(e) => setClearingAccountId(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">GL account used as the clearing/payable account for imported expense journal entries.</p>
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
                  ? <p className="text-green-400 text-sm">OK{testResult.company ? ` — ${testResult.company}` : ''}</p>
                  : <p className="text-red-400 text-sm">{testResult.error}</p>
              )}
            </section>
          )}

          {/* Sync */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-4">Sync Expense Reports</h2>
              <p className="text-sm text-gray-400 mb-4">
                Fetches approved Concur expense reports and creates draft GL journal entries using the expense-type mappings below.
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
                {syncResult && <p className="text-sm text-gray-400">{syncResult}</p>}
              </div>
            </section>
          )}

          {/* Expense Type → GL Account Mappings */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Expense Type Mappings</h2>
                <div className="flex gap-2">
                  <button
                    onClick={loadExpenseMappings}
                    disabled={loadingMappings}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                  >
                    {loadingMappings ? 'Loading...' : 'Refresh'}
                  </button>
                  <button
                    onClick={addMappingRow}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm"
                  >
                    + Add Row
                  </button>
                  <button
                    onClick={handleSaveMappings}
                    disabled={savingMappings}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                  >
                    {savingMappings ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Maps Concur expense type codes to GL debit accounts. The clearing account set during connect is used as the credit (AP/payable) side.
              </p>
              {mappingEdits.length === 0 ? (
                <p className="text-gray-500 text-sm">No mappings configured. Click "+ Add Row" to create one.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2 pr-3">Expense Type Code</th>
                      <th className="pb-2 pr-3">Display Name</th>
                      <th className="pb-2 pr-3">Debit Account UUID</th>
                      <th className="pb-2 pr-3">Credit Account UUID</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {mappingEdits.map((row, idx) => {
                      const saved = expenseMappings[idx];
                      return (
                        <tr key={idx}>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono"
                              value={row.expenseTypeCode}
                              onChange={(e) => setMappingEdits((prev) => prev.map((r, i) => i === idx ? { ...r, expenseTypeCode: e.target.value } : r))}
                              placeholder="MEALS"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                              value={row.expenseTypeName}
                              onChange={(e) => setMappingEdits((prev) => prev.map((r, i) => i === idx ? { ...r, expenseTypeName: e.target.value } : r))}
                              placeholder="Meals & Entertainment"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono"
                              value={row.debitAccountId}
                              onChange={(e) => setMappingEdits((prev) => prev.map((r, i) => i === idx ? { ...r, debitAccountId: e.target.value } : r))}
                              placeholder="GL account UUID"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono"
                              value={row.creditAccountId}
                              onChange={(e) => setMappingEdits((prev) => prev.map((r, i) => i === idx ? { ...r, creditAccountId: e.target.value } : r))}
                              placeholder="Override credit (optional)"
                            />
                          </td>
                          <td className="py-2">
                            {saved?.id && (
                              <button
                                onClick={() => handleDeleteMapping(saved.id)}
                                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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

          {/* Disconnect */}
          {configId && (
            <section className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-3">Danger Zone</h2>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Concur'}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
