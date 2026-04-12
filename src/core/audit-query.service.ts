import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { auditLog } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface AuditQueryParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function queryAuditLog(
  tenantId: string,
  params: AuditQueryParams,
): Promise<Result<{ data: typeof auditLog.$inferSelect[]; total: number }, AppError>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  try {
    const conditions = [eq(auditLog.tenantId, tenantId)];
    if (params.entityType) conditions.push(eq(auditLog.entityType, params.entityType));
    if (params.entityId) conditions.push(eq(auditLog.entityId, params.entityId));
    if (params.userId) conditions.push(eq(auditLog.userId, params.userId));
    if (params.action) conditions.push(eq(auditLog.action, params.action));
    if (params.from) conditions.push(gte(auditLog.timestamp, params.from));
    if (params.to) conditions.push(lte(auditLog.timestamp, params.to));

    const where = and(...conditions);

    const [countResult, rows] = await Promise.all([
      db.select({ count: auditLog.id }).from(auditLog).where(where),
      db.select().from(auditLog).where(where)
        .orderBy(desc(auditLog.timestamp))
        .limit(pageSize)
        .offset(offset),
    ]);

    return ok({ data: rows, total: countResult.length });
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to query audit log', details: { error: e } });
  }
}
