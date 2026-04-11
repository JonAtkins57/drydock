import { pgSchema, uuid, text, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';
// Cross-schema FKs to drydock_master omitted — referenced as uuid() only per master.ts convention

export const inventorySchema = pgSchema('drydock_inventory');

// ── Enums ─────────────────────────────────────────────────────────

export const inventoryTransactionTypeEnum = inventorySchema.enum('inventory_transaction_type', [
  'receipt', 'issue', 'transfer', 'count', 'adjustment',
]);

// ── Warehouses ────────────────────────────────────────────────────

export const warehouses = inventorySchema.table('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  // FK to drydock_master.locations.id — cross-schema, typed as uuid only
  locationId: uuid('location_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Inventory Items (balance / valuation per warehouse+item) ──────

export const inventoryItems = inventorySchema.table('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  // FK to drydock_master.items.id — cross-schema, typed as uuid only
  itemId: uuid('item_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Inventory Transactions ────────────────────────────────────────

export const inventoryTransactions = inventorySchema.table('inventory_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
  // FK to drydock_master.items.id — cross-schema
  itemId: uuid('item_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull(),
  // For transfers: the source warehouse
  fromWarehouseId: uuid('from_warehouse_id'),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
  // Signed: positive for inbound (receipt/adjustment/count/transfer), negative for issue
  totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull(),
  notes: text('notes'),
  referenceNumber: text('reference_number'),
  transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
