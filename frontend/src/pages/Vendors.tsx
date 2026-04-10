import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';

interface Vendor {
  id: string;
  name: string;
  vendorNumber: string;
  status: string;
  currency: string;
  createdAt: string;
}

export default function Vendors() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    load();
  }, [user, navigate]);

  const load = async () => {
    try {
      const res = await endpoints.vendors(1, 50);
      setVendors(res.data as Vendor[]);
      setTotal((res.meta as { total: number }).total);
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
            <h1 className="text-2xl font-medium text-drydock-text">Vendors</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
        </div>

        <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-drydock-border">
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Currency</th>
                <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-drydock-border/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-5 py-3"><div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : vendors.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">No vendors found</td></tr>
              ) : (
                vendors.map((v) => (
                  <tr key={v.id} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{v.vendorNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text">{v.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        v.status === 'active'
                          ? 'bg-green-900/30 text-green-400 border border-green-700/30'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}>{v.status}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{v.currency}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(v.createdAt).toLocaleDateString()}</td>
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
