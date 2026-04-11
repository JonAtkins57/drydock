import { pgSchema, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const pricingSchema = pgSchema('drydock_pricing');

// ── Rate Cards ─────────────────────────────────────────────────────

export const rateCards = pricingSchema.table('rate_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  currency: text('currency').notNull().default('USD'),
  isActive: boolean('is_active').notNull().default(true),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Rate Card Tiers ───────────────────────────────────────────────

export const rateCardTiers = pricingSchema.table('rate_card_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  minQuantity: integer('min_quantity').notNull().default(0),
  // null = no upper bound (final tier)
  maxQuantity: integer('max_quantity'),
  unitPriceCents: integer('unit_price_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Pricing Overrides ─────────────────────────────────────────────

export const pricingOverrides = pricingSchema.table('pricing_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  // FK to drydock_master.customers.id — cross-schema, typed as uuid only
  customerId: uuid('customer_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  unitPriceCents: integer('unit_price_cents').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
