import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { revRecContracts, revRecObligations, revRecSchedules, accountingPeriods } from '../db/schema/index.js';
import { createJournalEntry } from '../gl/posting.service.js';
import { generateNumber } from '../core/numbering.service.js';
import type { AppError } from '../lib/result.js';

// ── Error helper ───────────────────────────────────────────────────

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  const status = STATUS_MAP[error.code] ?? 500;
  return reply.status(status).send({
    error: error.code,
    message: error.message,
    details: error.details,
  });
}

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createContractSchema = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().nullish(),
  totalTransactionPrice: z.number().int().min(0).default(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullish(),
  notes: z.string().nullish(),
});

const updateContractSchema = z.object({
  totalTransactionPrice: z.number().int().min(0).optional(),
  endDate: z.string().datetime().nullish(),
  notes: z.string().nullish(),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']).optional(),
});

const obligationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  contractId: z.string().uuid().optional(),
});

const createObligationSchema = z.object({
  contractId: z.string().uuid(),
  description: z.string().min(1),
  recognitionMethod: z.enum(['point_in_time', 'over_time']),
  allocatedPrice: z.number().int().min(0).default(0),
  startDate: z.string().datetime().nullish(),
  endDate: z.string().datetime().nullish(),
});

const contractRecognizeBodySchema = z.object({
  obligationId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  revenueAccountId: z.string().uuid(),
  deferredRevenueAccountId: z.string().uuid(),
  periodId: z.string().uuid().nullish(),
  amount: z.number().int().positive().nullish(),
});

const recognizeBodySchema = z.object({
  scheduleId: z.string().uuid(),
  revenueAccountId: z.string().uuid(),
  deferredRevenueAccountId: z.string().uuid(),
  periodId: z.string().uuid().nullish(),
  amount: z.number().int().positive().nullish(),
});

const scheduleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  obligationId: z.string().uuid().optional(),
});

const createScheduleSchema = z.object({
  obligationId: z.string().uuid(),
  scheduledDate: z.string().datetime(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  scheduledAmount: z.number().int().min(0),
  periodId: z.string().uuid().nullish(),
});

// ── Contract Routes ────────────────────────────────────────────────

async function contractRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list contracts
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
      db.select({ value: count() }).from(revRecContracts).where(eq(revRecContracts.tenantId, tenantId)),
      db
        .select()
        .from(revRecContracts)
        .where(eq(revRecContracts.tenantId, tenantId))
        .orderBy(desc(revRecContracts.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // GET /:id — get single contract
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [row] = await db
      .select()
      .from(revRecContracts)
      .where(and(eq(revRecContracts.id, id), eq(revRecContracts.tenantId, tenantId)))
      .limit(1);

    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rev rec contract not found' });
    return reply.send(row);
  });

  // POST / — create contract
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { customerId, orderId, totalTransactionPrice, startDate, endDate, notes } = parsed.data;

    const numResult = await generateNumber(tenantId, 'rev_rec_contract');
    if (!numResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: numResult.error.message });
    }

    const [contract] = await db
      .insert(revRecContracts)
      .values({
        tenantId,
        contractNumber: numResult.value,
        customerId,
        orderId: orderId ?? null,
        status: 'draft',
        totalTransactionPrice: totalTransactionPrice ?? 0,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        notes: notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return reply.status(201).send(contract);
  });

  // PATCH /:id — update contract
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(revRecContracts)
      .where(and(eq(revRecContracts.id, id), eq(revRecContracts.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rev rec contract not found' });
    }

    const updates: Partial<typeof revRecContracts.$inferInsert> = { updatedAt: new Date(), updatedBy: userId };
    if (parsed.data.totalTransactionPrice !== undefined) updates.totalTransactionPrice = parsed.data.totalTransactionPrice;
    if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const [updated] = await db
      .update(revRecContracts)
      .set(updates)
      .where(and(eq(revRecContracts.id, id), eq(revRecContracts.tenantId, tenantId)))
      .returning();

    return reply.send(updated);
  });

  // POST /:id/recognize — recognize revenue for a schedule line under this contract
  fastify.post('/:id/recognize', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id: contractId } = request.params;

    const bodyParsed = contractRecognizeBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: bodyParsed.error.flatten().fieldErrors,
      });
    }

    const { obligationId, scheduleId, revenueAccountId, deferredRevenueAccountId, periodId: bodyPeriodId, amount: bodyAmount } = bodyParsed.data;

    // Verify contract belongs to tenant
    const [contract] = await db
      .select()
      .from(revRecContracts)
      .where(and(eq(revRecContracts.id, contractId), eq(revRecContracts.tenantId, tenantId)))
      .limit(1);

    if (!contract) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rev rec contract not found' });
    }

    // Verify obligation belongs to contract
    const [obligation] = await db
      .select()
      .from(revRecObligations)
      .where(and(eq(revRecObligations.id, obligationId), eq(revRecObligations.contractId, contractId), eq(revRecObligations.tenantId, tenantId)))
      .limit(1);

    if (!obligation) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Performance obligation not found on this contract' });
    }

    if (obligation.status === 'satisfied' || obligation.status === 'cancelled') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: `Cannot recognize revenue for obligation in status: ${obligation.status}`,
      });
    }

    // Verify schedule belongs to obligation
    const [schedule] = await db
      .select()
      .from(revRecSchedules)
      .where(and(eq(revRecSchedules.id, scheduleId), eq(revRecSchedules.obligationId, obligationId)))
      .limit(1);

    if (!schedule) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Schedule line not found' });
    }

    if (schedule.status !== 'scheduled') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: `Schedule line is not in scheduled status (current: ${schedule.status})`,
      });
    }

    const amount = bodyAmount ?? schedule.scheduledAmount;
    if (amount <= 0) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Recognition amount must be positive' });
    }

    // Resolve accounting period
    let periodId: string;
    if (bodyPeriodId) {
      const [suppliedPeriod] = await db
        .select()
        .from(accountingPeriods)
        .where(and(eq(accountingPeriods.id, bodyPeriodId), eq(accountingPeriods.tenantId, tenantId), eq(accountingPeriods.status, 'open')))
        .limit(1);
      if (!suppliedPeriod) {
        return reply.status(422).send({ error: 'VALIDATION', message: 'Supplied period not found or not open' });
      }
      periodId = suppliedPeriod.id;
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

    const now = new Date();
    const glResult = await createJournalEntry(
      tenantId,
      {
        journalType: 'automated',
        periodId,
        postingDate: now.toISOString(),
        sourceModule: 'rev_rec',
        sourceEntityType: 'rev_rec_schedule',
        sourceEntityId: schedule.id,
        description: `Revenue recognition — obligation ${obligation.id}`,
        lines: [
          { accountId: deferredRevenueAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: revenueAccountId, debitAmount: 0, creditAmount: amount },
        ],
      },
      userId,
    );

    if (!glResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: 'GL posting failed', details: glResult.error });
    }

    const journalEntryId = glResult.value.id;

    const [updatedSchedule] = await db
      .update(revRecSchedules)
      .set({ status: 'recognized', recognizedAmount: amount, journalEntryId, updatedAt: now })
      .where(eq(revRecSchedules.id, scheduleId))
      .returning();

    const [updatedObligation] = await db
      .update(revRecObligations)
      .set({
        recognizedToDate: sql`${revRecObligations.recognizedToDate} + ${amount}`,
        updatedAt: now,
      })
      .where(and(eq(revRecObligations.id, obligationId), eq(revRecObligations.tenantId, tenantId)))
      .returning();

    return reply.send({ obligation: updatedObligation, schedule: updatedSchedule });
  });

  // DELETE /:id — cancel (soft delete)
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(revRecContracts)
      .where(and(eq(revRecContracts.id, id), eq(revRecContracts.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rev rec contract not found' });
    }

    await db
      .update(revRecContracts)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(revRecContracts.id, id), eq(revRecContracts.tenantId, tenantId)));

    return reply.status(204).send();
  });
}

// ── Obligation Routes ──────────────────────────────────────────────

async function obligationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list obligations (optionally filtered by contractId)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = obligationListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize, contractId } = query.data;
    const offset = (page - 1) * pageSize;

    const where = contractId
      ? and(eq(revRecObligations.tenantId, tenantId), eq(revRecObligations.contractId, contractId))
      : eq(revRecObligations.tenantId, tenantId);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(revRecObligations).where(where),
      db
        .select()
        .from(revRecObligations)
        .where(where)
        .orderBy(desc(revRecObligations.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // GET /:id — get single obligation
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [row] = await db
      .select()
      .from(revRecObligations)
      .where(and(eq(revRecObligations.id, id), eq(revRecObligations.tenantId, tenantId)))
      .limit(1);

    if (!row) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Performance obligation not found' });
    return reply.send(row);
  });

  // POST / — create obligation
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createObligationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { contractId, description, recognitionMethod, allocatedPrice, startDate, endDate } = parsed.data;

    // Verify contract belongs to tenant
    const [contract] = await db
      .select()
      .from(revRecContracts)
      .where(and(eq(revRecContracts.id, contractId), eq(revRecContracts.tenantId, tenantId)))
      .limit(1);

    if (!contract) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rev rec contract not found' });
    }

    const [obligation] = await db
      .insert(revRecObligations)
      .values({
        tenantId,
        contractId,
        description,
        recognitionMethod,
        status: 'not_started',
        allocatedPrice: allocatedPrice ?? 0,
        recognizedToDate: 0,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      })
      .returning();

    return reply.status(201).send(obligation);
  });

  // POST /:id/actions/recognize — recognize revenue for a scheduled line
  fastify.post('/:id/actions/recognize', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const bodyParsed = recognizeBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: bodyParsed.error.flatten().fieldErrors,
      });
    }

    const { scheduleId, revenueAccountId, deferredRevenueAccountId, periodId: bodyPeriodId, amount: bodyAmount } = bodyParsed.data;

    // Get obligation
    const [obligation] = await db
      .select()
      .from(revRecObligations)
      .where(and(eq(revRecObligations.id, id), eq(revRecObligations.tenantId, tenantId)))
      .limit(1);

    if (!obligation) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Performance obligation not found' });
    }

    if (obligation.status === 'satisfied' || obligation.status === 'cancelled') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: `Cannot recognize revenue for obligation in status: ${obligation.status}`,
      });
    }

    // Get schedule line
    const [schedule] = await db
      .select()
      .from(revRecSchedules)
      .where(and(eq(revRecSchedules.id, scheduleId), eq(revRecSchedules.obligationId, id)))
      .limit(1);

    if (!schedule) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Schedule line not found' });
    }

    if (schedule.status !== 'scheduled') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: `Schedule line is not in scheduled status (current: ${schedule.status})`,
      });
    }

    const amount = bodyAmount ?? schedule.scheduledAmount;
    if (amount <= 0) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Recognition amount must be positive' });
    }

    // Resolve accounting period
    let periodId: string;
    if (bodyPeriodId) {
      const [suppliedPeriod] = await db
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
      if (!suppliedPeriod) {
        return reply.status(422).send({ error: 'VALIDATION', message: 'Supplied period not found or not open' });
      }
      periodId = suppliedPeriod.id;
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

    // Post GL: DR Deferred Revenue, CR Revenue
    const now = new Date();
    const glResult = await createJournalEntry(
      tenantId,
      {
        journalType: 'automated',
        periodId,
        postingDate: now.toISOString(),
        sourceModule: 'rev_rec',
        sourceEntityType: 'rev_rec_schedule',
        sourceEntityId: schedule.id,
        description: `Revenue recognition — obligation ${obligation.id}`,
        lines: [
          { accountId: deferredRevenueAccountId, debitAmount: amount, creditAmount: 0 },
          { accountId: revenueAccountId, debitAmount: 0, creditAmount: amount },
        ],
      },
      userId,
    );

    if (!glResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: 'GL posting failed', details: glResult.error });
    }

    const journalEntryId = glResult.value.id;

    // Update schedule: recognized, set amounts
    const [updatedSchedule] = await db
      .update(revRecSchedules)
      .set({ status: 'recognized', recognizedAmount: amount, journalEntryId, updatedAt: now })
      .where(eq(revRecSchedules.id, scheduleId))
      .returning();

    // Increment obligation.recognized_to_date using SQL template (safe bigint arithmetic)
    const [updatedObligation] = await db
      .update(revRecObligations)
      .set({
        recognizedToDate: sql`${revRecObligations.recognizedToDate} + ${amount}`,
        updatedAt: now,
      })
      .where(and(eq(revRecObligations.id, id), eq(revRecObligations.tenantId, tenantId)))
      .returning();

    return reply.send({ obligation: updatedObligation, schedule: updatedSchedule });
  });
}

// ── Schedule Routes ────────────────────────────────────────────────

async function scheduleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list schedules (optionally filtered by obligationId)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = scheduleListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize, obligationId } = query.data;
    const offset = (page - 1) * pageSize;

    const where = obligationId
      ? and(eq(revRecSchedules.tenantId, tenantId), eq(revRecSchedules.obligationId, obligationId))
      : eq(revRecSchedules.tenantId, tenantId);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(revRecSchedules).where(where),
      db
        .select()
        .from(revRecSchedules)
        .where(where)
        .orderBy(desc(revRecSchedules.scheduledDate))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // POST / — create schedule line
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createScheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { obligationId, scheduledDate, periodStart, periodEnd, scheduledAmount, periodId } = parsed.data;

    // Verify obligation belongs to tenant
    const [obligation] = await db
      .select()
      .from(revRecObligations)
      .where(and(eq(revRecObligations.id, obligationId), eq(revRecObligations.tenantId, tenantId)))
      .limit(1);

    if (!obligation) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Performance obligation not found' });
    }

    const [scheduleLine] = await db
      .insert(revRecSchedules)
      .values({
        tenantId,
        obligationId,
        periodId: periodId ?? null,
        scheduledDate: new Date(scheduledDate),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        scheduledAmount,
        recognizedAmount: 0,
        status: 'scheduled',
      })
      .returning();

    return reply.status(201).send(scheduleLine);
  });
}

// ── Combined Rev Rec Plugin ────────────────────────────────────────

export async function revRecRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(contractRoutes, { prefix: '/contracts' });
  await fastify.register(obligationRoutes, { prefix: '/obligations' });
  await fastify.register(scheduleRoutes, { prefix: '/schedules' });
}
