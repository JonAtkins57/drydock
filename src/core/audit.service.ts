import { db } from '../db/connection.js';
import { auditLog } from '../db/schema/index.js';

export interface LogActionParams {
  tenantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  sessionId?: string;
}

export async function logAction(params: LogActionParams): Promise<void> {
  await db.insert(auditLog).values({
    tenantId: params.tenantId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: params.changes ?? null,
    ipAddress: params.ipAddress ?? null,
    sessionId: params.sessionId ?? null,
  });
}
