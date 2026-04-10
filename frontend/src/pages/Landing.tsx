export default function Landing() {
  return (
    <div className="min-h-screen bg-drydock-bg">
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 relative"
        style={{ background: 'radial-gradient(ellipse at 50% 30%, #0f303d 0%, #0a1a22 70%)' }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #4ecdc4, transparent)' }} />

        <img src="/assets/drydock-logo.svg" alt="DryDock" className="w-72 mb-8 drop-shadow-[0_0_40px_rgba(78,205,196,0.15)]" />
        <p className="text-drydock-text-dim text-sm tracking-[3px] uppercase mb-6">Operational Platform</p>
        <p className="text-drydock-light text-xl max-w-2xl font-light leading-relaxed mb-10">
          Multi-tenant CRM, ERP, AP Portal, Financial Close, and Operational Planning
          — unified in a single platform built for mid-market companies.
        </p>

        <div className="flex gap-4 mb-8">
          <a
            href="/login"
            className="px-8 py-3 bg-drydock-accent hover:bg-drydock-accent-dim text-drydock-dark font-medium rounded-md transition-colors text-lg"
          >
            Sign In
          </a>
          <a
            href="/docs"
            className="px-8 py-3 border border-drydock-border hover:border-drydock-steel text-drydock-text-dim hover:text-drydock-text rounded-md transition-colors text-lg"
          >
            API Docs
          </a>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-drydock-accent/8 border border-drydock-accent/25 rounded-full text-sm text-drydock-accent tracking-wide">
          <span className="w-2 h-2 bg-drydock-accent rounded-full animate-pulse" />
          Phase 1 — Live
        </div>
      </section>

      {/* Modules */}
      <section className="py-24 px-6 bg-drydock-dark">
        <h2 className="text-center text-2xl font-light text-drydock-light tracking-wide mb-4">Modules</h2>
        <p className="text-center text-drydock-text-dim mb-16">Everything finance, operations, and sales teams need.</p>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { t: 'Quote-to-Cash', d: 'Quotes, orders, billing schedules, invoicing, AR, collections.' },
            { t: 'Procure-to-Pay', d: 'Requisitions, POs, receipts, three-way matching.' },
            { t: 'AP Portal', d: 'OCR intake, GL coding, PO matching, approval workflows.' },
            { t: 'General Ledger', d: 'Double-entry posting, period management, trial balance.' },
            { t: 'CRM', d: 'Leads, opportunities, pipeline, activities.' },
            { t: 'Metadata Engine', d: 'Custom fields, transaction types, picklists.' },
            { t: 'Workflow Engine', d: 'State machines, approvals, conditions, actions.' },
            { t: 'Integrations', d: 'BambooHR, framework for field mapping and sync.' },
            { t: 'Audit Trail', d: 'Immutable, append-only action log. No exceptions.' },
          ].map((m) => (
            <div key={m.t} className="bg-drydock-card border border-drydock-border rounded-lg p-6 hover:border-drydock-accent transition-colors">
              <h3 className="text-drydock-text font-medium mb-2">{m.t}</h3>
              <p className="text-drydock-text-dim text-sm leading-relaxed">{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech */}
      <section className="py-24 px-6 bg-drydock-bg">
        <h2 className="text-center text-2xl font-light text-drydock-light tracking-wide mb-12">Built With</h2>
        <div className="max-w-3xl mx-auto flex flex-wrap gap-3 justify-center">
          {['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'Drizzle ORM', 'Row Level Security',
            'React', 'Vite', 'Tailwind CSS', 'BullMQ', 'Redis', 'AWS Textract', 'JWT', 'OpenAPI', 'Vitest'
          ].map((t) => (
            <span key={t} className="px-4 py-2 bg-drydock-accent/5 border border-drydock-border rounded-full text-sm text-drydock-text-dim">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Product Family */}
      <section className="py-24 px-6 bg-drydock-dark">
        <h2 className="text-center text-2xl font-light text-drydock-light tracking-wide mb-12">Product Family</h2>
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { n: 'Shipyard', d: 'NL-to-code SDLC', href: 'https://shipyardopsai.com/' },
            { n: 'Signals', d: 'Operational intelligence', href: 'https://signals.shipyardopsai.com/' },
            { n: 'Maestro', d: 'Agentic AI', href: 'https://maestro.shipyardopsai.com/' },
            { n: 'DryDock', d: 'CRM + ERP + AP', active: true },
          ].map((p) => (
            <a
              key={p.n}
              href={(p as { href?: string }).href ?? '#'}
              target={(p as { active?: boolean }).active ? undefined : '_blank'}
              rel="noopener noreferrer"
              className={`text-center p-6 border rounded-lg transition-colors block ${
                (p as { active?: boolean }).active ? 'border-drydock-accent bg-drydock-accent/5' : 'border-drydock-border hover:border-drydock-steel'
              }`}
            >
              <h4 className="font-medium mb-1">{p.n}</h4>
              <p className="text-drydock-text-dim text-xs">{p.d}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 border-t border-drydock-border text-drydock-steel text-xs tracking-wide">
        &copy; 2026 Thrasoz / Atkins Professional Services
      </footer>
    </div>
  );
}
