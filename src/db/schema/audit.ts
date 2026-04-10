import { pgSchema, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const auditSchema = pgSchema('drydock_audit');

export const auditLog = auditSchema.table('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  changes: jsonb('changes'),
  ipAddress: text('ip_address'),
  sessionId: text('session_id'),
});
