import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, count } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { creditMemos, creditMemoLines } from './credit-memos.schema.js';
import { accountingPeriods } from '../db/schema/index.js';
import { createJournalEntry } from '../gl/posting.service.js';
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

const createSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullish(),
  memoNumber: z.string().min(1),
  reason: z.string().nullish(),
  totalAmount: z.number().int().min(0).default(0),
  arAccountId: z.string().uuid().nullish(),
});

const updateSchema = z.object({
  reason: z.string().nullish(),
  totalAmount: z.number().int().min(0).optional(),
  arAccountId: z.string().uuid().nullish(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function creditMemoRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list credit memos
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
        .from(creditMemos)
        .where(eq(creditMemos.tenantId, tenantId)),
      db
        .select()
        .from(creditMemos)
        .where(eq(creditMemos.tenantId, tenantId))
        .orderBy(desc(creditMemos.createdAt))
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

  // POST / — create credit memo
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { customerId, invoiceId, memoNumber, reason, totalAmount, arAccountId } = parsed.data;

    const [memo] = await db
      .insert(creditMemos)
      .values({
        tenantId,
        customerId,
        invoiceId: invoiceId ?? null,
        memoNumber,
        status: 'draft',
        reason: reason ?? null,
        totalAmount: totalAmount ?? 0,
        arAccountId: arAccountId ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(memo);
  });

  // PATCH /:id — update credit memo (draft only)
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Credit memo not found' });
    }

    if (existing.status !== 'draft') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Credit memo can only be updated in draft status',
      });
    }

    const updates: Partial<typeof creditMemos.$inferInsert> = {};
    if (parsed.data.reason !== undefined) updates.reason = parsed.data.reason ?? null;
    if (parsed.data.totalAmount !== undefined) updates.totalAmount = parsed.data.totalAmount;
    if (parsed.data.arAccountId !== undefined) updates.arAccountId = parsed.data.arAccountId ?? null;

    const [updated] = await db
      .update(creditMemos)
      .set(updates)
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .returning();

    return reply.send(updated);
  });

  // DELETE /:id — soft delete (cancel)
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Credit memo not found' });
    }

    await db
      .update(creditMemos)
      .set({ status: 'cancelled' })
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)));

    return reply.status(204).send();
  });

  // POST /:id/actions/submit — draft → pending_approval
  fastify.post('/:id/actions/submit', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [memo] = await db
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .limit(1);

    if (!memo) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Credit memo not found' });
    }

    if (memo.status !== 'draft') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Credit memo must be in draft status to submit',
      });
    }

    const [updated] = await db
      .update(creditMemos)
      .set({ status: 'pending_approval' })
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .returning();

    return reply.send(updated);
  });

  // POST /:id/actions/approve — pending_approval → posted (with GL)
  fastify.post('/:id/actions/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [memo] = await db
      .select()
      .from(creditMemos)
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .limit(1);

    if (!memo) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Credit memo not found' });
    }

    if (memo.status !== 'pending_approval') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Credit memo must be in pending_approval status to approve',
      });
    }

    if (!memo.arAccountId) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'ar_account_id required for GL posting',
      });
    }

    // Look up current open accounting period
    const [period] = await db
      .select()
      .from(accountingPeriods)
      .where(
        and(
          eq(accountingPeriods.tenantId, tenantId),
          eq(accountingPeriods.status, 'open'),
        ),
      )
      .orderBy(desc(accountingPeriods.startDate))
      .limit(1);

    if (!period) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'No open accounting period',
      });
    }

    // Fetch lines for GL posting
    const lines = await db
      .select()
      .from(creditMemoLines)
      .where(eq(creditMemoLines.memoId, id))
      .orderBy(creditMemoLines.lineNumber);

    const now = new Date();

    const glResult = await createJournalEntry(
      tenantId,
      {
        journalType: 'automated',
        periodId: period.id,
        postingDate: now.toISOString(),
        sourceModule: 'credit_memo',
        sourceEntityType: 'credit_memo',
        sourceEntityId: memo.id,
        description: `Credit memo ${memo.memoNumber}`,
        lines: [
          {
            accountId: memo.arAccountId,
            debitAmount: memo.totalAmount,
            creditAmount: 0,
          },
          ...lines.map((line) => ({
            accountId: line.accountId,
            debitAmount: 0,
            creditAmount: line.amount,
            description: line.description ?? undefined,
          })),
        ],
      },
      userId,
    );

    if (!glResult.ok) {
      return reply.status(500).send({
        error: 'INTERNAL',
        message: 'GL posting failed',
        details: glResult.error,
      });
    }

    const [updated] = await db
      .update(creditMemos)
      .set({
        status: 'posted',
        approvedBy: userId,
        glPostedAt: now,
      })
      .where(and(eq(creditMemos.id, id), eq(creditMemos.tenantId, tenantId)))
      .returning();

    return reply.send(updated);
  });
}
