import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { annualBudgets, budgetLines, forecasts, accountingPeriods } from '../db/schema/index.js';
import { createJournalEntry } from '../gl/posting.service.js';
import { logAction } from '../core/audit.service.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createBudgetSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  name: z.string().min(1),
  scenario: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  notes: z.string().optional(),
});

const createBudgetLineSchema = z.object({
  departmentId: z.string().uuid(),
  accountId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  description: z.string().optional(),
});

const approveBodySchema = z.object({
  periodId: z.string().uuid().nullish(),
  budgetControlAccountId: z.string().uuid().nullish(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function budgetingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list budgets
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(annualBudgets)
        .where(eq(annualBudgets.tenantId, tenantId)),
      db
        .select()
        .from(annualBudgets)
        .where(eq(annualBudgets.tenantId, tenantId))
        .orderBy(desc(annualBudgets.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);

    return reply.send({
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });

  // POST / — create annual budget
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBudgetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { fiscalYear, name, scenario, notes } = parsed.data;

    const [budget] = await db
      .insert(annualBudgets)
      .values({
        tenantId,
        fiscalYear,
        name,
        scenario,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(budget);
  });

  // GET /:id — get single budget with its lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    const lines = await db
      .select()
      .from(budgetLines)
      .where(and(eq(budgetLines.budgetId, id), eq(budgetLines.tenantId, tenantId)))
      .orderBy(budgetLines.createdAt);

    return reply.send({ ...budget, budget_lines: lines });
  });

  // POST /:id/lines — add a budget line
  fastify.post('/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = createBudgetLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    const { departmentId, accountId, amountCents, description } = parsed.data;

    const [line] = await db
      .insert(budgetLines)
      .values({
        tenantId,
        budgetId: id,
        departmentId,
        accountId,
        amountCents,
        description: description ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(line);
  });

  // GET /:id/variance — per-line variance: forecast vs budget
  fastify.get('/:id/variance', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    // Fetch all budget lines
    const lines = await db
      .select()
      .from(budgetLines)
      .where(and(eq(budgetLines.budgetId, id), eq(budgetLines.tenantId, tenantId)));

    // Fetch forecast sums grouped by department+account for this budget
    const forecastSums = await db
      .select({
        departmentId: forecasts.departmentId,
        accountId: forecasts.accountId,
        totalForecastCents: sql<number>`cast(sum(${forecasts.forecastAmountCents}) as integer)`,
      })
      .from(forecasts)
      .where(
        and(
          eq(forecasts.tenantId, tenantId),
          eq(forecasts.fiscalYear, budget.fiscalYear),
          eq(forecasts.budgetId, id),
        ),
      )
      .groupBy(forecasts.departmentId, forecasts.accountId);

    // Build a lookup map: "deptId:acctId" -> totalForecastCents
    const forecastMap = new Map<string, number>();
    for (const row of forecastSums) {
      forecastMap.set(`${row.departmentId}:${row.accountId}`, row.totalForecastCents ?? 0);
    }

    const varianceRows = lines.map((line) => {
      const forecastAmountCents = forecastMap.get(`${line.departmentId}:${line.accountId}`) ?? 0;
      const variance = forecastAmountCents - line.amountCents;
      return {
        budgetLineId: line.id,
        departmentId: line.departmentId,
        accountId: line.accountId,
        description: line.description,
        budgetAmountCents: line.amountCents,
        forecastAmountCents,
        varianceCents: variance,
      };
    });

    return reply.send({ budgetId: id, fiscalYear: budget.fiscalYear, lines: varianceRows });
  });

  // GET /:id/export — CSV export
  fastify.get('/:id/export', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    const lines = await db
      .select()
      .from(budgetLines)
      .where(and(eq(budgetLines.budgetId, id), eq(budgetLines.tenantId, tenantId)))
      .orderBy(budgetLines.createdAt);

    const csvRows = ['department_id,account_id,amount_cents,description'];
    for (const line of lines) {
      const desc = (line.description ?? '').replace(/"/g, '""');
      csvRows.push(`${line.departmentId},${line.accountId},${line.amountCents},"${desc}"`);
    }
    const csv = csvRows.join('\n');

    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename=budget-${id}.csv`)
      .send(csv);
  });

  // DELETE /:id — void (draft or rejected only)
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    if (budget.status !== 'draft' && budget.status !== 'rejected') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Only draft or rejected budgets can be voided',
      });
    }

    await db
      .update(annualBudgets)
      .set({ status: 'voided', updatedAt: new Date() })
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    await logAction({
      tenantId,
      userId,
      action: 'void',
      entityType: 'annual_budget',
      entityId: id,
      changes: { from: budget.status, to: 'voided' },
    });

    return reply.status(204).send();
  });

  // POST /:id/actions/submit — draft → pending_approval
  fastify.post('/:id/actions/submit', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    if (budget.status !== 'draft') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Budget must be in draft status to submit',
      });
    }

    const [updated] = await db
      .update(annualBudgets)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)))
      .returning();

    await logAction({
      tenantId,
      userId,
      action: 'submit',
      entityType: 'annual_budget',
      entityId: id,
      changes: { from: 'draft', to: 'pending_approval' },
    });

    return reply.send(updated);
  });

  // POST /:id/actions/approve — pending_approval → approved (with optional GL posting)
  fastify.post('/:id/actions/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const bodyParsed = approveBodySchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: bodyParsed.error.flatten().fieldErrors,
      });
    }
    const { periodId: bodyPeriodId, budgetControlAccountId } = bodyParsed.data;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    if (budget.status !== 'pending_approval') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Budget must be in pending_approval status to approve',
      });
    }

    const now = new Date();
    let journalEntryId: string | undefined;

    // Post GL if account mapping is provided (periodId + budgetControlAccountId)
    if (budgetControlAccountId) {
      // Resolve period
      let periodId: string;
      if (bodyPeriodId) {
        const [period] = await db
          .select()
          .from(accountingPeriods)
          .where(
            and(
              eq(accountingPeriods.id, bodyPeriodId),
              eq(accountingPeriods.tenantId, tenantId),
              eq(accountingPeriods.status, 'open'),
            ),
          )
          .limit(1);
        if (!period) {
          return reply.status(422).send({ error: 'VALIDATION', message: 'Supplied period not found or not open' });
        }
        periodId = period.id;
      } else {
        const [openPeriod] = await db
          .select()
          .from(accountingPeriods)
          .where(and(eq(accountingPeriods.tenantId, tenantId), eq(accountingPeriods.status, 'open')))
          .orderBy(desc(accountingPeriods.startDate))
          .limit(1);
        if (!openPeriod) {
          return reply.status(422).send({ error: 'VALIDATION', message: 'No open accounting period' });
        }
        periodId = openPeriod.id;
      }

      const lines = await db
        .select()
        .from(budgetLines)
        .where(and(eq(budgetLines.budgetId, id), eq(budgetLines.tenantId, tenantId)));

      if (lines.length > 0) {
        const totalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
        const glLines = [
          // Debit each expense account per budget line
          ...lines.map((line) => ({
            accountId: line.accountId,
            debitAmount: line.amountCents,
            creditAmount: 0,
            description: line.description ?? undefined,
          })),
          // Credit the budget control account for the total
          {
            accountId: budgetControlAccountId,
            debitAmount: 0,
            creditAmount: totalCents,
            description: `Budget approval: ${budget.name}`,
          },
        ];

        const glResult = await createJournalEntry(
          tenantId,
          {
            journalType: 'automated',
            periodId,
            postingDate: now.toISOString(),
            sourceModule: 'budget',
            sourceEntityType: 'annual_budget',
            sourceEntityId: budget.id,
            description: `Budget approved: ${budget.name} (${budget.fiscalYear})`,
            lines: glLines,
          },
          userId,
        );

        if (!glResult.ok) {
          return reply.status(500).send({ error: 'INTERNAL', message: 'GL posting failed', details: glResult.error });
        }
        journalEntryId = glResult.value.id;
      }
    }

    const [updated] = await db
      .update(annualBudgets)
      .set({ status: 'approved', approvedBy: userId, approvedAt: now, updatedAt: now })
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)))
      .returning();

    await logAction({
      tenantId,
      userId,
      action: 'approve',
      entityType: 'annual_budget',
      entityId: id,
      changes: { from: 'pending_approval', to: 'approved', ...(journalEntryId ? { journalEntryId } : {}) },
    });

    return reply.send(updated);
  });

  // POST /:id/actions/reject — pending_approval → rejected
  fastify.post('/:id/actions/reject', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [budget] = await db
      .select()
      .from(annualBudgets)
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)));

    if (!budget) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Budget not found' });
    }

    if (budget.status !== 'pending_approval') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Budget must be in pending_approval status to reject',
      });
    }

    const [updated] = await db
      .update(annualBudgets)
      .set({ status: 'rejected', rejectedBy: userId, rejectedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(annualBudgets.id, id), eq(annualBudgets.tenantId, tenantId)))
      .returning();

    await logAction({
      tenantId,
      userId,
      action: 'reject',
      entityType: 'annual_budget',
      entityId: id,
      changes: { from: 'pending_approval', to: 'rejected' },
    });

    return reply.send(updated);
  });
}
