import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { forecasts } from '../db/schema/index.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  fiscalYear: z.coerce.number().int().min(2000).max(2100).optional(),
  budgetId: z.string().uuid().optional(),
});

const createForecastSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  periodNumber: z.number().int().min(1).max(12),
  departmentId: z.string().uuid(),
  accountId: z.string().uuid(),
  forecastAmountCents: z.number().int().min(0),
  budgetId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function forecastRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list forecasts
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
    const { page, pageSize, fiscalYear, budgetId } = query.data;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(forecasts.tenantId, tenantId)];
    if (fiscalYear !== undefined) {
      conditions.push(eq(forecasts.fiscalYear, fiscalYear));
    }
    if (budgetId !== undefined) {
      conditions.push(eq(forecasts.budgetId, budgetId));
    }

    const where = and(...conditions);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(forecasts).where(where),
      db
        .select()
        .from(forecasts)
        .where(where)
        .orderBy(desc(forecasts.createdAt))
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

  // POST / — create forecast
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createForecastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { fiscalYear, periodNumber, departmentId, accountId, forecastAmountCents, budgetId, notes } = parsed.data;

    const [forecast] = await db
      .insert(forecasts)
      .values({
        tenantId,
        fiscalYear,
        periodNumber,
        departmentId,
        accountId,
        forecastAmountCents,
        budgetId: budgetId ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(forecast);
  });
}
