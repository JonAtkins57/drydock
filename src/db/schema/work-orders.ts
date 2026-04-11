import { pgSchema, uuid, text, integer, boolean, timestamp, date } from 'drizzle-orm/pg-core';
// Cross-schema FKs to drydock_master omitted — referenced as uuid() only per master.ts convention

export const projectSchema = pgSchema('drydock_project');

// ── Enums ─────────────────────────────────────────────────────────

export const workOrderTypeEnum = projectSchema.enum('work_order_type', [
  'maintenance', 'installation', 'repair',
]);

export const workOrderPriorityEnum = projectSchema.enum('work_order_priority', [
  'low', 'normal', 'high', 'urgent',
]);

export const workOrderStatusEnum = projectSchema.enum('work_order_status', [
  'open', 'assigned', 'in_progress', 'completed', 'invoiced',
]);

// ── Work Orders ───────────────────────────────────────────────────

export const workOrders = projectSchema.table('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderNumber: text('work_order_number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  type: workOrderTypeEnum('type').notNull(),
  priority: workOrderPriorityEnum('priority').notNull().default('normal'),
  status: workOrderStatusEnum('status').notNull().default('open'),
  // FK to drydock_master.employees.id — cross-schema, typed as uuid only
  assignedToEmployeeId: uuid('assigned_to_employee_id'),
  assignedTeam: text('assigned_team'),
  // FK to drydock_master.locations.id — cross-schema, typed as uuid only
  locationId: uuid('location_id'),
  // FK to drydock_master.customers.id — cross-schema, typed as uuid only
  customerId: uuid('customer_id'),
  scheduledDate: date('scheduled_date'),
  completedDate: date('completed_date'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Work Order Parts ──────────────────────────────────────────────

export const workOrderParts = projectSchema.table('work_order_parts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id),
  // FK to drydock_master.items.id — nullable for ad-hoc parts
  itemId: uuid('item_id'),
  partName: text('part_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitCostCents: integer('unit_cost_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Work Order Time Logs ──────────────────────────────────────────

export const workOrderTimeLogs = projectSchema.table('work_order_time_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderId: uuid('work_order_id').notNull().references(() => workOrders.id),
  // FK to drydock_master.employees.id — cross-schema, typed as uuid only
  employeeId: uuid('employee_id'),
  loggedDate: date('logged_date').notNull(),
  // Stored as minutes, displayed as hours
  hoursWorked: integer('hours_worked').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});
