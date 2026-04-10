import { eq, and, sql, desc, lte, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { billingPlans, billingScheduleLines, invoices, invoiceLines } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateBillingPlanInput,
  ListBillingPlansQuery,
  PaginatedResponse,
} from './q2c.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type BillingPlanRow = typeof billingPlans.$inferSelect;
type ScheduleLineRow = typeof billingScheduleLines.$inferSelect;

interface BillingPlanWithSchedule extends BillingPlanRow {
  scheduleLines: ScheduleLineRow[];
}

// ── Schedule Generation ────────────────────────────────────────────

function generateSchedule(
  tenantId: string,
  planId: string,
  plan: {
    frequency: string;
    startDate: Date;
    endDate: Date | null;
    totalAmount: number;
    billingMethod: string;
  },
): Array<{
  tenantId: string;
  billingPlanId: string;
  lineNumber: number;
  billingDate: Date;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: 'scheduled';
  description: string;
}> {
  const lines: Array<{
    tenantId: string;
    billingPlanId: string;
    lineNumber: number;
    billingDate: Date;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    status: 'scheduled';
    description: string;
  }> = [];

  const start = new Date(plan.startDate);
  const end = plan.endDate ? new Date(plan.endDate) : null;

  if (plan.frequency === 'one_time') {
    lines.push({
      tenantId,
      billingPlanId: planId,
      lineNumber: 1,
      billingDate: plan.billingMethod === 'advance' ? start : (end ?? start),
      periodStart: start,
      periodEnd: end ?? start,
      amount: plan.totalAmount,
      status: 'scheduled',
      description: 'One-time billing',
    });
    return lines;
  }

  // Recurring: monthly, quarterly, annual
  const monthsIncrement =
    plan.frequency === 'monthly' ? 1 :
    plan.frequency === 'quarterly' ? 3 :
    12; // annual

  let periodStart = new Date(start);
  let lineNum = 1;
  const maxIterations = 120; // safety: 10 years monthly

  // If no end date, generate 12 periods by default
  const effectiveEnd = end ?? new Date(start);
  if (!end) {
    effectiveEnd.setMonth(effectiveEnd.getMonth() + monthsIncrement * 12);
  }

  while (periodStart < effectiveEnd && lineNum <= maxIterations) {
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + monthsIncrement);
    if (periodEnd > effectiveEnd) {
      periodEnd.setTime(effectiveEnd.getTime());
    }

    // Calculate amount per period
    // For recurring, divide total evenly across periods
    const totalPeriods = Math.ceil(
      (effectiveEnd.getTime() - start.getTime()) /
      (monthsIncrement * 30 * 24 * 60 * 60 * 1000),
    );
    const periodAmount = Math.round(plan.totalAmount / Math.max(totalPeriods, 1));

    const billingDate = plan.billingMethod === 'advance'
      ? new Date(periodStart)
      : new Date(periodEnd);

    lines.push({
      tenantId,
      billingPlanId: planId,
      lineNumber: lineNum,
      billingDate,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      amount: periodAmount,
      status: 'scheduled',
      description: `Period ${lineNum}: ${periodStart.toISOString().split('T')[0]} - ${periodEnd.toISOString().split('T')[0]}`,
    });

    periodStart = new Date(periodEnd);
    lineNum++;
  }

  return lines;
}

// ── Create Billing Plan ────────────────────────────────────────────

async function createBillingPlan(
  tenantId: string,
  data: CreateBillingPlanInput,
  userId: string,
): Promise<Result<BillingPlanWithSchedule, AppError>> {
  const rows = await db
    .insert(billingPlans)
    .values({
      tenantId,
      customerId: data.customerId,
      name: data.name,
      planType: data.planType,
      billingMethod: data.billingMethod,
      frequency: data.frequency,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: 'active',
      totalAmount: data.totalAmount,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const plan = rows[0];
  if (!plan) return err({ code: 'INTERNAL', message: 'Failed to create billing plan' });

  // Generate schedule lines
  const scheduleData = generateSchedule(tenantId, plan.id, {
    frequency: data.frequency,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    totalAmount: data.totalAmount,
    billingMethod: data.billingMethod,
  });

  let scheduleLines: ScheduleLineRow[] = [];
  if (scheduleData.length > 0) {
    scheduleLines = await db.insert(billingScheduleLines).values(scheduleData).returning();
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'billing_plan',
    entityId: plan.id,
    changes: { name: data.name, scheduleLineCount: scheduleLines.length },
  });

  return ok({ ...plan, scheduleLines });
}

// ── Get Billing Plan ───────────────────────────────────────────────

async function getBillingPlan(
  tenantId: string,
  id: string,
): Promise<Result<BillingPlanWithSchedule, AppError>> {
  const rows = await db
    .select()
    .from(billingPlans)
    .where(and(eq(billingPlans.id, id), eq(billingPlans.tenantId, tenantId)))
    .limit(1);

  const plan = rows[0];
  if (!plan) return err({ code: 'NOT_FOUND', message: `Billing plan '${id}' not found` });

  const scheduleLines = await db
    .select()
    .from(billingScheduleLines)
    .where(and(eq(billingScheduleLines.billingPlanId, id), eq(billingScheduleLines.tenantId, tenantId)));

  return ok({ ...plan, scheduleLines });
}

// ── List Billing Plans ─────────────────────────────────────────────

async function listBillingPlans(
  tenantId: string,
  options: ListBillingPlansQuery,
): Promise<Result<PaginatedResponse<BillingPlanRow>, AppError>> {
  const { page, pageSize, status, customerId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(billingPlans.tenantId, tenantId)];
  if (status) conditions.push(eq(billingPlans.status, status));
  if (customerId) conditions.push(eq(billingPlans.customerId, customerId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(billingPlans).where(whereClause),
    db.select().from(billingPlans).where(whereClause).orderBy(desc(billingPlans.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Process Scheduled Billing ──────────────────────────────────────

interface ProcessedBillingResult {
  invoicesCreated: number;
  errors: string[];
}

async function processScheduledBilling(
  tenantId: string,
): Promise<Result<ProcessedBillingResult, AppError>> {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Find all scheduled lines due today or earlier
  const dueLines = await db
    .select()
    .from(billingScheduleLines)
    .where(
      and(
        eq(billingScheduleLines.tenantId, tenantId),
        eq(billingScheduleLines.status, 'scheduled'),
        lte(billingScheduleLines.billingDate, today),
      ),
    );

  let invoicesCreated = 0;
  const errors: string[] = [];

  for (const line of dueLines) {
    try {
      // Look up the billing plan to get customer info
      const planRows = await db
        .select()
        .from(billingPlans)
        .where(and(eq(billingPlans.id, line.billingPlanId), eq(billingPlans.tenantId, tenantId)))
        .limit(1);

      const plan = planRows[0];
      if (!plan) {
        errors.push(`Billing plan ${line.billingPlanId} not found for schedule line ${line.id}`);
        continue;
      }

      // Generate invoice
      const invNumResult = await generateNumber(tenantId, 'invoice');
      if (!invNumResult.ok) {
        errors.push(`Number generation failed for schedule line ${line.id}: ${invNumResult.error.message}`);
        continue;
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invRows = await db
        .insert(invoices)
        .values({
          tenantId,
          invoiceNumber: invNumResult.value,
          customerId: plan.customerId,
          status: 'draft',
          totalAmount: line.amount,
          taxAmount: 0,
          dueDate,
          notes: line.description,
          createdBy: plan.createdBy,
          updatedBy: plan.createdBy,
        })
        .returning();

      const inv = invRows[0];
      if (!inv) {
        errors.push(`Failed to create invoice for schedule line ${line.id}`);
        continue;
      }

      // Create invoice line
      await db.insert(invoiceLines).values({
        tenantId,
        invoiceId: inv.id,
        lineNumber: 1,
        description: line.description ?? `Billing period ${line.lineNumber}`,
        quantity: 1,
        unitPrice: line.amount,
        amount: line.amount,
      });

      // Update schedule line status
      await db
        .update(billingScheduleLines)
        .set({ status: 'invoiced', invoiceId: inv.id, updatedAt: new Date() })
        .where(eq(billingScheduleLines.id, line.id));

      invoicesCreated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Error processing schedule line ${line.id}: ${msg}`);
    }
  }

  return ok({ invoicesCreated, errors });
}

export const billingService = {
  createBillingPlan,
  getBillingPlan,
  listBillingPlans,
  processScheduledBilling,
};
