import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Period {
  id: string;
  periodName: string;
  startDate: string;
  endDate: string;
  fiscalYear: number;
  periodNumber: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-900/30 text-green-400 border-green-700/30',
  soft_close: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
  closed: 'bg-red-900/30 text-red-400 border-red-700/30',
  locked: 'bg-gray-800 text-gray-400 border-gray-700',
};

export default function Periods() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.periods();
      setPeriods(res as Period[]);
    } catch { /* */ }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Accounting Periods</h1>
            <p className="text-drydock-text-dim text-sm mt-1">FY2026 &middot; {periods.length} periods</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-drydock-card border border-drydock-border rounded-lg p-5">
                <div className="h-5 bg-drydock-border/30 rounded animate-pulse w-24 mb-3" />
                <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-32" />
              </div>
            ))
          ) : (
            periods.map((p) => {
              const start = new Date(p.startDate);
              const end = new Date(p.endDate);
              const monthName = start.toLocaleString('default', { month: 'long' });
              const isCurrent = new Date() >= start && new Date() <= end;

              return (
                <div
                  key={p.id}
                  className={`bg-drydock-card border rounded-lg p-5 transition-colors ${
                    isCurrent
                      ? 'border-drydock-accent shadow-[0_0_12px_rgba(78,205,196,0.1)]'
                      : 'border-drydock-border hover:border-drydock-steel'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-drydock-text font-medium">{monthName}</h3>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-drydock-accent/20 text-drydock-accent rounded uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-drydock-steel text-xs mb-3">
                    {start.toLocaleDateString()} &mdash; {end.toLocaleDateString()}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-drydock-text-dim text-xs font-mono">{p.periodName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[p.status] ?? STATUS_COLORS.open}`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
