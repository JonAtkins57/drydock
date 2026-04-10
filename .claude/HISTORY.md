# DryDock Session History

## 2026-04-10 — Full Phase 1 Build (Single Session)

### Duration: ~3 hours

### Summary
Built the entire DryDock Phase 1 operational platform from an empty directory to a fully functioning multi-tenant CRM/ERP with 26 frontend pages, 63 database tables, 176 unit tests, and 15 E2E tests. All 26 Harbor tickets completed.

### Backend Modules (9)
1. **Metadata Engine** — custom fields, picklists, numbering sequences, custom transaction types
2. **Workflow Engine** — state machine, condition evaluation, approval routing (serial/parallel)
3. **Auth + Security** — JWT, bcrypt, wildcard permissions, segregation of duties, RLS
4. **Master Data** — 12 entity services (customers, vendors, employees, items, departments, locations, projects, cost centers, payment terms, tax codes, currencies, legal entities)
5. **General Ledger** — chart of accounts, periods, posting engine, journal reversal, trial balance
6. **CRM** — leads (with conversion), opportunities (pipeline query), activities (polymorphic)
7. **Quote-to-Cash** — quotes (versioning), sales orders, invoices (payment recording), billing schedules (fixed/recurring/milestone), AR aging
8. **Procure-to-Pay** — requisitions, purchase orders, goods receipts
9. **AP Portal** — intake (manual/upload/email), OCR worker (Textract stub), coding rules, 2-way/3-way PO matching, processing queue, GL posting
10. **BambooHR Integration** — employee/department sync, manager hierarchy, termination handling
11. **Email Service** — AWS SES with invite template

### Frontend Pages (26)
Landing, Login, Dashboard, Customers, Vendors, GL Accounts, Periods, Leads, Opportunities (Kanban), Activities (timeline), Journal Entries (create+post), Trial Balance, Custom Fields, Workflows, Employees, Items, Locations, Projects, Requisitions, Purchase Orders, AP Console, AP Invoice Detail, Goods Receipts, Quotes, Sales Orders, Invoices, Billing Plans

### Infrastructure
- PostgreSQL 18: 63 tables across 9 schemas
- Cloudflare tunnel: drydock.shipyardopsai.com
- PM2 + systemd: auto-restart on boot
- AWS SES: email sending configured
- Shipyard: registered in repo registry
- Harbor: 26 tickets (DD-1 through DD-26), all done

### Tests
- 176 unit tests (Vitest, 11 files) — all passing
- 15 E2E tests (Playwright, 3 files) — all passing

### Seed Data
- Tillster tenant + AtkinsPS tenant
- 3 users: jon@atkinsps.com (both), mlakier@tillster.com (Tillster)
- 29 GL accounts, 12 periods, 5 departments, 4 payment terms
- 3 customers, 3 vendors, 3 workflow definitions (AP invoice, journal entry, PO)

### Decisions
- ORM: Drizzle (not Kysely)
- Module resolution: bundler
- Lazy DB pool for ESM/dotenv compatibility
- Harbor as working truth for project status
- SES from atkinsps AWS account
- Stubs for IMAP/Textract/S3 (swappable interfaces)
