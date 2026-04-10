# DryDock TODO

## P0 — Must Do Next
- [ ] Initialize package.json, tsconfig.json, drizzle.config.ts
- [ ] Evaluate Drizzle vs Kysely — pick ORM
- [ ] Create drydock_core schema: custom_field_definitions, custom_field_values, picklists
- [ ] Create drydock_core schema: custom_transaction_type_definitions, instances, lines
- [ ] Create drydock_core schema: workflow_definitions, states, transitions, approval_steps
- [ ] Create tenant table with RLS policies
- [ ] Create users/roles/permissions tables
- [ ] Build metadata engine service layer (CRUD for custom fields, validation, defaults)
- [ ] Build workflow engine service layer (state machine execution, approval routing)
- [ ] Build auth middleware (JWT, tenant context, permission enforcement)

## P1 — Phase 1 Backlog
- [ ] Master data entities (customers, vendors, employees, items, departments, etc.)
- [ ] Chart of accounts + accounting periods
- [ ] Journal entry + posting engine
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
