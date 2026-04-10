# DryDock

**Operational Platform — CRM / ERP / AP Portal / Financial Close / Planning**

![DryDock Logo](assets/drydock-logo.svg)

DryDock is a multi-tenant operational platform that unifies Quote-to-Cash, Procure-to-Pay, and Record-to-Report workflows with a built-in Accounts Payable portal featuring OCR, learned coding, approval workflows, and purchase order matching.

**Live:** [drydock.shipyardopsai.com](https://drydock.shipyardopsai.com)

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js / TypeScript (strict) |
| Backend | Fastify 5 |
| Database | PostgreSQL 18 + Row Level Security |
| ORM | Drizzle ORM |
| Validation | Zod |
| Auth | JWT + bcrypt |
| Queue | BullMQ / Redis |
| OCR | AWS Textract |
| Frontend | React 18 / Vite / Tailwind / Zustand |
| Testing | Vitest (78 tests) / Playwright |
| CI/CD | GitHub Actions |
| Hosting | AWS (prod) / PM2 + Cloudflare Tunnel (dev) |

## Quick Start

```bash
# Install
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Bootstrap database (creates schemas, extensions, functions)
psql -U <user> -d drydock < db/bootstrap.sql

# Run Drizzle migrations (creates all 41 tables)
npm run db:push

# Start dev server
npm run dev

# Run tests
npm test
```

## Project Structure

```
src/
├── core/           # Metadata engine, workflow, auth, tenant, audit
├── master/         # Master data (customers, vendors, employees, items, etc.)
├── gl/             # General ledger, posting engine, trial balance
├── crm/            # CRM (Phase 1 — in progress)
├── q2c/            # Quote-to-cash (Phase 1 — planned)
├── p2p/            # Procure-to-pay (Phase 1 — planned)
├── ap-portal/      # AP portal with OCR (Phase 1 — planned)
├── integration/    # Integration framework + connectors
├── db/
│   └── schema/     # Drizzle schema definitions (41 tables, 5 schemas)
├── lib/            # Shared utilities (Result<T>, AppError)
├── public/         # Landing page
└── server.ts       # Fastify bootstrap
```

## Database Schemas

| Schema | Purpose | Tables |
|--------|---------|--------|
| `drydock_core` | Metadata engine, custom fields, workflows, auth, tenants | 18 |
| `drydock_master` | Customers, vendors, employees, items, departments | 12 |
| `drydock_gl` | Chart of accounts, journals, posting engine | 4 |
| `drydock_audit` | Immutable action log | 1 |
| `drydock_integration` | Sync logs, field mappings, error queues | 5 |
| `drydock_crm` | Leads, opportunities, pipeline | — |
| `drydock_q2c` | Quotes, orders, billing, invoicing | — |
| `drydock_p2p` | Requisitions, POs, receipts | — |
| `drydock_ap` | AP invoices, OCR, coding, matching | — |

## API

Base URL: `/api/v1`

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /auth/register` | Register user |
| `POST /auth/login` | Login (returns JWT) |
| `POST /auth/refresh` | Refresh token |
| `/custom-fields/*` | Custom field definitions and values |
| `/picklists/*` | Picklist management |
| `/customers/*` | Customer CRUD |
| `/vendors/*` | Vendor CRUD |
| `/departments/*` | Department CRUD |
| `/employees/*` | Employee CRUD |
| `/accounts/*` | Chart of accounts |
| `/accounting-periods/*` | Period management |
| `/journal-entries/*` | Journal entries + posting actions |
| `/reports/trial-balance` | Trial balance query |

Swagger UI: `/docs`

## Architecture

See [CLAUDE.md](CLAUDE.md) for the full architecture specification including:
- Multi-tenancy with RLS
- Double-entry posting engine
- Metadata/custom field framework
- Workflow engine design
- Module implementation order

## Phase 1 Status

| Module | Status |
|--------|--------|
| Metadata Engine | Done |
| Auth + Security | Done |
| Master Data | Done |
| General Ledger | Done |
| Server + Hosting | Done |
| Workflow Engine | Next |
| CRM | Planned |
| Quote-to-Cash | Planned |
| Procure-to-Pay | Planned |
| AP Portal | Planned |
| BambooHR Integration | Planned |
| React Frontend | Planned |

## Tracking

Tickets tracked in [Harbor](https://harbor.shipyardopsai.com) — project **DD** (DryDock).

## Product Family

DryDock is part of the Thrasoz product suite:
- **[Shipyard](https://shipyardopsai.com)** — NL-to-production-code SDLC
- **[Signals](https://signals.shipyardopsai.com)** — Operational intelligence
- **[Maestro](https://maestro.shipyardopsai.com)** — Agentic AI orchestration
- **DryDock** — CRM + ERP + AP Portal + Financial Close

## License

Proprietary — Thrasoz / Atkins Professional Services
