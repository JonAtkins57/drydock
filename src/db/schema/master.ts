import { pgSchema, uuid, text, boolean, jsonb, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const masterSchema = pgSchema('drydock_master');

export const legalEntities = masterSchema.table('legal_entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  currency: text('currency').notNull().default('USD'),
  address: jsonb('address'),
  taxId: text('tax_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const departments = masterSchema.table('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  parentId: uuid('parent_id'),
  managerEmployeeId: uuid('manager_employee_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const locations = masterSchema.table('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  address: jsonb('address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const paymentTerms = masterSchema.table('payment_terms', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  daysDue: integer('days_due').notNull(),
  discountDays: integer('discount_days'),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const taxCodes = masterSchema.table('tax_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const currencies = masterSchema.table('currencies', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimalPlaces: integer('decimal_places').notNull().default(2),
});

export const customers = masterSchema.table('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  customerNumber: text('customer_number').notNull(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  status: text('status').notNull().default('active'),
  billingAddress: jsonb('billing_address'),
  shippingAddress: jsonb('shipping_address'),
  paymentTermsId: uuid('payment_terms_id').references(() => paymentTerms.id),
  taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
  creditLimit: integer('credit_limit'),
  currency: text('currency').notNull().default('USD'),
  parentCustomerId: uuid('parent_customer_id'),
  externalId: text('external_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const vendors = masterSchema.table('vendors', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  vendorNumber: text('vendor_number').notNull(),
  entityId: uuid('entity_id').references(() => legalEntities.id),
  status: text('status').notNull().default('active'),
  remitToAddress: jsonb('remit_to_address'),
  paymentTermsId: uuid('payment_terms_id').references(() => paymentTerms.id),
  taxId: text('tax_id'),
  defaultExpenseAccountId: uuid('default_expense_account_id'),
  currency: text('currency').notNull().default('USD'),
  externalId: text('external_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const contacts = masterSchema.table('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  title: text('title'),
  isPrimary: boolean('is_primary').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const employees = masterSchema.table('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  employeeNumber: text('employee_number').notNull(),
  userId: uuid('user_id'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  departmentId: uuid('department_id').references(() => departments.id),
  managerId: uuid('manager_id'),
  hireDate: timestamp('hire_date', { withTimezone: true }),
  terminationDate: timestamp('termination_date', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  bamboohrId: text('bamboohr_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const items = masterSchema.table('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  itemNumber: text('item_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  itemType: text('item_type').notNull().default('service'),
  unitOfMeasure: text('unit_of_measure'),
  revenueAccountId: uuid('revenue_account_id'),
  expenseAccountId: uuid('expense_account_id'),
  cogsAccountId: uuid('cogs_account_id'),
  standardCost: integer('standard_cost'),
  listPrice: integer('list_price'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const projects = masterSchema.table('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  projectNumber: text('project_number').notNull(),
  name: text('name').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  status: text('status').notNull().default('active'),
  projectType: text('project_type'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  budgetAmount: integer('budget_amount'),
  managerEmployeeId: uuid('manager_employee_id').references(() => employees.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

export const costCenters = masterSchema.table('cost_centers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  departmentId: uuid('department_id').references(() => departments.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
