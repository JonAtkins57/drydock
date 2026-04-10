import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { opportunities } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateOpportunityInput,
  UpdateOpportunityInput,
  ListOpportunitiesQuery,
  PaginatedResponse,
  OpportunityStage,
} from './crm.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type OpportunityRow = typeof opportunities.$inferSelect;

export interface PipelineStage {
  stage: OpportunityStage;
  count: number;
  totalExpectedAmount: number;
}

// ── Create Opportunity ─────────────────────────────────────────────

export async function createOpportunity(
  tenantId: string,
  data: CreateOpportunityInput,
  userId: string,
): Promise<Result<OpportunityRow, AppError>> {
  const rows = await db
    .insert(opportunities)
    .values({
      tenantId,
      name: data.name,
      customerId: data.customerId ?? null,
      leadId: data.leadId ?? null,
      stage: data.stage ?? 'prospecting',
      probability: data.probability ?? 0,
      expectedAmount: data.expectedAmount ?? 0,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      assignedTo: data.assignedTo ?? null,
      description: data.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create opportunity' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'opportunity',
    entityId: row.id,
    changes: data as Record<string, unknown>,
  });

  return ok(row);
}

// ── Get Opportunity ────────────────────────────────────────────────

export async function getOpportunity(
  tenantId: string,
  id: string,
): Promise<Result<OpportunityRow, AppError>> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Opportunity '${id}' not found` });
  }

  return ok(row);
}

// ── List Opportunities ─────────────────────────────────────────────

export async function listOpportunities(
  tenantId: string,
  options: ListOpportunitiesQuery,
): Promise<Result<PaginatedResponse<OpportunityRow>, AppError>> {
  const { page, pageSize, stage, customerId, assignedTo } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(opportunities.tenantId, tenantId)];
  if (stage) conditions.push(eq(opportunities.stage, stage));
  if (customerId) conditions.push(eq(opportunities.customerId, customerId));
  if (assignedTo) conditions.push(eq(opportunities.assignedTo, assignedTo));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(whereClause),
    db
      .select()
      .from(opportunities)
      .where(whereClause)
      .orderBy(desc(opportunities.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// ── Update Opportunity ─────────────────────────────────────────────

export async function updateOpportunity(
  tenantId: string,
  id: string,
  data: UpdateOpportunityInput,
  userId: string,
): Promise<Result<OpportunityRow, AppError>> {
  const existing = await getOpportunity(tenantId, id);
  if (!existing.ok) return existing;

  const updateData: Record<string, unknown> = { ...data, updatedBy: userId, updatedAt: new Date() };

  // Convert expectedCloseDate string to Date if present
  if (data.expectedCloseDate !== undefined) {
    updateData['expectedCloseDate'] = data.expectedCloseDate
      ? new Date(data.expectedCloseDate)
      : null;
  }

  const rows = await db
    .update(opportunities)
    .set(updateData)
    .where(and(eq(opportunities.id, id), eq(opportunities.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to update opportunity' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'opportunity',
    entityId: id,
    changes: { before: existing.value, after: data },
  });

  return ok(row);
}

// ── Pipeline ───────────────────────────────────────────────────────

export async function getPipeline(
  tenantId: string,
): Promise<Result<PipelineStage[], AppError>> {
  const rows = await db
    .select({
      stage: opportunities.stage,
      count: sql<number>`count(*)::int`,
      totalExpectedAmount: sql<number>`coalesce(sum(${opportunities.expectedAmount}), 0)::int`,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.isActive, true),
      ),
    )
    .groupBy(opportunities.stage);

  return ok(rows as PipelineStage[]);
}

export const opportunityService = {
  createOpportunity,
  getOpportunity,
  listOpportunities,
  updateOpportunity,
  getPipeline,
};
