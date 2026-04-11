import { uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { integrationSchema, integrationConfigs } from './integration.js';

export const concurExpenseMappings = integrationSchema.table('concur_expense_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  integrationConfigId: uuid('integration_config_id').notNull().references(() => integrationConfigs.id),
  expenseTypeCode: text('expense_type_code').notNull(),
  expenseTypeName: text('expense_type_name'),
  debitAccountId: uuid('debit_account_id').notNull(),
  creditAccountId: uuid('credit_account_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
