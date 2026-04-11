import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface RollingBucket {
  weekStart: string;
  arInflowCents: number;
  apOutflowCents: number;
  netCents: number;
}

interface ForecastLine {
  weekStart: string;
  inflowCents: number;
  outflowCents: number;
  notes: string | null;
}

interface Scenario {
  id: string;
  name: string;
  scenario: 'base' | 'optimistic' | 'pessimistic';
  windowStart: string;
  isActive: boolean;
  createdAt: string;
  lines?: ForecastLine[];
}

interface BankAccount {
  id: string;
  name: string;
  accountNumber: string | null;
  institution: string | null;
  currency: string;
  isActive: boolean;
}

interface BankBalance {
  id: string;
  bankAccountId: string;
  balanceDate: string;
  balanceCents: number;
}

type ViewMode = 'weekly' | 'monthly';

const SCENARIO_COLORS: Record<string, string> = {
  base: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  optimistic: 'bg-green-900/30 text-green-400 border-green-700/30',
  pessimistic: 'bg-red-900/30 text-red-400 border-red-700/30',
};

function fmtDollars(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return cents < 0 ? `-$${str}` : `$${str}`;
}

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function monthKey(weekStart: string): string {
  return weekStart.slice(0, 7); // YYYY-MM
}

function monthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function CashForecast() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rolling, setRolling] = useState<RollingBucket[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [scenarioLines, setScenarioLines] = useState<ForecastLine[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [latestBalances, setLatestBalances] = useState<Record<string, BankBalance>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [loading, setLoading] = useState(true);

  // Create scenario form
  const [showCreateScenario, setShowCreateScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioType, setNewScenarioType] = useState<'base' | 'optimistic' | 'pessimistic'>('base');
  const [newWindowStart, setNewWindowStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [scenarioSubmitting, setScenarioSubmitting] = useState(false);
  const [scenarioError, setScenarioError] = useState('');

  // Create bank account form
  const [showCreateBank, setShowCreateBank] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBankInstitution, setNewBankInstitution] = useState('');
  const [newBankNumber, setNewBankNumber] = useState('');
  const [bankSubmitting, setBankSubmitting] = useState(false);
  const [bankError, setBankError] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadAll();
  }, [user, navigate]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadRolling(), loadScenarios(), loadBankAccounts()]);
    setLoading(false);
  };

  const loadRolling = async () => {
    try {
      const res = await endpoints.cashForecastRolling() as { data: RollingBucket[] };
      setRolling(res.data);
    } catch { /* */ }
  };

  const loadScenarios = async () => {
    try {
      const res = await endpoints.cashForecastScenarios(1, 50) as { data: Scenario[] };
      setScenarios(res.data);
    } catch { /* */ }
  };

  const loadScenarioLines = async (id: string) => {
    try {
      const res = await endpoints.cashForecastScenario(id) as Scenario;
      setScenarioLines(res.lines ?? []);
    } catch { /* */ }
  };

  const loadBankAccounts = async () => {
    try {
      const res = await endpoints.bankAccounts() as { data: BankAccount[] };
      setBankAccounts(res.data);
      // Load latest balance for each account
      const balanceMap: Record<string, BankBalance> = {};
      await Promise.all(
        res.data.map(async (acct) => {
          try {
            const bRes = await endpoints.bankAccountBalances(acct.id) as { data: BankBalance[] };
            if (bRes.data.length > 0) {
              balanceMap[acct.id] = bRes.data[0]; // ordered desc by date
            }
          } catch { /* */ }
        })
      );
      setLatestBalances(balanceMap);
    } catch { /* */ }
  };

  const handleScenarioSelect = async (id: string) => {
    setSelectedScenarioId(id);
    if (id) await loadScenarioLines(id);
    else setScenarioLines([]);
  };

  const handleCreateScenario = async (e: FormEvent) => {
    e.preventDefault();
    setScenarioSubmitting(true);
    setScenarioError('');
    try {
      const res = await endpoints.createCashForecastScenario({
        name: newScenarioName.trim(),
        scenario: newScenarioType,
        windowStart: newWindowStart,
      }) as Scenario;
      setShowCreateScenario(false);
      setNewScenarioName('');
      setNewScenarioType('base');
      setNewWindowStart(new Date().toISOString().slice(0, 10));
      await loadScenarios();
      setSelectedScenarioId(res.id);
      setScenarioLines([]);
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : 'Failed to create scenario');
    }
    setScenarioSubmitting(false);
  };

  const handleCreateBankAccount = async (e: FormEvent) => {
    e.preventDefault();
    setBankSubmitting(true);
    setBankError('');
    try {
      await endpoints.createBankAccount({
        name: newBankName.trim(),
        institution: newBankInstitution.trim() || undefined,
        accountNumber: newBankNumber.trim() || undefined,
      });
      setShowCreateBank(false);
      setNewBankName('');
      setNewBankInstitution('');
      setNewBankNumber('');
      await loadBankAccounts();
    } catch (err) {
      setBankError(err instanceof Error ? err.message : 'Failed to create bank account');
    }
    setBankSubmitting(false);
  };

  // Build a map of forecast lines by weekStart for variance
  const forecastByWeek = new Map<string, ForecastLine>();
  for (const line of scenarioLines) {
    forecastByWeek.set(line.weekStart, line);
  }

  // Compute total latest balance for running balance starting point
  const totalBalanceCents = Object.values(latestBalances).reduce(
    (sum, b) => sum + b.balanceCents,
    0
  );

  // Build display rows depending on view mode
  type DisplayRow = {
    label: string;
    arInflowCents: number;
    apOutflowCents: number;
    netCents: number;
    forecastInflowCents: number | null;
    varianceCents: number | null;
  };

  let displayRows: DisplayRow[] = [];

  if (viewMode === 'weekly') {
    displayRows = rolling.map((bucket) => {
      const line = forecastByWeek.get(bucket.weekStart) ?? null;
      const forecastInflow = line ? line.inflowCents : null;
      const variance = forecastInflow !== null ? forecastInflow - bucket.arInflowCents : null;
      return {
        label: `Wk ${weekLabel(bucket.weekStart)}`,
        arInflowCents: bucket.arInflowCents,
        apOutflowCents: bucket.apOutflowCents,
        netCents: bucket.netCents,
        forecastInflowCents: forecastInflow,
        varianceCents: variance,
      };
    });
  } else {
    // monthly: group by YYYY-MM
    const monthMap = new Map<string, DisplayRow>();
    for (const bucket of rolling) {
      const mk = monthKey(bucket.weekStart);
      const line = forecastByWeek.get(bucket.weekStart) ?? null;
      const forecastInflow = line ? line.inflowCents : null;
      const existing = monthMap.get(mk);
      if (existing) {
        existing.arInflowCents += bucket.arInflowCents;
        existing.apOutflowCents += bucket.apOutflowCents;
        existing.netCents += bucket.netCents;
        if (forecastInflow !== null) {
          existing.forecastInflowCents = (existing.forecastInflowCents ?? 0) + forecastInflow;
        }
      } else {
        monthMap.set(mk, {
          label: monthLabel(mk),
          arInflowCents: bucket.arInflowCents,
          apOutflowCents: bucket.apOutflowCents,
          netCents: bucket.netCents,
          forecastInflowCents: forecastInflow,
          varianceCents: null,
        });
      }
    }
    // Compute variance per month after aggregation
    displayRows = Array.from(monthMap.values()).map((row) => ({
      ...row,
      varianceCents: row.forecastInflowCents !== null
        ? row.forecastInflowCents - row.arInflowCents
        : null,
    }));
  }

  // Running balance = cumulative net starting from total bank balance
  let runningBalance = totalBalanceCents;
  const rowsWithRunning = displayRows.map((row) => {
    runningBalance += row.netCents;
    return { ...row, runningBalanceCents: runningBalance };
  });

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Cash Forecast</h1>
            <p className="text-drydock-text-dim text-sm mt-1">13-week rolling cash position</p>
          </div>
          <div className="flex gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border border-drydock-border overflow-hidden">
              {(['weekly', 'monthly'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                    viewMode === mode
                      ? 'bg-drydock-accent text-drydock-dark font-medium'
                      : 'text-drydock-steel hover:text-drydock-text'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreateScenario(true)}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md transition-colors"
            >
              + New Scenario
            </button>
          </div>
        </div>

        {/* Scenario selector */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm text-drydock-text-dim whitespace-nowrap">Compare scenario:</label>
          <select
            value={selectedScenarioId}
            onChange={(e) => handleScenarioSelect(e.target.value)}
            className="px-3 py-1.5 bg-drydock-bg border border-drydock-border rounded-md
              text-drydock-text text-sm focus:outline-none focus:border-drydock-accent"
          >
            <option value="">— None —</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.scenario})
              </option>
            ))}
          </select>
          {selectedScenarioId && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              SCENARIO_COLORS[scenarios.find((s) => s.id === selectedScenarioId)?.scenario ?? ''] ?? ''
            }`}>
              {scenarios.find((s) => s.id === selectedScenarioId)?.scenario}
            </span>
          )}
        </div>

        {/* Rolling forecast table */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Period</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">AR Inflows</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">AP Outflows</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Net</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Running Balance</th>
                {selectedScenarioId && (
                  <>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Forecast Inflow</th>
                    <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Variance</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 13 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: selectedScenarioId ? 7 : 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-20 ml-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rowsWithRunning.length === 0 ? (
                <tr>
                  <td colSpan={selectedScenarioId ? 7 : 5} className="px-5 py-8 text-center text-drydock-steel">
                    No data available
                  </td>
                </tr>
              ) : (
                rowsWithRunning.map((row, i) => (
                  <tr key={i} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm text-drydock-text font-medium">{row.label}</td>
                    <td className="px-5 py-3 text-sm font-mono text-green-400 text-right">
                      {fmtDollars(row.arInflowCents)}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-red-400 text-right">
                      {fmtDollars(row.apOutflowCents)}
                    </td>
                    <td className={`px-5 py-3 text-sm font-mono text-right ${row.netCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtDollars(row.netCents)}
                    </td>
                    <td className={`px-5 py-3 text-sm font-mono text-right ${row.runningBalanceCents >= 0 ? 'text-drydock-accent' : 'text-red-400'}`}>
                      {fmtDollars(row.runningBalanceCents)}
                    </td>
                    {selectedScenarioId && (
                      <>
                        <td className="px-5 py-3 text-sm font-mono text-drydock-steel text-right">
                          {row.forecastInflowCents !== null ? fmtDollars(row.forecastInflowCents) : '—'}
                        </td>
                        <td className={`px-5 py-3 text-sm font-mono text-right ${
                          row.varianceCents === null ? 'text-drydock-steel' :
                          row.varianceCents >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {row.varianceCents !== null ? fmtDollars(row.varianceCents) : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bank Accounts */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-drydock-text">Bank Accounts</h2>
          <button
            onClick={() => setShowCreateBank(true)}
            className="px-3 py-1.5 text-sm bg-drydock-card hover:bg-drydock-bg border border-drydock-border
              text-drydock-steel hover:text-drydock-text rounded-md transition-colors"
          >
            + Add Account
          </button>
        </div>
        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Account</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Institution</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Currency</th>
                <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Latest Balance</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">As Of</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-drydock-steel text-sm">
                    No bank accounts — add one to seed the running balance
                  </td>
                </tr>
              ) : (
                bankAccounts.map((acct) => {
                  const bal = latestBalances[acct.id];
                  return (
                    <tr key={acct.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                      <td className="px-5 py-3 text-sm text-drydock-text font-medium">
                        {acct.name}
                        {acct.accountNumber && (
                          <span className="ml-2 text-xs text-drydock-steel">···{acct.accountNumber.slice(-4)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{acct.institution ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">{acct.currency}</td>
                      <td className={`px-5 py-3 text-sm font-mono text-right ${bal ? (bal.balanceCents >= 0 ? 'text-green-400' : 'text-red-400') : 'text-drydock-steel'}`}>
                        {bal ? fmtDollars(bal.balanceCents) : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-drydock-steel">
                        {bal ? new Date(bal.balanceDate + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
              {bankAccounts.length > 0 && (
                <tr className="bg-drydock-bg/30">
                  <td colSpan={3} className="px-5 py-3 text-sm text-drydock-text-dim font-medium">Total</td>
                  <td className={`px-5 py-3 text-sm font-mono text-right font-medium ${totalBalanceCents >= 0 ? 'text-drydock-accent' : 'text-red-400'}`}>
                    {fmtDollars(totalBalanceCents)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Create Scenario Modal */}
        {showCreateScenario && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateScenario(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">New Forecast Scenario</h2>
              {scenarioError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{scenarioError}</div>
              )}
              <form onSubmit={handleCreateScenario} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
                  <input
                    type="text"
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="e.g. Q2 2026 Base"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Scenario</label>
                  <select
                    value={newScenarioType}
                    onChange={(e) => setNewScenarioType(e.target.value as 'base' | 'optimistic' | 'pessimistic')}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent"
                  >
                    <option value="base">Base</option>
                    <option value="optimistic">Optimistic</option>
                    <option value="pessimistic">Pessimistic</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Window Start</label>
                  <input
                    type="date"
                    value={newWindowStart}
                    onChange={(e) => setNewWindowStart(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text focus:outline-none focus:border-drydock-accent"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateScenario(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={scenarioSubmitting || !newScenarioName.trim()}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {scenarioSubmitting ? 'Creating...' : 'Create Scenario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Bank Account Modal */}
        {showCreateBank && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreateBank(false)} />
            <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-lg font-medium text-drydock-text mb-4">Add Bank Account</h2>
              {bankError && (
                <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{bankError}</div>
              )}
              <form onSubmit={handleCreateBankAccount} className="space-y-4">
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Account Name</label>
                  <input
                    type="text"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="e.g. Operating Checking"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Institution</label>
                  <input
                    type="text"
                    value={newBankInstitution}
                    onChange={(e) => setNewBankInstitution(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="e.g. Chase"
                  />
                </div>
                <div>
                  <label className="block text-sm text-drydock-text-dim mb-1">Account Number (last 4 displayed)</label>
                  <input
                    type="text"
                    value={newBankNumber}
                    onChange={(e) => setNewBankNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                      text-drydock-text placeholder-drydock-steel
                      focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                    placeholder="Optional"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateBank(false)}
                    className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                      hover:text-drydock-text hover:border-drydock-steel transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bankSubmitting || !newBankName.trim()}
                    className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                      text-drydock-dark font-medium rounded-md
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {bankSubmitting ? 'Adding...' : 'Add Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
