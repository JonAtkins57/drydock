import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints } from '../lib/api';
import Sidebar from '../components/Sidebar';
import CreateCustomerModal from '../components/CreateCustomerModal';
import RecordDrawer from '../components/RecordDrawer';

interface Customer {
  id: string;
  name: string;
  customerNumber: string;
  status: string;
  currency: string;
  createdAt: string;
}

const CUSTOMER_FIELDS = [
  { key: 'customerNumber', label: 'Customer #', readOnly: true },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', type: 'select' as const, options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'prospect', label: 'Prospect' },
  ]},
  { key: 'currency', label: 'Currency' },
  { key: 'creditLimit', label: 'Credit Limit', type: 'number' as const },
  { key: 'paymentTermsId', label: 'Payment Terms ID' },
  { key: 'billingAddress', label: 'Billing Address', type: 'textarea' as const },
  { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea' as const },
  { key: 'createdAt', label: 'Created', readOnly: true },
];

export default function Customers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadCustomers();
  }, [user, navigate]);

  const loadCustomers = async () => {
    try {
      const res = await endpoints.customers(1, 100);
      setCustomers(res.data as Customer[]);
      setTotal(res.meta.total);
    } catch { /* */ }
    setLoading(false);
  };

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.customerNumber.toLowerCase().includes(q);
  });

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">Customers</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{total} total</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="search"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 text-sm bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder:text-drydock-steel focus:outline-none focus:border-drydock-accent w-52"
            />
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md transition-colors"
            >
              + New Customer
            </button>
          </div>
        </div>

        <CreateCustomerModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={loadCustomers}
        />

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
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">
                    {search ? 'No customers match your search' : 'No customers found'}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{c.customerNumber}</td>
                    <td className="px-5 py-3 text-sm text-drydock-text font-medium">{c.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === 'active'
                          ? 'bg-green-900/30 text-green-400 border border-green-700/30'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-drydock-text-dim">{c.currency}</td>
                    <td className="px-5 py-3 text-sm text-drydock-steel">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <RecordDrawer
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        entityPath="/customers"
        recordId={selectedId}
        fields={CUSTOMER_FIELDS}
        title="Customer"
        onSaved={loadCustomers}
      />
    </div>
  );
}
