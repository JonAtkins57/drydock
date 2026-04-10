import { eq, and, sql, asc, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { leads, opportunities } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateLeadInput,
  UpdateLeadInput,
  ListLeadsQuery,
  ConvertLeadInput,
  PaginatedResponse,
} from './crm.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type LeadRow = typeof leads.$inferSelect;
type OpportunityRow = typeof opportunities.$inferSelect;

// ── Create Lead ────────────────────────────────────────────────────

export async function createLead(
  tenantId: string,
  data: CreateLeadInput,
  userId: string,
): Promise<Result<LeadRow, AppError>> {
  const rows = await db
    .insert(leads)
    .values({
      tenantId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      company: data.company ?? null,
      source: data.source ?? null,
      status: 'new',
      assignedTo: data.assignedTo ?? null,
      notes: data.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create lead' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'lead',
    entityId: row.id,
    changes: data as Record<string, unknown>,
  });

  return ok(row);
}

// ── Get Lead ───────────────────────────────────────────────────────

export async function getLead(
  tenantId: string,
  id: string,
): Promise<Result<LeadRow, AppError>> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Lead '${id}' not found` });
  }

  return ok(row);
}

// ── List Leads ─────────────────────────────────────────────────────

export async function listLeads(
  tenantId: string,
  options: ListLeadsQuery,
): Promise<Result<PaginatedResponse<LeadRow>, AppError>> {
  const { page, pageSize, status, assignedTo } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(leads.tenantId, tenantId)];
  if (status) conditions.push(eq(leads.status, status));
  if (assignedTo) conditions.push(eq(leads.assignedTo, assignedTo));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(whereClause),
    db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
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

// ── Update Lead ────────────────────────────────────────────────────

export async function updateLead(
  tenantId: string,
  id: string,
  data: UpdateLeadInput,
  userId: string,
): Promise<Result<LeadRow, AppError>> {
  const existing = await getLead(tenantId, id);
  if (!existing.ok) return existing;

  const updateData: Record<string, unknown> = { ...data, updatedBy: userId, updatedAt: new Date() };

  const rows = await db
    .update(leads)
    .set(updateData)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to update lead' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'lead',
    entityId: id,
    changes: { before: existing.value, after: data },
  });

  return ok(row);
}

// ── Convert Lead to Opportunity ────────────────────────────────────

export async function convertToOpportunity(
  tenantId: string,
  leadId: string,
  opportunityData: ConvertLeadInput,
  userId: string,
): Promise<Result<OpportunityRow, AppError>> {
  // Verify lead exists and is not already converted
  const existing = await getLead(tenantId, leadId);
  if (!existing.ok) return existing;

  if (existing.value.status === 'converted') {
    return err({
      code: 'CONFLICT',
      message: `Lead '${leadId}' is already converted`,
      details: { convertedOpportunityId: existing.value.convertedOpportunityId },
    });
  }

  // Create opportunity linked to lead
  const oppRows = await db
    .insert(opportunities)
    .values({
      tenantId,
      name: opportunityData.name,
      customerId: opportunityData.customerId ?? null,
      leadId,
      stage: opportunityData.stage ?? 'prospecting',
      probability: opportunityData.probability ?? 0,
      expectedAmount: opportunityData.expectedAmount ?? 0,
      expectedCloseDate: opportunityData.expectedCloseDate
        ? new Date(opportunityData.expectedCloseDate)
        : null,
      assignedTo: opportunityData.assignedTo ?? null,
      description: opportunityData.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const opp = oppRows[0];
  if (!opp) {
    return err({ code: 'INTERNAL', message: 'Failed to create opportunity from lead' });
  }

  // Update lead status to converted
  await db
    .update(leads)
    .set({
      status: 'converted',
      convertedOpportunityId: opp.id,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));

  await logAction({
    tenantId,
    userId,
    action: 'convert',
    entityType: 'lead',
    entityId: leadId,
    changes: { opportunityId: opp.id },
  });

  return ok(opp);
}

export const leadService = {
  createLead,
  getLead,
  listLeads,
  updateLead,
  convertToOpportunity,
};
