# DryDock TODO

## P0 — Must Do Next
- [x] Initialize package.json, tsconfig.json, drizzle.config.ts ✅
- [x] Evaluate Drizzle vs Kysely — picked Drizzle ✅
- [x] Create drydock_core schema: custom_field_definitions, custom_field_values, picklists ✅
- [x] Create drydock_core schema: custom_transaction_type_definitions, instances, lines ✅
- [x] Create drydock_core schema: workflow_definitions, states, transitions, approval_steps ✅
- [x] Create tenant table with RLS policies ✅
- [x] Create users/roles/permissions tables ✅
- [x] Build metadata engine service layer (CRUD for custom fields, validation, defaults) ✅
- [ ] Build workflow engine service layer (state machine execution, approval routing)
- [x] Build auth middleware (JWT, tenant context, permission enforcement) ✅
- [ ] Seed default system admin role + demo tenant
- [ ] Verify server starts and health check works
- [ ] Run tests and fix any failures
- [ ] Create Harbor project DD (need Harbor password or UI)

## P1 — Phase 1 Backlog
- [x] Master data entities (customers, vendors, employees, items, departments, etc.) ✅
- [x] Chart of accounts + accounting periods ✅
- [x] Journal entry + posting engine ✅
- [ ] CRM basics (leads, opportunities, accounts, contacts, activities)
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
- [ ] Landing page refinements (responsive, animations)

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
