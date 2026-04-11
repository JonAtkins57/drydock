import { pgSchema, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const reportingSchema = pgSchema('drydock_reporting');

export const dashboardLayouts = reportingSchema.table('dashboard_layouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  widgets: jsonb('widgets').notNull().default([]),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
