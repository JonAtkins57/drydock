import { uuid, text, bigint, timestamp } from 'drizzle-orm/pg-core';
import { q2cSchema } from '../db/schema/q2c.js';

// ── Enums ─────────────────────────────────────────────────────────

export const revRecContractStatusEnum = q2cSchema.enum('rev_rec_contract_status', [
  'draft', 'active', 'completed', 'cancelled',
]);

export const revRecObligationStatusEnum = q2cSchema.enum('rev_rec_obligation_status', [
  'not_started', 'in_progress', 'satisfied', 'cancelled',
]);

export const revRecScheduleStatusEnum = q2cSchema.enum('rev_rec_schedule_status', [
  'scheduled', 'recognized', 'cancelled',
]);

// ── Tables ────────────────────────────────────────────────────────

export const revRecContracts = q2cSchema.table('rev_rec_contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  contractNumber: text('contract_number').notNull(),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  status: revRecContractStatusEnum('status').notNull().default('draft'),
  totalTransactionPrice: bigint('total_transaction_price', { mode: 'number' }).notNull().default(0),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const revRecObligations = q2cSchema.table('rev_rec_performance_obligations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  contractId: uuid('contract_id').notNull().references(() => revRecContracts.id),
  description: text('description').notNull(),
  recognitionMethod: text('recognition_method').notNull(), // 'point_in_time' | 'over_time'
  status: revRecObligationStatusEnum('status').notNull().default('not_started'),
  allocatedPrice: bigint('allocated_price', { mode: 'number' }).notNull().default(0),
  recognizedToDate: bigint('recognized_to_date', { mode: 'number' }).notNull().default(0),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const revRecSchedules = q2cSchema.table('rev_rec_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  obligationId: uuid('obligation_id').notNull().references(() => revRecObligations.id),
  periodId: uuid('period_id'),
  scheduledDate: timestamp('scheduled_date', { withTimezone: true }).notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  scheduledAmount: bigint('scheduled_amount', { mode: 'number' }).notNull().default(0),
  recognizedAmount: bigint('recognized_amount', { mode: 'number' }).notNull().default(0),
  status: revRecScheduleStatusEnum('status').notNull().default('scheduled'),
  journalEntryId: uuid('journal_entry_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
