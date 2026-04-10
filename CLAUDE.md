# DRYDOCK — Operational Platform

## Identity
DryDock is a multi-tenant CRM/ERP operational platform. It is a Thrasoz product. Customer #1 is Tillster. Future customers include WasteVision, FlexBets, Sapphire Connected Communities, and other mid-market companies.

DryDock is part of a product family:
- **Shipyard** — NL-to-production-code across the full SDLC
- **Signals** — operational intelligence / workforce analytics / KPI visibility
- **Maestro** — agentic AI / AI coworkers
- **DryDock** — this platform: CRM + ERP + AP portal + financial close + planning

These products share data and feed each other. Signals reads DryDock transaction data for financial/operational analytics. Maestro automates DryDock workflows (AP coding, collections, expense categorization). Shipyard builds and extends all three.

## Tech Stack
- **Runtime**: Node.js / TypeScript (strict mode, no `any`)
- **Backend framework**: Fastify (not Express — performance matters for an ERP)
- **Database**: PostgreSQL 16+ (relational integrity is non-negotiable for double-entry accounting)
- **ORM**: Drizzle ORM (type-safe, SQL-close, migration-friendly)
- **Frontend**: React 18+ / TypeScript / Vite
- **Styling**: Tailwind CSS
- **State management**: Zustand (lightweight, no boilerplate)
- **API style**: REST with OpenAPI spec generation; GraphQL later if needed for reporting
- **Auth**: JWT + refresh tokens; OIDC/SSO support in design but Phase 2
- **File storage**: S3-compatible (AWS S3 or MinIO for local dev)
- **Search**: PostgreSQL full-text search initially; Elasticsearch later if needed
- **Queue/jobs**: BullMQ on Redis for background processing (OCR, imports, sync, amortization posting)
- **OCR**: AWS Textract (primary) with abstraction layer for swap
- **Email ingestion**: IMAP polling service for AP inbox monitoring
- **PDF generation**: Puppeteer rendering HTML templates
- **Testing**: Vitest (unit/integration), Playwright (e2e)
- **CI/CD**: GitHub Actions
- **Infrastructure**: AWS (RDS, ECS/Fargate, S3, SQS, ElastiCache)
- **Hosting (dev/staging)**: drydock.shipyardopsai.com on Jon's Linux box behind Cloudflare

## Architecture Principles

### Multi-Tenancy
Every table has a `tenant_id` column. Row Level Security (RLS) policies enforce isolation at the database layer. The application layer sets `SET app.current_tenant = '<id>'` on every connection. No query should ever be able to leak cross-tenant data.

### Schema Organization
Single PostgreSQL database, multiple schemas:
```
drydock_core        — metadata engine, custom fields, custom transaction types, workflow defs, tenant config
drydock_master      — customers, vendors, employees, items, departments, entities, locations, COA
drydock_crm         — leads, opportunities, activities, pipeline
drydock_q2c         — quotes, orders, contracts, subscriptions, billing schedules, invoices, receivables
drydock_p2p         — requisitions, POs, receipts
drydock_ap          — AP invoices, OCR results, bill coding, matching, learned coding rules
drydock_gl          — chart of accounts, journals, periods, posting engine, trial balance
drydock_asset       — fixed assets, depreciation books/schedules
drydock_lease       — lease master, payment schedules, ROU/liability calculations
drydock_inventory   — items, warehouses, transactions, valuations
drydock_project     — projects, tasks, budgets, work orders, labor/material
drydock_planning    — budgets, forecasts, operational plans, cash forecasts
drydock_integration — sync logs, field mappings, error queues, external keys, webhook config
drydock_audit       — immutable action log, approval records, change history
```

### Double-Entry Accounting
The GL is sacred. Every financial transaction posts balanced journal entries — debits = credits, always. The posting engine validates balance before committing. No direct GL manipulation — all posts go through the posting service which enforces:
1. Debit sum == Credit sum
2. Period is open
3. Posting user has permission
4. All required dimensions are present
5. Audit trail is recorded atomically

### Metadata Engine (Section 6.0 — Build This First)
The metadata/custom-field framework is the foundation. Everything else depends on it.

Core tables in `drydock_core`:
```
custom_field_definitions
  - id, tenant_id, entity_type, field_key, display_name, data_type, is_required,
    default_value, default_source, validation_rules, field_group, sort_order,
    help_text, is_active, effective_from, effective_to, security_config,
    gl_posting_behavior, created_at, updated_at, created_by, updated_by

custom_field_values
  - id, tenant_id, entity_type, entity_id, field_definition_id,
    value_text, value_numeric, value_date, value_boolean, value_json,
    created_at, updated_at, created_by, updated_by

custom_transaction_type_definitions
  - id, tenant_id, type_key, display_name, description, base_posting_model,
    status_workflow_id, numbering_scheme, permissions_config, document_template_id,
    reporting_config, is_active, created_at, updated_at

custom_transaction_instances
  - id, tenant_id, transaction_type_id, transaction_number, status,
    header_data (jsonb), created_at, updated_at, created_by, updated_by

custom_transaction_lines
  - id, tenant_id, transaction_instance_id, line_number, line_data (jsonb),
    created_at, updated_at

picklist_definitions
  - id, tenant_id, list_key, display_name, is_active

picklist_values
  - id, tenant_id, picklist_id, value_key, display_value, sort_order,
    is_default, is_active
```

Data type enum: `text | long_text | numeric | currency | date | datetime | boolean | single_select | multi_select | reference | formula | attachment_ref`

The metadata engine must support:
- Field-level security by role, entity, workflow state
- Validation rules (required, conditional required, format, range, uniqueness, cross-field, reference)
- Default sourcing from related records, formulas, user context, role, entity
- Inheritance from master data into transactions with override controls
- Custom fields available in: workflows, approvals, reporting, imports/exports, integrations, APIs, search, document templates, GL posting logic
- Bulk administration and deployment across environments

### Workflow Engine
Configurable, event-driven, admin-maintainable without code changes.

Core concepts:
- **Workflow Definition**: defines the state machine for a record type
- **States**: named statuses with entry/exit actions
- **Transitions**: allowed moves between states with conditions
- **Rules**: conditions evaluated against record data, user role, thresholds
- **Actions**: triggered on state entry/exit/transition — send notification, update field, create child record, post to GL, call webhook
- **Approval Steps**: serial or parallel, with delegation, escalation, timeout
- **Triggers**: event-driven (record created, field changed, threshold crossed, schedule)

Tables in `drydock_core`:
```
workflow_definitions
  - id, tenant_id, entity_type, name, description, is_active

workflow_states
  - id, workflow_id, state_key, display_name, sort_order, is_initial, is_terminal,
    entry_actions (jsonb), exit_actions (jsonb)

workflow_transitions
  - id, workflow_id, from_state_id, to_state_id, transition_key, display_name,
    conditions (jsonb), required_permissions, actions (jsonb)

workflow_instances
  - id, tenant_id, workflow_definition_id, entity_type, entity_id,
    current_state_id, started_at, completed_at

approval_steps
  - id, workflow_transition_id, step_order, approval_type (serial|parallel),
    approver_rule (jsonb), timeout_hours, escalation_rule (jsonb)

approval_records
  - id, tenant_id, workflow_instance_id, approval_step_id, approver_id,
    decision (approved|rejected|delegated), comments, decided_at
```

### Master Data Model
All master records share common patterns:
- `tenant_id` for isolation
- `external_id` for integration mapping
- `is_active` flag (soft delete, never hard delete financial data)
- `effective_from` / `effective_to` for temporal validity
- `created_at`, `updated_at`, `created_by`, `updated_by` for audit
- Custom field values attached via the metadata engine

Key master entities in `drydock_master`:
```
tenants
  - id, name, slug, settings (jsonb), is_active

legal_entities
  - id, tenant_id, name, code, currency, address, tax_id, is_active

departments
  - id, tenant_id, entity_id, name, code, parent_id, manager_employee_id, is_active

locations
  - id, tenant_id, name, code, address, is_active

customers
  - id, tenant_id, name, customer_number, entity_id, status,
    billing_address, shipping_address, payment_terms_id, tax_code_id,
    credit_limit, currency, parent_customer_id, is_active

contacts
  - id, tenant_id, customer_id, vendor_id, first_name, last_name, email, phone,
    title, is_primary, is_active

vendors
  - id, tenant_id, name, vendor_number, entity_id, status,
    remit_to_address, payment_terms_id, tax_id, default_expense_account_id,
    currency, is_active

employees
  - id, tenant_id, employee_number, user_id, first_name, last_name, email,
    department_id, manager_id, hire_date, termination_date, status,
    bamboohr_id, is_active

users
  - id, tenant_id, email, password_hash, first_name, last_name,
    employee_id, role_ids (jsonb), is_active, last_login

items
  - id, tenant_id, item_number, name, description, item_type (inventory|non_inventory|service|other),
    unit_of_measure, revenue_account_id, expense_account_id, cogs_account_id,
    standard_cost, list_price, is_active

projects
  - id, tenant_id, project_number, name, customer_id, status, project_type,
    start_date, end_date, budget_amount, manager_employee_id, is_active

cost_centers
  - id, tenant_id, name, code, department_id, is_active

payment_terms
  - id, tenant_id, name, days_due, discount_days, discount_percent, is_active

tax_codes
  - id, tenant_id, name, code, rate, is_active

currencies
  - id, code, name, symbol, decimal_places
```

### Chart of Accounts (in `drydock_gl`)
```
accounts
  - id, tenant_id, account_number, name, account_type (asset|liability|equity|revenue|expense),
    account_subtype, parent_account_id, is_posting_account, is_active,
    normal_balance (debit|credit), description

accounting_periods
  - id, tenant_id, entity_id, period_name, start_date, end_date,
    fiscal_year, period_number, status (open|soft_close|closed|locked)

journal_entries
  - id, tenant_id, entity_id, journal_number, journal_type,
    period_id, posting_date, description, status (draft|pending_approval|approved|posted|reversed),
    source_module, source_entity_type, source_entity_id,
    created_by, approved_by, posted_by, posted_at, reversed_by_journal_id

journal_entry_lines
  - id, journal_entry_id, line_number, account_id, debit_amount, credit_amount,
    description, department_id, location_id, customer_id, vendor_id,
    project_id, cost_center_id, class_id, entity_id,
    custom_dimensions (jsonb)
```

### Dimension Model
DryDock uses a flexible dimension model for financial reporting. Standard dimensions are columns on journal_entry_lines (department_id, location_id, project_id, cost_center_id, entity_id, customer_id, vendor_id). Additional dimensions use the `custom_dimensions` jsonb column, which is indexed for query performance. This allows tenants to define their own reporting dimensions without schema changes.

### API Design
REST, versioned, consistent:
```
GET    /api/v1/{entity}              — list with pagination, filtering, sorting
GET    /api/v1/{entity}/:id          — get single record
POST   /api/v1/{entity}              — create
PATCH  /api/v1/{entity}/:id          — update
DELETE /api/v1/{entity}/:id          — soft delete (set is_active = false)
POST   /api/v1/{entity}/:id/actions/{action}  — workflow transitions, approvals, posting
```

Standard query params: `page`, `page_size`, `sort`, `filter`, `fields`, `expand`

Every response includes: `id`, `created_at`, `updated_at`, `_links` (HATEOAS)

Errors follow RFC 7807 Problem Details format.

### Security Model
```
roles
  - id, tenant_id, name, description, permissions (jsonb), is_system_role

user_roles
  - id, user_id, role_id, entity_id (optional scope)

permissions model:
  - module.entity.action (e.g., gl.journal.post, ap.invoice.approve, q2c.quote.create)
  - field-level restrictions via metadata engine
  - segregation of duties rules (e.g., cannot approve own journal)
```

### Audit Trail
Every create, update, delete, approve, post, and reverse action writes to `drydock_audit.audit_log`:
```
audit_log
  - id, tenant_id, timestamp, user_id, action (create|update|delete|approve|reject|post|reverse),
    entity_type, entity_id, changes (jsonb — before/after), ip_address, session_id
```
This table is append-only. No updates, no deletes. Ever.

## Module Implementation Order

### Phase 1 (MVP — target: 6-9 months)
Build in this order. Each step depends on the prior.

1. **drydock_core: Metadata Engine + Workflow Engine**
   - Custom field definitions, values, picklists
   - Custom transaction type definitions
   - Workflow definitions, states, transitions, approval steps
   - Admin UI for field/workflow configuration
   - This is the foundation — nothing else works without it

2. **drydock_core: Tenant + Auth + Security**
   - Tenant provisioning, RLS policies
   - User registration, JWT auth, role assignment
   - Permission enforcement middleware
   - Segregation of duties rules

3. **drydock_master: Master Data**
   - All master entities listed above
   - CRUD APIs with validation, duplicate detection, audit
   - Import/export utilities
   - Custom field attachment to all master records

4. **drydock_gl: General Ledger**
   - Chart of accounts management
   - Accounting period management
   - Journal entry creation, approval, posting, reversal
   - Posting engine with balance validation
   - Trial balance generation
   - Basic financial reports (P&L, balance sheet)

5. **drydock_crm: CRM Basics**
   - Lead and opportunity tracking
   - Account/contact management with hierarchy
   - Activity tracking (tasks, notes, meetings)
   - Pipeline stages and visibility
   - Email send + tracking at record level

6. **drydock_q2c: Quote-to-Cash Basics**
   - Quote creation, versioning, approval, document generation
   - DocuSign integration for quote execution
   - Sales order creation (manual + auto from executed quotes)
   - Invoice generation from orders/milestones/schedules
   - Billing schedule engine (fixed, recurring, milestone, usage, hybrid)
   - AR tracking, aging, customer statements
   - Cash receipt import / application
   - Credit memos with approval workflow
   - Transaction-level email (quote delivery, invoice delivery)
   - Customizable PDF templates per transaction type

7. **drydock_p2p: Procure-to-Pay Basics**
   - Purchase requisitions with approval routing
   - Purchase order creation, approval, dispatch
   - Goods/service receipt tracking
   - PO email to vendor

8. **drydock_ap: AP Portal**
   - Email inbox monitoring (IMAP)
   - Invoice intake from email attachments
   - OCR via AWS Textract — extract vendor, invoice #, date, amount, line items
   - Confidence scoring and user correction UI
   - GL coding with defaults and suggestions
   - Approval workflow routing
   - 2-way and 3-way PO matching with tolerance rules
   - AP processing console (queue-based workbench)
   - Invoice posting to GL

9. **drydock_integration: BambooHR**
   - Employee master sync
   - Department/manager relationship sync
   - Approver hierarchy sync
   - User activation/deactivation based on employment status

### Phase 2
- Learned auto-coding (ML on historical AP coding decisions)
- Advanced PO matching with configurable tolerances
- Expense amortization + allocation engine
- Revenue recognition module (ASC 606)
- Fixed asset management
- Inventory management
- Project management module
- Work order management module
- Subscription billing + OCC usage-based invoicing integration
- Concur integration
- Advanced R2R close features
- KPI dashboards + self-service reporting/visualization
- Enhanced audit tools

### Phase 3
- Lease accounting (ASC 842)
- JIRA integration expansion
- Forecasting, budgeting, 3-year operational planning
- Cash forecasting
- Advanced workflow orchestration
- ML improvements for AP coding
- Broader automation + self-service admin

## Billing Schedule Engine (Critical — Phase 1)
The spec demands extreme flexibility here. Design for:
- Fixed date, contract-relative, service-period, milestone, delivery-event, usage-period, anniversary, custom calendar, manual plan
- Monthly, quarterly, annual, irregular, front-loaded, back-loaded, ramped, prorated, deferred-start, custom interval
- Advance billing AND arrears billing, including mixed within one customer arrangement
- Amendments with effective dating, version history, rebilling/true-up
- Separation from revenue recognition schedules (billing ≠ rev rec) with linkage and auditability

Data model sketch:
```
billing_plans
  - id, tenant_id, customer_id, contract_id, subscription_id, order_id,
    plan_type, billing_method (advance|arrears), frequency, start_date, end_date,
    status, version, prior_version_id

billing_schedule_lines
  - id, billing_plan_id, line_number, billing_date, period_start, period_end,
    amount, status (scheduled|invoiced|adjusted|cancelled),
    invoice_id, description

billing_plan_amendments
  - id, billing_plan_id, effective_date, amendment_type, changes (jsonb),
    approved_by, approved_at
```

## AP Portal Detail (Critical — Phase 1)

### Email Ingestion Pipeline
1. IMAP poller connects to configured AP inbox(es) on schedule
2. New emails parsed: sender, subject, body, received date, attachments
3. Attachments (PDF, images) stored in S3 with metadata
4. Duplicate detection: hash of attachment + sender + invoice-number-if-extractable
5. Creates AP intake record with status `ocr_pending`
6. Queues OCR job via BullMQ

### OCR Pipeline
1. Worker picks up job, sends document to AWS Textract
2. Extracts: vendor name, invoice number, invoice date, due date, currency, total, subtotal, tax, PO number, line items, remit-to, payment terms
3. Confidence scores per field stored alongside extracted values
4. Low-confidence fields flagged for user review
5. Status → `review_required` or `coding_ready` based on confidence thresholds

### Learned Coding (Phase 2 Enhancement)
Phase 1: rule-based defaults by vendor + expense category
Phase 2: ML model trained on historical coding decisions — vendor × description × amount × department → suggested GL account, dimensions, amortization treatment

### AP Processing Console
Queue-based workbench views:
- New invoices (needs OCR review)
- OCR exceptions (low confidence)
- Duplicate warnings
- Coding review
- Amortization setup/review
- Allocation review
- Approval pending
- Match exceptions
- Ready to post / ready to pay

## Integration Framework
All integrations follow a common pattern:
```
integration_configs
  - id, tenant_id, integration_type, name, config (jsonb — encrypted credentials),
    sync_schedule, is_active

integration_field_mappings
  - id, integration_config_id, source_field, target_entity, target_field,
    transform_rule, is_active

integration_sync_logs
  - id, integration_config_id, sync_type (full|incremental), started_at, completed_at,
    status (running|success|partial|failed), records_processed, records_failed,
    error_details (jsonb)

integration_error_queue
  - id, sync_log_id, source_record_id, error_type, error_message, payload (jsonb),
    retry_count, status (pending|retrying|resolved|abandoned), resolved_at, resolved_by

external_key_mappings
  - id, tenant_id, integration_type, external_system, external_id,
    internal_entity_type, internal_entity_id
```

## Document Template Engine
Customizable PDF templates per transaction type (quotes, invoices, POs, credit memos, etc.):
- HTML/CSS templates with Handlebars-style variable injection
- Rendered via Puppeteer to PDF
- Template management UI for admins
- Support for tenant-specific branding (logo, colors, footer)
- Generated documents stored in S3, linked to source transaction

## Email Sending + Tracking
Transaction-level outbound email:
- Send from system (quote delivery, invoice delivery, PO dispatch, collection notices)
- Track: sent status, recipients, timestamps, opens (if tracked), bounces
- Activity history linked to transaction record, customer/vendor, and contact
- Templates per transaction type, customizable per tenant

## File Structure
```
DryDock/
├── .claude/
│   └── CLAUDE.md          ← this file
├── assets/
│   └── drydock-logo.svg
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── REQUIREMENTS.pdf   ← original spec from Tillster finance
├── db/
│   ├── migrations/        ← sequential, numbered Drizzle migrations
│   └── seeds/             ← dev/test seed data
├── src/
│   ├── core/              ← metadata engine, workflow engine, auth, tenant
│   ├── master/            ← master data CRUD services
│   ├── crm/               ← CRM module
│   ├── q2c/               ← quote-to-cash module
│   ├── p2p/               ← procure-to-pay module
│   ├── ap-portal/         ← AP portal (intake, OCR, coding, matching, console)
│   ├── gl/                ← general ledger, posting engine, financial reports
│   ├── asset/             ← fixed asset management (Phase 2)
│   ├── lease/             ← lease accounting (Phase 3)
│   ├── inventory/         ← inventory management (Phase 2)
│   ├── project/           ← project + work order management (Phase 2)
│   ├── planning/          ← forecasting, budgeting, cash forecasting (Phase 3)
│   ├── integration/       ← integration framework + specific connectors
│   ├── audit/             ← audit logging service
│   ├── workflow/          ← workflow execution engine
│   └── reporting/         ← reporting engine, KPI dashboards (Phase 2)
├── tests/
├── scripts/               ← dev utilities, data migration, seed generators
├── .gitignore
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

## Code Style + Conventions
- TypeScript strict mode, no `any` — use `unknown` and narrow
- Zod for all request validation
- Every service function returns `Result<T, E>` pattern (no throwing for business logic errors)
- Database queries use Drizzle ORM — raw SQL only for complex reporting queries
- All money values stored as integers (cents) — never floating point
- All dates stored as UTC timestamps; display conversion happens in frontend
- Every API endpoint has OpenAPI documentation via decorators
- Error responses follow RFC 7807
- Consistent naming: `camelCase` in code, `snake_case` in database, `kebab-case` in URLs
- No God objects — services are scoped to single domain concerns
- Dependency injection via simple factory pattern (no DI container)

## Session Protocol
When starting a session on DryDock:
1. Check TODO.md for current priorities
2. Check HISTORY.md for recent session context
3. State what you're working on before starting
4. Log completed work to HISTORY.md before ending

## Key Design Decisions Still Open
These should be resolved during initial implementation:
- Drizzle vs Kysely (evaluate both, pick one in first session)
- Redis deployment model (ElastiCache vs self-hosted for dev)
- Exact Textract API usage pattern (sync vs async for different document sizes)
- Email sending service (SES vs SendGrid)
- Full-text search strategy (pg_trgm + tsvector vs external)
- Frontend routing approach (file-based vs explicit)
- Real-time updates approach (WebSocket vs SSE vs polling)
