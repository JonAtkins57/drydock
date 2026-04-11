import { pgSchema, uuid, text, integer, bigint, boolean, timestamp, date } from 'drizzle-orm/pg-core';

export const assetSchema = pgSchema('drydock_asset');

// ── Enums ─────────────────────────────────────────────────────────

export const assetClassEnum = assetSchema.enum('asset_class', [
  'land', 'building', 'equipment', 'vehicle', 'furniture', 'software', 'other',
]);

export const depreciationMethodEnum = assetSchema.enum('depreciation_method', [
  'straight_line', 'declining_balance', 'units_of_production',
]);

export const assetStatusEnum = assetSchema.enum('asset_status', [
  'active', 'disposed', 'fully_depreciated',
]);

export const bookTypeEnum = assetSchema.enum('book_type', [
  'tax', 'gaap', 'internal',
]);

export const disposalTypeEnum = assetSchema.enum('disposal_type', [
  'sale', 'scrap', 'donation', 'write_off',
]);

// ── Fixed Assets ──────────────────────────────────────────────────

export const fixedAssets = assetSchema.table('fixed_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  assetNumber: text('asset_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  assetClass: assetClassEnum('asset_class').notNull(),
  status: assetStatusEnum('status').notNull().default('active'),
  acquisitionDate: timestamp('acquisition_date', { withTimezone: true }).notNull(),
  acquisitionCost: bigint('acquisition_cost', { mode: 'number' }).notNull(),
  salvageValue: bigint('salvage_value', { mode: 'number' }).notNull().default(0),
  usefulLifeMonths: integer('useful_life_months').notNull(),
  depreciationMethod: depreciationMethodEnum('depreciation_method').notNull(),
  accumulatedDepreciation: bigint('accumulated_depreciation', { mode: 'number' }).notNull().default(0),
  netBookValue: bigint('net_book_value', { mode: 'number' }).notNull(),
  disposalDate: timestamp('disposal_date', { withTimezone: true }),
  disposalProceeds: bigint('disposal_proceeds', { mode: 'number' }),
  locationId: uuid('location_id'),
  departmentId: uuid('department_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Asset Depreciation Books ──────────────────────────────────────

export const assetDepreciationBooks = assetSchema.table('asset_depreciation_books', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  assetId: uuid('asset_id').notNull().references(() => fixedAssets.id),
  bookType: bookTypeEnum('book_type').notNull(),
  periodDate: date('period_date').notNull(),
  beginningBookValue: bigint('beginning_book_value', { mode: 'number' }).notNull(),
  depreciationExpense: bigint('depreciation_expense', { mode: 'number' }).notNull(),
  accumulatedDepreciation: bigint('accumulated_depreciation', { mode: 'number' }).notNull(),
  endingBookValue: bigint('ending_book_value', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Asset Disposals ───────────────────────────────────────────────

export const assetDisposals = assetSchema.table('asset_disposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  assetId: uuid('asset_id').notNull().references(() => fixedAssets.id),
  disposalType: disposalTypeEnum('disposal_type').notNull(),
  disposalDate: timestamp('disposal_date', { withTimezone: true }).notNull(),
  proceedsAmount: bigint('proceeds_amount', { mode: 'number' }).notNull().default(0),
  netBookValueAtDisposal: bigint('net_book_value_at_disposal', { mode: 'number' }).notNull(),
  gainLossAmount: bigint('gain_loss_amount', { mode: 'number' }).notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
