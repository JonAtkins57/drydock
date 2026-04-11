import { uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { q2cSchema } from '../db/schema/q2c.js';

export const creditMemos = q2cSchema.table('credit_memos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  invoiceId: uuid('invoice_id'),
  memoNumber: text('memo_number').notNull(),
  status: text('status').notNull().default('draft'),
  reason: text('reason'),
  totalAmount: integer('total_amount').notNull().default(0),
  arAccountId: uuid('ar_account_id'),
  glPostedAt: timestamp('gl_posted_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  approvedBy: uuid('approved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const creditMemoLines = q2cSchema.table('credit_memo_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  memoId: uuid('memo_id').notNull().references(() => creditMemos.id, { onDelete: 'restrict' }),
  accountId: uuid('account_id').notNull(),
  amount: integer('amount').notNull(),
  description: text('description'),
  lineNumber: integer('line_number').notNull(),
});
