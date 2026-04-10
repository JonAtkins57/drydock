import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: '&#9783;' },
  { label: 'Customers', path: '/customers', icon: '&#9733;' },
  { label: 'Vendors', path: '/vendors', icon: '&#9881;' },
  { label: 'GL Accounts', path: '/accounts', icon: '&#9878;' },
  { label: 'Periods', path: '/periods', icon: '&#128197;' },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-56 bg-drydock-dark border-r border-drydock-border flex flex-col">
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
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
                ${active
                  ? 'text-drydock-accent bg-drydock-accent/10 border-r-2 border-drydock-accent'
                  : 'text-drydock-text-dim hover:text-drydock-text hover:bg-drydock-card'
                }`}
            >
              <span dangerouslySetInnerHTML={{ __html: item.icon }} />
              {item.label}
            </button>
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
