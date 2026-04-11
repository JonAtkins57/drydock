import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavSection {
  label: string;
  items: { label: string; path: string }[];
}

const SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    items: [{ label: 'Dashboard', path: '/dashboard' }],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads', path: '/leads' },
      { label: 'Opportunities', path: '/opportunities' },
      { label: 'Activities', path: '/activities' },
    ],
  },
  {
    label: 'Q2C',
    items: [
      { label: 'Quotes', path: '/quotes' },
      { label: 'Sales Orders', path: '/orders' },
      { label: 'Invoices', path: '/invoices' },
      { label: 'Billing Plans', path: '/billing-plans' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Customers', path: '/customers' },
      { label: 'Vendors', path: '/vendors' },
      { label: 'Departments', path: '/departments' },
      { label: 'Employees', path: '/employees' },
      { label: 'Items', path: '/items' },
      { label: 'Locations', path: '/locations' },
      { label: 'Projects', path: '/projects' },
    ],
  },
  {
    label: 'P2P',
    items: [
      { label: 'Requisitions', path: '/requisitions' },
      { label: 'Purchase Orders', path: '/purchase-orders' },
      { label: 'Receipts', path: '/goods-receipts' },
    ],
  },
  {
    label: 'AP',
    items: [
      { label: 'AP Console', path: '/ap-console' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'GL Accounts', path: '/accounts' },
      { label: 'Periods', path: '/periods' },
      { label: 'Journal Entries', path: '/journal-entries' },
      { label: 'Trial Balance', path: '/trial-balance' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Income Statement', path: '/reports/income-statement' },
      { label: 'Balance Sheet', path: '/reports/balance-sheet' },
      { label: 'Balance Sheet Roll-Forward', path: '/reports/balance-sheet-rollforward' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Custom Fields', path: '/custom-fields' },
      { label: 'Workflows', path: '/workflows' },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <aside className="w-56 bg-drydock-dark border-r border-drydock-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-drydock-border">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-3">
          <img src="/assets/drydock-logo.svg" alt="DryDock" className="w-8 h-8" />
          <div>
            <span className="text-drydock-text font-medium text-sm">DryDock</span>
            <p className="text-drydock-steel text-[10px] tracking-[2px] uppercase">Platform</p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {SECTIONS.map((section) => {
          const isCollapsed = collapsed[section.label] ?? false;
          const sectionActive = section.items.some((i) => location.pathname === i.path);

          return (
            <div key={section.label} className="mb-1">
              <button
                onClick={() => toggle(section.label)}
                className={`w-full flex items-center justify-between px-5 py-1.5 text-[11px] uppercase tracking-wider font-medium transition-colors
                  ${sectionActive ? 'text-drydock-accent' : 'text-drydock-steel hover:text-drydock-text-dim'}`}
              >
                {section.label}
                <span className="text-[10px]">{isCollapsed ? '+' : '-'}</span>
              </button>

              {!isCollapsed && (
                <div>
                  {section.items.map((item) => {
                    const active = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={`w-full text-left pl-8 pr-5 py-1.5 text-sm transition-colors
                          ${active
                            ? 'text-drydock-accent bg-drydock-accent/10 border-r-2 border-drydock-accent'
                            : 'text-drydock-text-dim hover:text-drydock-text hover:bg-drydock-card'
                          }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-drydock-border">
        <a
          href="/docs"
          target="_blank"
          className="text-xs text-drydock-steel hover:text-drydock-accent transition-colors"
        >
          API Docs &rarr;
        </a>
      </div>
    </aside>
  );
}
