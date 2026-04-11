import { uuid, text, boolean, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { apSchema, apInvoiceLines } from './ap.js';
import { accounts } from './gl.js';

// ── Coding Suggestions ───────────────────────────────────────────────

export const codingSuggestions = apSchema.table('coding_suggestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  apInvoiceLineId: uuid('ap_invoice_line_id').notNull().references(() => apInvoiceLines.id),
  vendorId: uuid('vendor_id').notNull(),
  descriptionTokens: text('description_tokens').notNull(),
  suggestions: jsonb('suggestions').notNull().default('[]'),
  suggestions: jsonb('suggestions').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Coding Feedback ──────────────────────────────────────────────────

export const codingFeedback = apSchema.table('coding_feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  suggestionId: uuid('suggestion_id').notNull().references(() => codingSuggestions.id),
  apInvoiceLineId: uuid('ap_invoice_line_id').notNull().references(() => apInvoiceLines.id),
  vendorId: uuid('vendor_id').notNull(),
  descriptionTokens: text('description_tokens').notNull(),
  chosenAccountId: uuid('chosen_account_id').notNull().references(() => accounts.id),
  accepted: boolean('accepted').notNull(),
  acceptedRank: integer('accepted_rank'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
