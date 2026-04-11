import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';

// ── Types ─────────────────────────────────────────────────────────────

type WidgetType =
  | 'revenue'
  | 'open_ar'
  | 'invoice_count'
  | 'open_opportunities'
  | 'pipeline_value'
  | 'posted_journals';

interface Widget {
  id: string;
  type: WidgetType;
  position: { col: number; row: number };
}

interface KpiResult {
  widget: WidgetType;
  label: string;
  value: number;
  unit: 'cents' | 'count';
  drillDownPath: string;
}

interface DashboardLayout {
  id: string;
  name: string;
  widgets: Widget[];
  isDefault: boolean;
  updatedAt: string;
}

// ── Default widget configuration ──────────────────────────────────────

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'revenue', type: 'revenue', position: { col: 0, row: 0 } },
  { id: 'open_ar', type: 'open_ar', position: { col: 1, row: 0 } },
  { id: 'invoice_count', type: 'invoice_count', position: { col: 2, row: 0 } },
  { id: 'open_opportunities', type: 'open_opportunities', position: { col: 0, row: 1 } },
  { id: 'pipeline_value', type: 'pipeline_value', position: { col: 1, row: 1 } },
  { id: 'posted_journals', type: 'posted_journals', position: { col: 2, row: 1 } },
];

// ── Helpers ───────────────────────────────────────────────────────────

function formatValue(value: number, unit: 'cents' | 'count'): string {
  if (unit === 'count') return value.toLocaleString();
  const dollars = value / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfYearIso(): string {
  return new Date().getFullYear() + '-01-01';
}

// ── Sub-components ────────────────────────────────────────────────────

function KpiCard({
  kpi,
  onDrillDown,
}: {
  kpi: KpiResult;
  onDrillDown: (path: string) => void;
}) {
  return (
    <div className="bg-drydock-card border border-drydock-border rounded-lg p-5 flex flex-col gap-3 hover:border-drydock-accent/50 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs text-drydock-steel uppercase tracking-wider">{kpi.label}</span>
      </div>
      <p className="text-2xl font-light text-drydock-text">{formatValue(kpi.value, kpi.unit)}</p>
      <button
        onClick={() => onDrillDown(kpi.drillDownPath)}
        className="text-xs text-drydock-accent hover:underline text-left"
      >
        View details &rarr;
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function KpiDashboards() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [from, setFrom] = useState(firstOfYearIso());
  const [to, setTo] = useState(todayIso());
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(false);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const [layouts, setLayouts] = useState<DashboardLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [activeWidgets, setActiveWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  const loadKpis = useCallback(async () => {
    if (!from || !to) return;
    setLoadingKpis(true);
    setKpiError(null);
    try {
      const res = await api<{ data: KpiResult[]; from: string; to: string }>(
        `/kpis?from=${from}&to=${to}`,
      );
      setKpis(res.data);
    } catch (e) {
      setKpiError(e instanceof Error ? e.message : 'Failed to load KPIs');
    }
    setLoadingKpis(false);
  }, [from, to]);

  const loadLayouts = useCallback(async () => {
    try {
      const res = await api<{ data: DashboardLayout[] }>('/dashboards');
      setLayouts(res.data);
      const def = res.data.find((l) => l.isDefault);
      if (def) {
        setActiveLayoutId(def.id);
        setActiveWidgets(def.widgets);
      }
    } catch {
      // silently ignore — layouts are optional
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadKpis();
      loadLayouts();
    }
  }, [user, loadKpis, loadLayouts]);

  const applyLayout = (layout: DashboardLayout) => {
    setActiveLayoutId(layout.id);
    setActiveWidgets(layout.widgets);
  };

  const saveLayout = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      if (activeLayoutId) {
        await api(`/dashboards/${activeLayoutId}`, {
          method: 'PUT',
          body: { name: saveName.trim(), widgets: activeWidgets },
        });
        setSaveMsg('Layout updated.');
      } else {
        const created = await api<DashboardLayout>('/dashboards', {
          method: 'POST',
          body: { name: saveName.trim(), widgets: activeWidgets, isDefault: layouts.length === 0 },
        });
        setActiveLayoutId(created.id);
        setSaveMsg('Layout saved.');
      }
      await loadLayouts();
    } catch {
      setSaveMsg('Save failed.');
    }
    setSaving(false);
  };

  const deleteLayout = async (id: string) => {
    try {
      await api(`/dashboards/${id}`, { method: 'DELETE' });
      if (activeLayoutId === id) {
        setActiveLayoutId(null);
        setActiveWidgets(DEFAULT_WIDGETS);
      }
      await loadLayouts();
    } catch {
      // ignore
    }
  };

  // Build the ordered widget grid from activeWidgets matched against kpi results
  const kpiMap = new Map<string, KpiResult>(kpis.map((k) => [k.widget, k]));
  const orderedWidgets = [...activeWidgets].sort(
    (a, b) => a.position.row * 10 + a.position.col - (b.position.row * 10 + b.position.col),
  );

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">KPI Dashboards</h1>
            <p className="text-drydock-text-dim text-sm mt-1">
              Operational metrics across GL, AR, and CRM
            </p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="px-4 py-2 text-sm text-drydock-steel border border-drydock-border rounded-md
              hover:text-drydock-text hover:border-drydock-steel transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Date Range Controls */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg p-4 mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-drydock-steel uppercase tracking-wider mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-drydock-bg border border-drydock-border text-drydock-text text-sm rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-drydock-steel uppercase tracking-wider mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-drydock-bg border border-drydock-border text-drydock-text text-sm rounded px-3 py-2"
            />
          </div>
          <button
            onClick={loadKpis}
            disabled={loadingKpis}
            className="px-4 py-2 text-sm bg-drydock-accent text-white rounded hover:bg-drydock-accent/80 disabled:opacity-50 transition-colors"
          >
            {loadingKpis ? 'Loading…' : 'Refresh'}
          </button>
          <div className="text-xs text-drydock-steel">
            Shortcut:{' '}
            <button
              className="text-drydock-accent hover:underline"
              onClick={() => { setFrom(firstOfYearIso()); setTo(todayIso()); }}
            >
              YTD
            </button>
          </div>
        </div>

        {/* KPI Error */}
        {kpiError && (
          <div className="mb-4 p-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg">
            {kpiError}
          </div>
        )}

        {/* KPI Widget Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {orderedWidgets.map((w) => {
            const kpi = kpiMap.get(w.type);
            if (!kpi) {
              return (
                <div key={w.id} className="bg-drydock-card border border-drydock-border rounded-lg p-5 flex items-center justify-center">
                  {loadingKpis ? (
                    <div className="w-full h-16 bg-drydock-border/30 rounded animate-pulse" />
                  ) : (
                    <span className="text-drydock-steel text-sm">{w.type}</span>
                  )}
                </div>
              );
            }
            return (
              <KpiCard
                key={w.id}
                kpi={kpi}
                onDrillDown={(path) => navigate(path)}
              />
            );
          })}
        </div>

        {/* Saved Layouts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Layout List */}
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-drydock-text-dim uppercase tracking-wider mb-4">
              Saved Layouts
            </h2>
            {layouts.length === 0 && (
              <p className="text-drydock-steel text-sm">No saved layouts yet.</p>
            )}
            <ul className="space-y-2">
              {layouts.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => { applyLayout(l); setSaveName(l.name); }}
                    className={`text-sm text-left flex-1 truncate ${
                      activeLayoutId === l.id
                        ? 'text-drydock-accent'
                        : 'text-drydock-text-dim hover:text-drydock-text'
                    }`}
                  >
                    {l.name}
                    {l.isDefault && (
                      <span className="ml-2 text-[10px] text-drydock-steel uppercase">(default)</span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteLayout(l.id)}
                    className="text-xs text-drydock-steel hover:text-red-400 transition-colors"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Save Layout */}
          <div className="bg-drydock-card border border-drydock-border rounded-lg p-5 lg:col-span-2">
            <h2 className="text-sm font-medium text-drydock-text-dim uppercase tracking-wider mb-4">
              Save Current Layout
            </h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-drydock-steel mb-1">Layout Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Executive Summary"
                  className="w-full bg-drydock-bg border border-drydock-border text-drydock-text text-sm rounded px-3 py-2 placeholder-drydock-steel"
                />
              </div>
              <button
                onClick={saveLayout}
                disabled={saving || !saveName.trim()}
                className="px-4 py-2 text-sm bg-drydock-accent text-white rounded hover:bg-drydock-accent/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : activeLayoutId ? 'Update' : 'Save'}
              </button>
            </div>
            {saveMsg && (
              <p className="mt-2 text-xs text-drydock-steel">{saveMsg}</p>
            )}
            <p className="mt-3 text-xs text-drydock-steel">
              Current layout: {activeWidgets.length} widget(s).{' '}
              {activeLayoutId ? `Editing layout ID ${activeLayoutId.slice(0, 8)}…` : 'Unsaved.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
