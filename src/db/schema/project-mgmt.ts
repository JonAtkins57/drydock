import { pgSchema, uuid, text, integer, boolean, timestamp, date } from 'drizzle-orm/pg-core';
// Cross-schema FKs to drydock_master omitted — referenced as uuid() only per master.ts convention

export const projectMgmtSchema = pgSchema('drydock_project_mgmt');

// ── Enums ─────────────────────────────────────────────────────────

export const projectMgmtStatusEnum = projectMgmtSchema.enum('project_mgmt_status', [
  'planning', 'active', 'on_hold', 'completed', 'cancelled',
]);

export const projectPhaseStatusEnum = projectMgmtSchema.enum('project_phase_status', [
  'not_started', 'in_progress', 'completed', 'cancelled',
]);

export const projectTaskStatusEnum = projectMgmtSchema.enum('project_task_status', [
  'todo', 'in_progress', 'review', 'done', 'cancelled',
]);

export const projectTaskPriorityEnum = projectMgmtSchema.enum('project_task_priority', [
  'low', 'normal', 'high', 'urgent',
]);

export const projectResourceTypeEnum = projectMgmtSchema.enum('project_resource_type', [
  'employee', 'contractor', 'equipment', 'material',
]);

// ── Projects Mgmt ─────────────────────────────────────────────────

export const projectsMgmt = projectMgmtSchema.table('projects_mgmt', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectNumber: text('project_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: projectMgmtStatusEnum('status').notNull().default('planning'),
  // FK to drydock_master.customers.id — cross-schema, typed as uuid only
  customerId: uuid('customer_id'),
  // FK to drydock_master.employees.id — cross-schema, typed as uuid only
  managerEmployeeId: uuid('manager_employee_id'),
  // FK to drydock_master.departments.id — cross-schema, typed as uuid only
  departmentId: uuid('department_id'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  budgetCents: integer('budget_cents'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Project Phases ────────────────────────────────────────────────

export const projectPhases = projectMgmtSchema.table('project_phases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => projectsMgmt.id),
  name: text('name').notNull(),
  description: text('description'),
  status: projectPhaseStatusEnum('status').notNull().default('not_started'),
  sortOrder: integer('sort_order').notNull().default(0),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Project Milestones ────────────────────────────────────────────

export const projectMilestones = projectMgmtSchema.table('project_milestones', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => projectsMgmt.id),
  phaseId: uuid('phase_id').references(() => projectPhases.id),
  name: text('name').notNull(),
  description: text('description'),
  dueDate: date('due_date'),
  completedDate: date('completed_date'),
  isBillable: boolean('is_billable').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Project Tasks ─────────────────────────────────────────────────

export const projectTasks = projectMgmtSchema.table('project_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => projectsMgmt.id),
  phaseId: uuid('phase_id').references(() => projectPhases.id),
  milestoneId: uuid('milestone_id').references(() => projectMilestones.id),
  title: text('title').notNull(),
  description: text('description'),
  status: projectTaskStatusEnum('status').notNull().default('todo'),
  priority: projectTaskPriorityEnum('priority').notNull().default('normal'),
  // FK to drydock_master.employees.id — cross-schema, typed as uuid only
  assignedToEmployeeId: uuid('assigned_to_employee_id'),
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  dueDate: date('due_date'),
  completedDate: date('completed_date'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

// ── Project Resources ─────────────────────────────────────────────

export const projectResources = projectMgmtSchema.table('project_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectId: uuid('project_id').notNull().references(() => projectsMgmt.id),
  resourceType: projectResourceTypeEnum('resource_type').notNull(),
  // FK to drydock_master.employees.id — cross-schema, typed as uuid only
  employeeId: uuid('employee_id'),
  name: text('name').notNull(),
  role: text('role'),
  allocationPercent: integer('allocation_percent'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  hourlyRateCents: integer('hourly_rate_cents'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});
