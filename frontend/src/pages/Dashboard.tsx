import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Stats {
  customers: number;
  vendors: number;
  accounts: number;
  periods: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ customers: 0, vendors: 0, accounts: 0, periods: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadStats();
  }, [user, navigate]);

  const loadStats = async () => {
    try {
      const [custRes, vendRes, acctRes, periodRes] = await Promise.all([
        endpoints.customers(1, 1),
        endpoints.vendors(1, 1),
        endpoints.accounts(),
        endpoints.periods(),
      ]);
      setStats({
        customers: custRes.meta.total,
        vendors: (vendRes.meta as { total: number }).total,
        accounts: acctRes.data.length,
        periods: (periodRes as unknown[]).length,
      });
    } catch {
      // silently fail stats
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">
              Welcome, {user.firstName}
            </h1>
            <p className="text-drydock-text-dim text-sm mt-1">
              Tenant: {user.tenantId.slice(0, 8)}... &middot; {user.email}
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Customers" value={stats.customers} icon="&#9733;" loading={loading} />
          <StatCard title="Vendors" value={stats.vendors} icon="&#9881;" loading={loading} />
          <StatCard title="GL Accounts" value={stats.accounts} icon="&#9878;" loading={loading} />
          <StatCard title="Periods (FY2026)" value={stats.periods} icon="&#128197;" loading={loading} />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <ActionCard
            title="Customers"
            description="Manage customer master data"
            href="/customers"
            onClick={() => navigate('/customers')}
          />
          <ActionCard
            title="Vendors"
            description="Manage vendor master data"
            href="/vendors"
            onClick={() => navigate('/vendors')}
          />
          <ActionCard
            title="Chart of Accounts"
            description="View and manage GL accounts"
            href="/accounts"
            onClick={() => navigate('/accounts')}
          />
        </div>

        {/* System Info */}
        <div className="bg-drydock-card border border-drydock-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-drydock-text-dim uppercase tracking-wider mb-4">System</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-drydock-steel">Version</p>
              <p className="text-drydock-text">0.1.0</p>
            </div>
            <div>
              <p className="text-drydock-steel">Environment</p>
              <p className="text-drydock-text">Development</p>
            </div>
            <div>
              <p className="text-drydock-steel">API Docs</p>
              <a href="/docs" target="_blank" className="text-drydock-accent hover:underline">/docs</a>
            </div>
            <div>
              <p className="text-drydock-steel">Permissions</p>
              <p className="text-drydock-text">{user.permissions.length} granted</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, loading }: { title: string; value: number; icon: string; loading: boolean }) {
  return (
    <div className="bg-drydock-card border border-drydock-border rounded-lg p-5 hover:border-drydock-accent/50 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-drydock-steel uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-3xl font-light text-drydock-text">
        {loading ? (
          <span className="inline-block w-12 h-8 bg-drydock-border/50 rounded animate-pulse" />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

function ActionCard({ title, description, onClick }: { title: string; description: string; href: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-drydock-card border border-drydock-border rounded-lg p-5
        hover:border-drydock-accent transition-colors group"
    >
      <h3 className="text-drydock-text font-medium group-hover:text-drydock-accent transition-colors">
        {title} &rarr;
      </h3>
      <p className="text-drydock-text-dim text-sm mt-1">{description}</p>
    </button>
  );
}
