import { pgSchema, uuid, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const leaseSchema = pgSchema('drydock_lease');

// ── Enums ─────────────────────────────────────────────────────────

export const leaseTypeEnum = leaseSchema.enum('lease_type', [
  'operating', 'finance',
]);

export const leaseStatusEnum = leaseSchema.enum('lease_status', [
  'draft', 'active', 'terminated', 'expired',
]);

export const paymentFrequencyEnum = leaseSchema.enum('payment_frequency', [
  'monthly', 'quarterly', 'annual',
]);

export const leasePaymentStatusEnum = leaseSchema.enum('lease_payment_status', [
  'scheduled', 'paid', 'missed',
]);

// ── Lease Contracts ───────────────────────────────────────────────

export const leaseContracts = leaseSchema.table('lease_contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  leaseNumber: text('lease_number').notNull(),
  lessorName: text('lessor_name'),
  assetDescription: text('asset_description').notNull(),
  leaseType: leaseTypeEnum('lease_type').notNull().default('operating'),
  status: leaseStatusEnum('status').notNull().default('draft'),
  commencementDate: timestamp('commencement_date', { withTimezone: true }).notNull(),
  leaseEndDate: timestamp('lease_end_date', { withTimezone: true }).notNull(),
  leaseTermMonths: integer('lease_term_months').notNull(),
  paymentAmount: integer('payment_amount').notNull(),
  paymentFrequency: paymentFrequencyEnum('payment_frequency').notNull().default('monthly'),
  // Discount rate stored as basis points (100 = 1.00%)
  discountRate: integer('discount_rate').notNull().default(0),
  // ROU asset and lease liability initial values in cents
  rouAssetAmount: integer('rou_asset_amount').notNull().default(0),
  leaseLiabilityAmount: integer('lease_liability_amount').notNull().default(0),
  rouAccountId: uuid('rou_account_id'),
  liabilityAccountId: uuid('liability_account_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Lease Payments ────────────────────────────────────────────────

export const leasePayments = leaseSchema.table('lease_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  leaseContractId: uuid('lease_contract_id').notNull().references(() => leaseContracts.id),
  paymentNumber: integer('payment_number').notNull(),
  paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
  paymentAmount: integer('payment_amount').notNull(),
  principalPortion: integer('principal_portion').notNull(),
  interestPortion: integer('interest_portion').notNull(),
  openingBalance: integer('opening_balance').notNull(),
  closingBalance: integer('closing_balance').notNull(),
  status: leasePaymentStatusEnum('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Lease Amortization Schedule ───────────────────────────────────

export const leaseAmortizationSchedule = leaseSchema.table('lease_amortization_schedule', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  leaseContractId: uuid('lease_contract_id').notNull().references(() => leaseContracts.id),
  periodDate: timestamp('period_date', { withTimezone: true }).notNull(),
  beginningLiability: integer('beginning_liability').notNull(),
  paymentAmount: integer('payment_amount').notNull(),
  interestExpense: integer('interest_expense').notNull(),
  principalReduction: integer('principal_reduction').notNull(),
  endingLiability: integer('ending_liability').notNull(),
  rouAmortization: integer('rou_amortization').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
