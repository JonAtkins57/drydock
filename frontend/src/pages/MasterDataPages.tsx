import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { endpoints, api } from '../lib/api';
import Sidebar from '../components/Sidebar';
import RecordDrawer, { type FieldDef } from '../components/RecordDrawer';

// ── Shared layout wrapper ──────────────────────────────────────────

function PageShell({ title, count, children, onAdd, search, onSearch }: {
  title: string;
  count: number;
  children: React.ReactNode;
  onAdd?: () => void;
  search?: string;
  onSearch?: (v: string) => void;
}) {
  return (
    <div className="flex min-h-screen bg-drydock-bg">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-medium text-drydock-text">{title}</h1>
            <p className="text-drydock-text-dim text-sm mt-1">{count} total</p>
          </div>
          <div className="flex items-center gap-3">
            {onSearch && (
              <input
                type="search"
                placeholder={`Search ${title.toLowerCase()}…`}
                value={search ?? ''}
                onChange={(e) => onSearch(e.target.value)}
                className="px-3 py-2 text-sm bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder:text-drydock-steel focus:outline-none focus:border-drydock-accent w-48"
              />
            )}
            {onAdd && (
              <button
                onClick={onAdd}
                className="px-4 py-2 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                  text-drydock-dark font-medium rounded-md transition-colors"
              >
                + New
              </button>
            )}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function LoadingSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <tr key={i} className="border-b border-drydock-border/50">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-5 py-3">
              <div className="h-4 bg-drydock-border/30 rounded animate-pulse w-24" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      isActive
        ? 'bg-green-900/30 text-green-400 border border-green-700/30'
        : 'bg-gray-800 text-gray-400 border border-gray-700'
    }`}>
      {status}
    </span>
  );
}

function centsToDisplay(cents: number | null | undefined): string {
  if (cents == null) return '--';
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Modal wrapper ──────────────────────────────────────────────────

function Modal({ title, onClose, error, loading, submitLabel, disabled, children, onSubmit }: {
  title: string;
  onClose: () => void;
  error: string;
  loading: boolean;
  submitLabel: string;
  disabled: boolean;
  children: React.ReactNode;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">{title}</h2>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">{error}</div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
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
              disabled={loading || disabled}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder, required, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-drydock-text-dim mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
          text-drydock-text placeholder-drydock-steel
          focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
        placeholder={placeholder}
      />
    </div>
  );
}

// ── Employees Page ─────────────────────────────────────────────────

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeNumber: string;
  departmentId: string | null;
  status: string;
  hireDate: string | null;
}

const EMPLOYEE_FIELDS: FieldDef[] = [
  { key: 'employeeNumber', label: 'Employee #', readOnly: true },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'terminated', label: 'Terminated' },
  ]},
  { key: 'hireDate', label: 'Hire Date', type: 'date' },
  { key: 'createdAt', label: 'Created', readOnly: true },
];

export function EmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const res = await endpoints.employees(1, 100);
      setRows(res.data as Employee[]);
      setTotal(res.meta?.total ?? res.data.length);
    } catch { /* */ }
    setLoading(false);
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.employeeNumber.toLowerCase().includes(q);
  });

  if (!user) return null;

  return (
    <PageShell title="Employees" count={total} onAdd={() => setShowCreate(true)} search={search} onSearch={setSearch}>
      {showCreate && <CreateEmployeeModal onClose={() => setShowCreate(false)} onCreated={loadData} />}
      <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-drydock-border">
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Email</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Hire Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingSkeleton cols={5} /> : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">{search ? 'No employees match your search' : 'No employees found'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer">
                <td className="px-5 py-3 text-sm text-drydock-text font-medium">{r.firstName} {r.lastName}</td>
                <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.email}</td>
                <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.employeeNumber}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-5 py-3 text-sm text-drydock-steel">{r.hireDate ? new Date(r.hireDate).toLocaleDateString() : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordDrawer open={!!selectedId} onClose={() => setSelectedId(null)} entityPath="/employees"
        recordId={selectedId} fields={EMPLOYEE_FIELDS} title="Employee" onSaved={loadData} />
    </PageShell>
  );
}

function CreateEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/employees', { method: 'POST', body: { firstName, lastName, email } });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
    }
    setLoading(false);
  };

  return (
    <Modal title="New Employee" onClose={onClose} error={error} loading={loading}
      submitLabel="Create Employee" disabled={!firstName.trim() || !lastName.trim() || !email.trim()} onSubmit={handleSubmit}>
      <FormInput label="First Name" value={firstName} onChange={setFirstName} placeholder="First name" required />
      <FormInput label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name" required />
      <FormInput label="Email" value={email} onChange={setEmail} placeholder="email@company.com" required type="email" />
    </Modal>
  );
}

// ── Items Page ─────────────────────────────────────────────────────

interface Item {
  id: string;
  itemNumber: string;
  name: string;
  itemType: string;
  unitOfMeasure: string | null;
  listPrice: number | null;
}

const ITEM_FIELDS: FieldDef[] = [
  { key: 'itemNumber', label: 'Item #', readOnly: true },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'itemType', label: 'Type', type: 'select', options: [
    { value: 'service', label: 'Service' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'non_inventory', label: 'Non-Inventory' },
    { value: 'other', label: 'Other' },
  ]},
  { key: 'unitOfMeasure', label: 'Unit of Measure' },
  { key: 'listPrice', label: 'List Price (cents)', type: 'number' },
  { key: 'standardCost', label: 'Standard Cost (cents)', type: 'number' },
];

export function ItemsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const res = await endpoints.items(1, 100);
      setRows(res.data as Item[]);
      setTotal(res.meta?.total ?? res.data.length);
    } catch { /* */ }
    setLoading(false);
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.itemNumber.toLowerCase().includes(q) || r.itemType.toLowerCase().includes(q);
  });

  if (!user) return null;

  return (
    <PageShell title="Items" count={total} onAdd={() => setShowCreate(true)} search={search} onSearch={setSearch}>
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} onCreated={loadData} />}
      <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-drydock-border">
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Type</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">UoM</th>
              <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">List Price</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingSkeleton cols={5} /> : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-drydock-steel">{search ? 'No items match your search' : 'No items found'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer">
                <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.itemNumber}</td>
                <td className="px-5 py-3 text-sm text-drydock-text font-medium">{r.name}</td>
                <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.itemType}</td>
                <td className="px-5 py-3 text-sm text-drydock-text-dim">{r.unitOfMeasure ?? '--'}</td>
                <td className="px-5 py-3 text-sm text-drydock-text text-right">{centsToDisplay(r.listPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordDrawer open={!!selectedId} onClose={() => setSelectedId(null)} entityPath="/items"
        recordId={selectedId} fields={ITEM_FIELDS} title="Item" onSaved={loadData} />
    </PageShell>
  );
}

function CreateItemModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState('service');
  const [unitOfMeasure, setUnitOfMeasure] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/items', { method: 'POST', body: { name, itemType, unitOfMeasure: unitOfMeasure || undefined } });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    }
    setLoading(false);
  };

  return (
    <Modal title="New Item" onClose={onClose} error={error} loading={loading}
      submitLabel="Create Item" disabled={!name.trim()} onSubmit={handleSubmit}>
      <FormInput label="Name" value={name} onChange={setName} placeholder="Item name" required />
      <div>
        <label className="block text-sm text-drydock-text-dim mb-1">Item Type</label>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)}
          className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md text-drydock-text focus:outline-none focus:border-drydock-accent">
          <option value="service">Service</option>
          <option value="inventory">Inventory</option>
          <option value="non_inventory">Non-Inventory</option>
        </select>
      </div>
      <FormInput label="Unit of Measure" value={unitOfMeasure} onChange={setUnitOfMeasure} placeholder="e.g. each, hour, kg" />
    </Modal>
  );
}

// ── Locations Page ─────────────────────────────────────────────────

interface Location {
  id: string;
  name: string;
  code: string;
  address: { line1?: string; city?: string; state?: string; zip?: string } | null;
  isActive: boolean;
}

const LOCATION_FIELDS: FieldDef[] = [
  { key: 'code', label: 'Code' },
  { key: 'name', label: 'Name' },
  { key: 'isActive', label: 'Status', type: 'select', options: [
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' },
  ]},
];

export function LocationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Location[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const res = await endpoints.locations(1, 100);
      setRows(res.data as Location[]);
      setTotal(res.meta?.total ?? res.data.length);
    } catch { /* */ }
    setLoading(false);
  };

  const formatAddress = (addr: Location['address']) => {
    if (!addr) return '--';
    return [addr.line1, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') || '--';
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
  });

  if (!user) return null;

  return (
    <PageShell title="Locations" count={total} onAdd={() => setShowCreate(true)} search={search} onSearch={setSearch}>
      {showCreate && <CreateLocationModal onClose={() => setShowCreate(false)} onCreated={loadData} />}
      <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-drydock-border">
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Code</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Address</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingSkeleton cols={3} /> : filtered.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-drydock-steel">{search ? 'No locations match your search' : 'No locations found'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer">
                <td className="px-5 py-3 text-sm text-drydock-text font-medium">{r.name}</td>
                <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.code}</td>
                <td className="px-5 py-3 text-sm text-drydock-text-dim">{formatAddress(r.address)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordDrawer open={!!selectedId} onClose={() => setSelectedId(null)} entityPath="/locations"
        recordId={selectedId} fields={LOCATION_FIELDS} title="Location" onSaved={loadData} />
    </PageShell>
  );
}

function CreateLocationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/locations', { method: 'POST', body: { name, code } });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location');
    }
    setLoading(false);
  };

  return (
    <Modal title="New Location" onClose={onClose} error={error} loading={loading}
      submitLabel="Create Location" disabled={!name.trim() || !code.trim()} onSubmit={handleSubmit}>
      <FormInput label="Name" value={name} onChange={setName} placeholder="Location name" required />
      <FormInput label="Code" value={code} onChange={setCode} placeholder="e.g. HQ, WH-01" required />
    </Modal>
  );
}

// ── Projects Page ──────────────────────────────────────────────────

interface Project {
  id: string;
  projectNumber: string;
  name: string;
  customerId: string | null;
  status: string;
  budgetAmount: number | null;
}

const PROJECT_FIELDS: FieldDef[] = [
  { key: 'projectNumber', label: 'Project #', readOnly: true },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ]},
  { key: 'projectType', label: 'Project Type' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'budgetAmount', label: 'Budget (cents)', type: 'number' },
];

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const res = await endpoints.projects(1, 100);
      setRows(res.data as Project[]);
      setTotal(res.meta?.total ?? res.data.length);
    } catch { /* */ }
    setLoading(false);
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.projectNumber.toLowerCase().includes(q) || r.status.toLowerCase().includes(q);
  });

  if (!user) return null;

  return (
    <PageShell title="Projects" count={total} onAdd={() => setShowCreate(true)} search={search} onSearch={setSearch}>
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={loadData} />}
      <div className="bg-drydock-card border border-drydock-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-drydock-border">
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Number</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Name</th>
              <th className="text-left px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Status</th>
              <th className="text-right px-5 py-3 text-xs text-drydock-steel uppercase tracking-wider font-medium">Budget</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingSkeleton cols={4} /> : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-drydock-steel">{search ? 'No projects match your search' : 'No projects found'}</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} onClick={() => setSelectedId(r.id)} className="border-b border-drydock-border/50 hover:bg-drydock-bg/50 transition-colors cursor-pointer">
                <td className="px-5 py-3 text-sm font-mono text-drydock-accent">{r.projectNumber}</td>
                <td className="px-5 py-3 text-sm text-drydock-text font-medium">{r.name}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-5 py-3 text-sm text-drydock-text text-right">{centsToDisplay(r.budgetAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordDrawer open={!!selectedId} onClose={() => setSelectedId(null)} entityPath="/projects"
        recordId={selectedId} fields={PROJECT_FIELDS} title="Project" onSaved={loadData} />
    </PageShell>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/projects', { method: 'POST', body: { name } });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
    setLoading(false);
  };

  return (
    <Modal title="New Project" onClose={onClose} error={error} loading={loading}
      submitLabel="Create Project" disabled={!name.trim()} onSubmit={handleSubmit}>
      <FormInput label="Name" value={name} onChange={setName} placeholder="Project name" required />
    </Modal>
  );
}
