import { uuid, text, integer, boolean, timestamp, date } from 'drizzle-orm/pg-core';
import { masterSchema } from './master.js';

// ── Rate Cards ────────────────────────────────────────────────────

export const rateCards = masterSchema.table('rate_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  currency: text('currency').notNull().default('USD'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Rate Card Tiers ───────────────────────────────────────────────

export const rateCardTiers = masterSchema.table('rate_card_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  // minQuantity = 0 means no lower bound (catch-all / flat rate)
  minQuantity: integer('min_quantity').notNull().default(0),
  // maxQuantity = null means unlimited (open-ended top tier)
  maxQuantity: integer('max_quantity'),
  unitPriceCents: integer('unit_price_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Customer Price Overrides ──────────────────────────────────────

export const customerPriceOverrides = masterSchema.table('customer_price_overrides', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  // FK to drydock_master.customers.id — cross-table reference, typed as uuid only
  customerId: uuid('customer_id').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
