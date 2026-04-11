import { pgSchema, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const reportingSchemaReports = pgSchema('drydock_reporting');

export const savedReports = reportingSchemaReports.table('saved_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  createdBy: uuid('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  source: text('source').notNull(), // e.g. 'journal_entries', 'customers', 'vendors', 'ap_invoices', 'ar_invoices', 'opportunities'
  columns: jsonb('columns').notNull().default([]),  // ReportColumn[]
  filters: jsonb('filters').notNull().default([]),  // ReportFilter[]
  sorts: jsonb('sorts').notNull().default([]),       // ReportSort[]
  isShared: boolean('is_shared').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
