# DryDock Architecture

## System Overview

DryDock is a multi-tenant CRM/ERP operational platform built on Node.js/TypeScript with Fastify, PostgreSQL, and Drizzle ORM.

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel                      │
│              drydock.shipyardopsai.com                    │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────┐
│                 Fastify Server (:4400)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │   Auth   │ │  Custom  │ │  Master  │ │    GL    │   │
│  │ Middleware│ │  Fields  │ │   Data   │ │  Module  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │             │            │             │          │
│  ┌────▼─────────────▼────────────▼─────────────▼──────┐  │
│  │              Service Layer (Result<T, AppError>)    │  │
│  │         Zod validation · Audit logging              │  │
│  └────────────────────┬───────────────────────────────┘  │
│                       │                                   │
│  ┌────────────────────▼───────────────────────────────┐  │
│  │              Drizzle ORM + pg Pool                  │  │
│  │         SET app.current_tenant per request          │  │
│  └────────────────────┬───────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│                  PostgreSQL 18                             │
│                                                           │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐     │
│  │ drydock_core│ │drydock_master│ │  drydock_gl   │     │
│  │  18 tables  │ │  12 tables   │ │   4 tables    │     │
│  └─────────────┘ └──────────────┘ └───────────────┘     │
│  ┌──────────────┐ ┌────────────────────┐                 │
│  │drydock_audit │ │drydock_integration │                 │
│  │   1 table    │ │     5 tables       │                 │
│  └──────────────┘ └────────────────────┘                 │
│                                                           │
│  Row Level Security on ALL tenant-scoped tables           │
│  drydock_core.current_tenant_id() → session var           │
└──────────────────────────────────────────────────────────┘
```

## Multi-Tenancy

Every tenant-scoped table has a `tenant_id UUID` column with RLS policies enforcing isolation at the database layer.

```
Application Request
    │
    ▼
Auth Middleware → Extract tenant from JWT
    │
    ▼
SET app.current_tenant = '<uuid>' on DB connection
    │
    ▼
RLS Policy: tenant_id = drydock_core.current_tenant_id()
```

**No query can leak cross-tenant data.** RLS is enforced even if application code has bugs.

## Service Layer Pattern

Every service function returns `Result<T, AppError>` — never throws for business logic errors.

```typescript
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
const result = await createAccount(tenantId, data, userId);
if (!result.ok) return sendError(reply, result.error);
return reply.send(result.value);
```

## Double-Entry Posting Engine

The GL posting engine is the most critical component:

```
Journal Entry (draft)
    │
    ▼ submitForApproval()
Journal Entry (pending_approval)
    │
    ▼ approveJournal() — segregation of duties check
Journal Entry (approved)
    │
    ▼ postJournal() — ALL inside single DB transaction:
    │   1. Verify status = approved
    │   2. Verify period is open
    │   3. Verify gl.journal.post permission
    │   4. check_journal_balance() — debits must equal credits
    │   5. Validate all dimensions
    │   6. Set status = posted, posted_by, posted_at
    │   7. Write audit log
    │   8. COMMIT (or ROLLBACK on any failure)
    │
    ▼
Journal Entry (posted) — immutable
    │
    ▼ reverseJournal() — creates opposing entry atomically
Journal Entry (reversed) + New Journal Entry (posted)
```

## Money Handling

All monetary values stored as **integers (cents)** — never floating point. `$100.50` = `10050`. Display conversion happens exclusively in the frontend.

## Metadata Engine

Custom fields are the foundation — every entity type can have tenant-defined fields:

```
custom_field_definitions → defines the field (type, validation, security)
    │
    ▼
custom_field_values → stores the value (routed to correct column by type)
    │
    ├── value_text (text, long_text)
    ├── value_numeric (numeric, currency)
    ├── value_date (date, datetime)
    ├── value_boolean (boolean)
    └── value_json (single_select, multi_select, reference, formula, attachment_ref)
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ORM | Drizzle | Type-safe, SQL-close, first-class schema support, migration tooling |
| Module resolution | bundler | Works with tsx (dev) and drizzle-kit (migrations) |
| Server | Fastify | Performance matters for ERP workloads; 2x faster than Express |
| Auth | JWT + bcrypt | Stateless auth with tenant context in claims |
| Money | Integer cents | Eliminates floating point errors in financial calculations |
| Audit | Append-only table | No updates, no deletes — ever. Regulatory requirement. |
| Error pattern | Result<T, AppError> | Explicit error handling, no hidden throws |
| Process manager | PM2 | Auto-restart, log management, cluster mode ready |

## Infrastructure

```
Developer Machine (atkinslx)
├── Docker: PostgreSQL 18 (pgvector) — port 5432
├── Docker: Cloudflare Tunnel — routes *.shipyardopsai.com
├── PM2: drydock process — port 4400
└── Cloudflare DNS: drydock.shipyardopsai.com → tunnel → :4400
```

## File Conventions

- `*.service.ts` — Business logic, returns Result<T>
- `*.routes.ts` — Fastify route handlers, Zod validation
- `*.schemas.ts` — Zod schemas for request/response
- `*.test.ts` — Vitest tests
- `src/db/schema/*.ts` — Drizzle table definitions
- `db/migrations/` — Generated Drizzle migrations
- `db/bootstrap.sql` — Schema creation, extensions, functions (run before migrations)
