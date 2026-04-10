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

## Session 2026-04-10 17:05
### Done
- GitHub repo created: https://github.com/JonAtkins57/drydock
- PostgreSQL database `drydock` created on local Docker (PG 18, pgvector)
- Bootstrap SQL: 14 schemas, extensions (uuid-ossp, pg_trgm, btree_gist), RLS helpers, audit protection triggers, journal balance check function, numbering sequences
- npm init with Fastify, Drizzle ORM, Zod, bcrypt, BullMQ, Vitest, Playwright
- Drizzle schema definitions: 41 tables across 5 schemas (core, master, gl, audit, integration)
- Migrations generated and applied — all 41 tables materialized in PostgreSQL
- Metadata engine: custom field CRUD, type-validated value storage, picklist management, numbering sequences
- Auth system: JWT auth with refresh tokens, bcrypt hashing, permission middleware, segregation of duties
- Master data: generic CRUD factory with pagination/filtering/sorting, customer/vendor with duplicate detection, 12 entity services
- General ledger: chart of accounts, period management, posting engine (transaction-wrapped balance validation), journal reversal, trial balance
- Fastify server bootstrap with Swagger, CORS, JWT, RFC 7807 errors
- Landing page at drydock.shipyardopsai.com (Cloudflare tunnel configured)
- Audit service for immutable action logging
- TypeScript strict compile: 8,483 lines, zero errors
- Tests: auth flow, custom fields, posting engine, customer CRUD
### Decisions Made
- ORM: Drizzle (not Kysely) — type-safe, SQL-close, first-class schema support
- Module resolution: bundler (not NodeNext) — cleaner imports, works with tsx and drizzle-kit
- Master data factory uses `any` internally for Drizzle generic compatibility — type safety enforced at Zod boundary
- Port 4400 for DryDock server
### Risks/Debt Noted
- noUnusedLocals/noUnusedParameters disabled temporarily to unblock initial build
- Harbor project DD not created yet (needs Harbor password for JWT login)
- Tests not yet run against live database
- Workflow engine service not yet built (P0 remaining)
- Server not yet verified running
