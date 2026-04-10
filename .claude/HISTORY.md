# DryDock Session History

## 2026-04-10 — Project Initialization & Full Foundation Build

### Session 17:05–18:45 (100 min)

#### Done
- **GitHub repo**: https://github.com/JonAtkins57/drydock (7 commits)
- **PostgreSQL**: drydock DB on Docker PG18, 14 schemas, 44 tables
- **Bootstrap SQL**: RLS helpers, audit protection, journal balance check, numbering sequences
- **Drizzle ORM**: 44 table definitions across 6 schemas (core, master, gl, audit, integration, crm)
- **Metadata engine**: custom field CRUD, type-validated values, picklists, numbering sequences (36 tests)
- **Auth system**: JWT + refresh tokens, bcrypt, wildcard permission matching, segregation of duties (14 tests)
- **Master data**: 12 entity services with pagination, filtering, sorting, duplicate detection (16 tests)
- **General ledger**: chart of accounts, period management, posting engine, trial balance (12 tests)
- **Workflow engine**: state machine executor, condition evaluation, approval routing (serial/parallel) (8 tests)
- **CRM module**: leads, opportunities (pipeline query), activities (polymorphic), lead→opportunity conversion (14 tests)
- **Seed data**: Tillster + AtkinsPS tenants, 3 users, 29 GL accounts, 12 periods, 3 workflow definitions, sample customers/vendors
- **React frontend**: Login, Dashboard, Customers (with create modal), Vendors, GL Accounts, Periods
- **Fastify server**: Swagger UI, CORS, JWT, RFC 7807 errors, static serving, SPA fallback
- **Infrastructure**: Cloudflare tunnel (drydock.shipyardopsai.com), PM2 with systemd boot persistence
- **Email**: AWS SES service with invite template
- **Harbor**: DD project, 16 tickets (DD-1→DD-10 done, DD-11→DD-16 open)
- **Shipyard**: drydock registered in repo registry
- **103 tests passing across 6 test files, ~16,000 lines TypeScript**

#### Decisions Made
- ORM: Drizzle (not Kysely)
- Module resolution: bundler (not NodeNext)
- Port 4400, Cloudflare tunnel to drydock.shipyardopsai.com
- Lazy DB pool initialization (fixes ESM + dotenv race)
- Master data factory uses `any` internally — type safety at Zod boundary
- SES from atkinsps AWS account (AKIA5AZG...) for all tenants initially
- Harbor is working truth for ticket status

#### Risks/Debt
- noUnusedLocals/noUnusedParameters disabled
- Workflow action executor not yet built (actions are logged, not executed)
- CRM schema migration required manual drizzle-kit invocation with bare imports
- No E2E tests yet (Playwright)
- Frontend missing CRM pages, journal entry screen
