import { pgSchema, uuid, text, boolean, integer, timestamp, numeric } from 'drizzle-orm/pg-core';

// Rate cards live in drydock_master — they are master data (not transactional)
export const masterSchema2 = pgSchema('drydock_master');

// ── Rate Cards ─────────────────────────────────────────────────────

export const rateCards = masterSchema2.table('rate_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  currency: text('currency').notNull().default('USD'),
  // null = global rate card; set = customer-specific override
  customerId: uuid('customer_id'),
  status: text('status').notNull().default('draft'), // draft | active | expired | archived
  description: text('description'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Rate Card Lines ────────────────────────────────────────────────

export const rateCardLines = masterSchema2.table('rate_card_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  rateCardId: uuid('rate_card_id').notNull().references(() => rateCards.id),
  // FK to drydock_master.items.id — cross-schema reference typed as uuid only
  itemId: uuid('item_id'),
  itemCode: text('item_code'),
  description: text('description').notNull(),
  unitOfMeasure: text('unit_of_measure'),
  // All prices stored as integer cents — never float
  unitPriceCents: integer('unit_price_cents').notNull(),
  discountPercent: numeric('discount_percent', { precision: 7, scale: 4 }),
  minQuantity: numeric('min_quantity', { precision: 15, scale: 4 }),
  maxQuantity: numeric('max_quantity', { precision: 15, scale: 4 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
