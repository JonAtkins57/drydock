# DryDock Session History

## 2026-04-10 — Project Initialization
- Created repo structure with module directories
- Created CLAUDE.md bootstrap prompt with full architecture spec
- Created logo (drydock-logo.svg)
- Defined tech stack: Node/TS, Fastify, PostgreSQL, Drizzle, React/Vite/Tailwind
- Defined schema organization: 14 schemas by domain
- Defined multi-tenancy approach: tenant_id + RLS on every table
- Defined Phase 1 build order: metadata engine → auth → master data → GL → CRM → Q2C → P2P → AP portal → BambooHR
- Key decisions still open: Drizzle vs Kysely, email service, search strategy, frontend routing
- Next: initialize package.json + tsconfig, start drydock_core schema migrations
