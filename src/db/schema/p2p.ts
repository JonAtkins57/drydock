import { pgSchema, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const p2pSchema = pgSchema('drydock_p2p');

// ── Enums ─────────────────────────────────────────────────────────

export const requisitionStatusEnum = p2pSchema.enum('requisition_status', [
  'draft', 'pending_approval', 'approved', 'rejected', 'cancelled',
]);

export const poStatusEnum = p2pSchema.enum('po_status', [
  'draft', 'pending_approval', 'approved', 'dispatched', 'received', 'cancelled',
]);

// ── Purchase Requisitions ─────────────────────────────────────────

export const purchaseRequisitions = p2pSchema.table('purchase_requisitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  requisitionNumber: text('requisition_number').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  departmentId: uuid('department_id'),
  status: requisitionStatusEnum('status').notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  notes: text('notes'),
  neededBy: timestamp('needed_by', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Requisition Lines ─────────────────────────────────────────────

export const requisitionLines = p2pSchema.table('requisition_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  requisitionId: uuid('requisition_id').notNull().references(() => purchaseRequisitions.id),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  estimatedUnitPrice: integer('estimated_unit_price').notNull(),
  estimatedAmount: integer('estimated_amount').notNull(),
  accountId: uuid('account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Purchase Orders ───────────────────────────────────────────────

export const purchaseOrders = p2pSchema.table('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  poNumber: text('po_number').notNull(),
  vendorId: uuid('vendor_id').notNull(),
  requisitionId: uuid('requisition_id').references(() => purchaseRequisitions.id),
  status: poStatusEnum('status').notNull().default('draft'),
  totalAmount: integer('total_amount').notNull().default(0),
  orderDate: timestamp('order_date', { withTimezone: true }).notNull(),
  expectedDelivery: timestamp('expected_delivery', { withTimezone: true }),
  notes: text('notes'),
  paymentTermsId: uuid('payment_terms_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── PO Lines ──────────────────────────────────────────────────────

export const poLines = p2pSchema.table('po_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  lineNumber: integer('line_number').notNull(),
  itemId: uuid('item_id'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  amount: integer('amount').notNull(),
  accountId: uuid('account_id'),
  receivedQuantity: integer('received_quantity').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Goods Receipts ────────────────────────────────────────────────

export const goodsReceipts = p2pSchema.table('goods_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  receiptNumber: text('receipt_number').notNull(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  receivedBy: uuid('received_by').notNull(),
  receiptDate: timestamp('receipt_date', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Receipt Lines ─────────────────────────────────────────────────

export const receiptLines = p2pSchema.table('receipt_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  receiptId: uuid('receipt_id').notNull().references(() => goodsReceipts.id),
  poLineId: uuid('po_line_id').notNull().references(() => poLines.id),
  quantityReceived: integer('quantity_received').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
