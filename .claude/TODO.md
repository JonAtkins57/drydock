# DryDock TODO

## P0 — Complete
- [x] Initialize package.json, tsconfig.json, drizzle.config.ts ✅
- [x] Evaluate Drizzle vs Kysely — picked Drizzle ✅
- [x] Create drydock_core schema: custom_field_definitions, custom_field_values, picklists ✅
- [x] Create drydock_core schema: custom_transaction_type_definitions, instances, lines ✅
- [x] Create drydock_core schema: workflow_definitions, states, transitions, approval_steps ✅
- [x] Create tenant table with RLS policies ✅
- [x] Create users/roles/permissions tables ✅
- [x] Build metadata engine service layer ✅
- [x] Build workflow engine service layer ✅
- [x] Build auth middleware (JWT, tenant context, permission enforcement) ✅
- [x] Seed Tillster + AtkinsPS tenants, users, COA, periods, workflows ✅
- [x] Server running, health check verified ✅
- [x] All tests passing (103) ✅
- [x] Harbor DD project with 16 tickets ✅

## P1 — In Progress
- [x] Master data entities (12 types) ✅
- [x] Chart of accounts + accounting periods ✅
- [x] Journal entry + posting engine ✅
- [x] CRM basics (leads, opportunities, activities, pipeline) ✅
- [x] React frontend (login, dashboard, customers, vendors, accounts, periods) ✅
- [x] Landing page + Cloudflare tunnel ✅
- [x] PM2 persistence + systemd boot ✅
- [x] SES email service ✅
- [x] Shipyard repo registration ✅
- [ ] Quote management + DocuSign integration
- [ ] Sales order management
- [ ] Billing schedule engine
- [ ] Invoice generation + PDF templates
- [ ] AR tracking + aging
- [ ] Requisitions + PO management
- [ ] AP email ingestion pipeline
- [ ] OCR pipeline (Textract)
- [ ] AP coding + approval workflow
- [ ] PO matching engine
- [ ] AP processing console
- [ ] BambooHR integration
- [ ] Transaction-level email sending + tracking
- [ ] Frontend: CRM pages (leads, opportunities, pipeline)
- [ ] Frontend: journal entry creation screen
- [ ] Frontend: create modals for all entity types
- [ ] E2E tests (Playwright)

## P2 — Phase 2 Backlog
- [ ] Learned auto-coding (ML)
- [ ] Expense amortization + allocation engine
- [ ] Revenue recognition (ASC 606)
- [ ] Fixed asset management
- [ ] Inventory management
- [ ] Project management
- [ ] Work order management
- [ ] OCC usage-based billing integration
- [ ] Concur integration
- [ ] KPI dashboards + self-service reporting
