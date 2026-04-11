import { pgSchema, uuid, text, integer, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';

export const pricingSchema = pgSchema('drydock_pricing');

// ── Rate Card Status Enum ──────────────────────────────────────────

export const rateCardStatusEnum = pricingSchema.enum('rate_card_status', [
  'draft', 'active', 'archived',
]);

// ── Rate Cards ─────────────────────────────────────────────────────
// A rate card is a versioned price list for items/services.
// Can be global (no customer_id) or customer-specific.

export const rateCards = pricingSchema.table('rate_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  description: text('description'),
  currency: text('currency').notNull().default('USD'),
  status: rateCardStatusEnum('status').notNull().default('draft'),
  // FK to drydock_master.customers.id — cross-schema, typed as uuid only
  customerId: uuid('customer_id'),
  isDefault: boolean('is_default').notNull().default(false),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Rate Card Lines ────────────────────────────────────────────────
// Each line represents the price for one item on a rate card.
// item_id is optional — supports free-form line descriptions.

export const rateCardLines = pricingSchema.table('rate_card_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  // FK to drydock_master.items.id — cross-schema, typed as uuid only
  itemId: uuid('item_id'),
  itemNumber: text('item_number'),
  itemName: text('item_name').notNull(),
  unitOfMeasure: text('unit_of_measure'),
  // Base unit price in cents; 0 = free / to be quoted
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  discountPercent: numeric('discount_percent', { precision: 7, scale: 4 }),
  // Line-level effective date overrides (null = inherits from rate card)
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Pricing Tiers ──────────────────────────────────────────────────
// Tiered pricing per rate card line — e.g. qty 1-10 = $100, 11-50 = $80.
// minQty is inclusive, maxQty is inclusive (null = unlimited).

export const pricingTiers = pricingSchema.table('pricing_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardLineId: uuid('rate_card_line_id').notNull().references(() => rateCardLines.id),
  tierName: text('tier_name'),
  minQty: integer('min_qty').notNull().default(1),
  maxQty: integer('max_qty'), // null = no upper bound
  unitPriceCents: integer('unit_price_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Customer Price Overrides ───────────────────────────────────────
// Customer-specific price exceptions that take precedence over rate card lines.
// References a rate card for context but stores the override price directly.

export const customerPriceOverrides = pricingSchema.table('customer_price_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  // FK to drydock_master.customers.id — cross-schema, typed as uuid only
  customerId: uuid('customer_id').notNull(),
  // FK to drydock_master.items.id — cross-schema, typed as uuid only
  itemId: uuid('item_id').notNull(),
  rateCardId: uuid('rate_card_id').references(() => rateCards.id),
  unitPriceCents: integer('unit_price_cents').notNull(),
  discountPercent: numeric('discount_percent', { precision: 7, scale: 4 }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
