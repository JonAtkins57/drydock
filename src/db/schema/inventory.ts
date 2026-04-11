<<<<<<< HEAD
import { pgSchema, uuid, text, numeric, boolean, timestamp, date } from 'drizzle-orm/pg-core';
// Cross-schema FKs to drydock_master omitted — referenced as uuid() only per master.ts convention
=======
import { pgSchema, uuid, text, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';
import { items } from './master.js';
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha

export const inventorySchema = pgSchema('drydock_inventory');

// ── Enums ─────────────────────────────────────────────────────────

<<<<<<< HEAD
export const transactionTypeEnum = inventorySchema.enum('transaction_type', [
  'receipt', 'issue', 'adjustment', 'transfer', 'count',
]);

export const adjustmentStatusEnum = inventorySchema.enum('adjustment_status', [
  'draft', 'posted', 'voided',
=======
export const inventoryTransactionTypeEnum = inventorySchema.enum('inventory_transaction_type', [
  'receipt', 'issue', 'transfer', 'count', 'adjustment',
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
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

<<<<<<< HEAD
// ── Inventory Items (warehouse-level balances) ────────────────────
=======
// ── Inventory Items (balance / valuation per warehouse+item) ──────
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha

export const inventoryItems = inventorySchema.table('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
<<<<<<< HEAD
  // FK to drydock_master.items.id — cross-schema, typed as uuid only
  itemId: uuid('item_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 6 }).notNull().default('0'),
  quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 6 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 6 }).notNull().default('0'),
  totalCost: numeric('total_cost', { precision: 18, scale: 6 }).notNull().default('0'),
  valuationMethod: text('valuation_method').notNull().default('weighted_avg'),
  lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
=======
  itemId: uuid('item_id').notNull().references(() => items.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull().default('0'),
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Inventory Transactions ────────────────────────────────────────

export const inventoryTransactions = inventorySchema.table('inventory_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
<<<<<<< HEAD
  transactionType: transactionTypeEnum('transaction_type').notNull(),
  // FK to drydock_master.items.id — cross-schema, typed as uuid only
  itemId: uuid('item_id').notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  // FK to source warehouse for transfers — within schema
  fromWarehouseId: uuid('from_warehouse_id').references(() => warehouses.id),
  quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 6 }).notNull().default('0'),
  totalCost: numeric('total_cost', { precision: 18, scale: 6 }).notNull().default('0'),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Inventory Adjustments ─────────────────────────────────────────

export const inventoryAdjustments = inventorySchema.table('inventory_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  adjustmentDate: date('adjustment_date').notNull(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  status: adjustmentStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
=======
  transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  // For transfers: the source warehouse
  fromWarehouseId: uuid('from_warehouse_id').references(() => warehouses.id),
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
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
