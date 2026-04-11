import { eq, and, sql, asc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  recurringJournalTemplates,
  recurringJournalTemplateLines,
} from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateRecurringTemplateInput,
  CreateRecurringTemplateLineInput,
  UpdateRecurringTemplateInput,
  ListRecurringTemplatesQuery,
} from './gl.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type RecurringTemplate = typeof recurringJournalTemplates.$inferSelect;
type RecurringTemplateLine = typeof recurringJournalTemplateLines.$inferSelect;

interface RecurringTemplateWithLines extends RecurringTemplate {
  lines: RecurringTemplateLine[];
}

interface PaginatedTemplates {
  data: RecurringTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Create Template ────────────────────────────────────────────────

export async function createTemplate(
  tenantId: string,
  data: CreateRecurringTemplateInput,
  userId: string,
): Promise<Result<RecurringTemplate, AppError>> {
  const [template] = await db
    .insert(recurringJournalTemplates)
    .values({
      tenantId,
      name: data.name,
      description: data.description ?? null,
      frequency: data.frequency,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      nextRunDate: new Date(data.startDate),
      autoPost: data.autoPost,
      createReversal: data.createReversal,
      status: 'active',
      notificationEmails: data.notificationEmails,
      generatedCount: 0,
      createdBy: userId,
    })
    .returning();

  if (!template) {
    return err({ code: 'INTERNAL', message: 'Failed to create recurring journal template' });
  }

  return ok(template);
}

// ── Add Template Line ──────────────────────────────────────────────

export async function addTemplateLine(
  tenantId: string,
  templateId: string,
  data: CreateRecurringTemplateLineInput,
): Promise<Result<RecurringTemplateLine, AppError>> {
  // Verify template belongs to tenant
  const [template] = await db
    .select({ id: recurringJournalTemplates.id })
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.tenantId, tenantId),
        eq(recurringJournalTemplates.id, templateId),
      ),
    )
    .limit(1);

  if (!template) {
    return err({ code: 'NOT_FOUND', message: 'Recurring journal template not found' });
  }

  // Compute next sort_order
  const [maxSort] = await db
    .select({ maxSort: sql<number>`COALESCE(MAX(sort_order), 0)` })
    .from(recurringJournalTemplateLines)
    .where(eq(recurringJournalTemplateLines.templateId, templateId));

  const sortOrder = (maxSort?.maxSort ?? 0) + 1;

  const [line] = await db
    .insert(recurringJournalTemplateLines)
    .values({
      templateId,
      tenantId,
      accountId: data.accountId,
      debitAmount: data.debitAmount,
      creditAmount: data.creditAmount,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
      locationId: data.locationId ?? null,
      customerId: data.customerId ?? null,
      vendorId: data.vendorId ?? null,
      projectId: data.projectId ?? null,
      costCenterId: data.costCenterId ?? null,
      entityId: data.entityId ?? null,
      customDimensions: data.customDimensions ?? null,
      isActive: true,
      sortOrder,
    })
    .returning();

  if (!line) {
    return err({ code: 'INTERNAL', message: 'Failed to create template line' });
  }

  return ok(line);
}

// ── List Templates ─────────────────────────────────────────────────

export async function listTemplates(
  tenantId: string,
  options: ListRecurringTemplatesQuery,
): Promise<Result<PaginatedTemplates, AppError>> {
  const conditions = [eq(recurringJournalTemplates.tenantId, tenantId)];

  if (options.status) {
    conditions.push(eq(recurringJournalTemplates.status, options.status));
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recurringJournalTemplates)
    .where(where);

  const total = countResult?.count ?? 0;
  const offset = (options.page - 1) * options.pageSize;

  const data = await db
    .select()
    .from(recurringJournalTemplates)
    .where(where)
    .orderBy(asc(recurringJournalTemplates.createdAt))
    .limit(options.pageSize)
    .offset(offset);

  return ok({ data, total, page: options.page, pageSize: options.pageSize });
}

// ── Get Template (with lines) ──────────────────────────────────────

export async function getTemplate(
  tenantId: string,
  id: string,
): Promise<Result<RecurringTemplateWithLines, AppError>> {
  const [template] = await db
    .select()
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.tenantId, tenantId),
        eq(recurringJournalTemplates.id, id),
      ),
    )
    .limit(1);

  if (!template) {
    return err({ code: 'NOT_FOUND', message: 'Recurring journal template not found' });
  }

  const lines = await db
    .select()
    .from(recurringJournalTemplateLines)
    .where(
      and(
        eq(recurringJournalTemplateLines.templateId, id),
        eq(recurringJournalTemplateLines.isActive, true),
      ),
    )
    .orderBy(asc(recurringJournalTemplateLines.sortOrder));

  return ok({ ...template, lines });
}

// ── Update Template ────────────────────────────────────────────────

export async function updateTemplate(
  tenantId: string,
  id: string,
  data: UpdateRecurringTemplateInput,
): Promise<Result<RecurringTemplate, AppError>> {
  const [existing] = await db
    .select({ id: recurringJournalTemplates.id })
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.tenantId, tenantId),
        eq(recurringJournalTemplates.id, id),
      ),
    )
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: 'Recurring journal template not found' });
  }

  const updateValues: Partial<typeof recurringJournalTemplates.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.description !== undefined) {
    updateValues.description = data.description ?? null;
  }
  if (data.notificationEmails !== undefined) {
    updateValues.notificationEmails = data.notificationEmails;
  }
  if (data.endDate !== undefined) {
    updateValues.endDate = data.endDate ? new Date(data.endDate) : null;
  }
  if (data.status !== undefined) {
    updateValues.status = data.status;
  }

  const [updated] = await db
    .update(recurringJournalTemplates)
    .set(updateValues)
    .where(
      and(
        eq(recurringJournalTemplates.tenantId, tenantId),
        eq(recurringJournalTemplates.id, id),
      ),
    )
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update template' });
  }

  return ok(updated);
}

// ── Delete Template Line (soft) ────────────────────────────────────

export async function deleteTemplateLine(
  tenantId: string,
  templateId: string,
  lineId: string,
): Promise<Result<{ id: string }, AppError>> {
  // Verify template belongs to tenant
  const [template] = await db
    .select({ id: recurringJournalTemplates.id })
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.tenantId, tenantId),
        eq(recurringJournalTemplates.id, templateId),
      ),
    )
    .limit(1);

  if (!template) {
    return err({ code: 'NOT_FOUND', message: 'Recurring journal template not found' });
  }

  const [line] = await db
    .select({ id: recurringJournalTemplateLines.id })
    .from(recurringJournalTemplateLines)
    .where(
      and(
        eq(recurringJournalTemplateLines.id, lineId),
        eq(recurringJournalTemplateLines.templateId, templateId),
        eq(recurringJournalTemplateLines.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!line) {
    return err({ code: 'NOT_FOUND', message: 'Template line not found' });
  }

  await db
    .update(recurringJournalTemplateLines)
    .set({ isActive: false })
    .where(eq(recurringJournalTemplateLines.id, lineId));

  return ok({ id: lineId });
}
