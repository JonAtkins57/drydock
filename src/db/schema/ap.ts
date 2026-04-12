import { pgSchema, uuid, text, boolean, jsonb, integer, bigint, date, timestamp, numeric } from 'drizzle-orm/pg-core';
import { vendors, projects, costCenters, departments } from './master.js';
import { accounts } from './gl.js';

export const apSchema = pgSchema('drydock_ap');

// ── AP Invoices ──────────────────────────────────────────────────────

export const apInvoices = apSchema.table('ap_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  poId: uuid('po_id'),
  status: text('status').notNull().default('intake'),
  invoiceDate: timestamp('invoice_date', { withTimezone: true }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  totalAmount: integer('total_amount'),
  subtotal: integer('subtotal'),
  taxAmount: integer('tax_amount'),
  currency: text('currency').notNull().default('USD'),
  source: text('source').notNull(),
  sourceEmail: text('source_email'),
  attachmentUrl: text('attachment_url'),
  attachmentHash: text('attachment_hash'),
  ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 4 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── AP Invoice Lines ─────────────────────────────────────────────────

export const apInvoiceLines = apSchema.table('ap_invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  apInvoiceId: uuid('ap_invoice_id').notNull().references(() => apInvoices.id),
  lineNumber: integer('line_number').notNull(),
  description: text('description'),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  departmentId: uuid('department_id').references(() => departments.id),
  projectId: uuid('project_id').references(() => projects.id),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── OCR Results ──────────────────────────────────────────────────────

export const ocrResults = apSchema.table('ocr_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  apInvoiceId: uuid('ap_invoice_id').notNull().references(() => apInvoices.id),
  extractedVendor: text('extracted_vendor'),
  extractedInvoiceNumber: text('extracted_invoice_number'),
  extractedDate: text('extracted_date'),
  extractedDueDate: text('extracted_due_date'),
  extractedTotal: text('extracted_total'),
  extractedSubtotal: text('extracted_subtotal'),
  extractedTax: text('extracted_tax'),
  extractedPoNumber: text('extracted_po_number'),
  extractedLineItems: jsonb('extracted_line_items'),
  fieldConfidences: jsonb('field_confidences'),
  rawResponse: jsonb('raw_response'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Coding Rules ─────────────────────────────────────────────────────

export const codingRules = apSchema.table('coding_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  descriptionPattern: text('description_pattern'),
  defaultAccountId: uuid('default_account_id').notNull().references(() => accounts.id),
  defaultDepartmentId: uuid('department_id').references(() => departments.id),
  defaultProjectId: uuid('default_project_id').references(() => projects.id),
  defaultCostCenterId: uuid('default_cost_center_id').references(() => costCenters.id),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  matchCount: integer('match_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Amortization Schedules ───────────────────────────────────────────

export const amortizationSchedules = apSchema.table('amortization_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  apInvoiceId: uuid('ap_invoice_id').references(() => apInvoices.id),
  description: text('description'),
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
  expenseAccountId: uuid('expense_account_id').notNull().references(() => accounts.id),
  prepaidAccountId: uuid('prepaid_account_id').notNull().references(() => accounts.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  frequency: text('frequency').notNull().default('monthly'),
  status: text('status').notNull().default('active'),
  departmentId: uuid('department_id').references(() => departments.id),
  projectId: uuid('project_id').references(() => projects.id),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Amortization Schedule Lines ──────────────────────────────────────

export const amortizationScheduleLines = apSchema.table('amortization_schedule_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  scheduleId: uuid('schedule_id').notNull().references(() => amortizationSchedules.id),
  lineNumber: integer('line_number').notNull(),
  periodDate: date('period_date').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'),
  journalEntryId: uuid('journal_entry_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Duplicate Detections ─────────────────────────────────────────────

export const duplicateDetections = apSchema.table('duplicate_detections', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull().references(() => apInvoices.id),
  matchedInvoiceId: uuid('matched_invoice_id').notNull().references(() => apInvoices.id),
  matchScore: numeric('match_score', { precision: 5, scale: 4 }).notNull(),
  matchReason: text('match_reason').notNull(),
  status: text('status').notNull().default('pending'),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── AP Allocations ───────────────────────────────────────────────────

export const apAllocations = apSchema.table('ap_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull().references(() => apInvoices.id),
  invoiceLineId: uuid('invoice_line_id').references(() => apInvoiceLines.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  departmentId: uuid('department_id').references(() => departments.id),
  projectId: uuid('project_id').references(() => projects.id),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id),
  amountCents: integer('amount_cents').notNull(),
  allocationPct: numeric('allocation_pct', { precision: 7, scale: 4 }),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── PO Match Results ─────────────────────────────────────────────────

export const poMatchResults = apSchema.table('po_match_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  apInvoiceId: uuid('ap_invoice_id').notNull().references(() => apInvoices.id),
  poId: uuid('po_id').notNull(),
  matchType: text('match_type').notNull(),
  matchStatus: text('match_status').notNull(),
  priceVariance: integer('price_variance').notNull().default(0),
  quantityVariance: integer('quantity_variance').notNull().default(0),
  tolerancePercent: numeric('tolerance_percent', { precision: 5, scale: 2 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
