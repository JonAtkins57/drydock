import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, asc } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { rateCards, rateCardLines } from '../db/schema/index.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  status: z.enum(['draft', 'active', 'expired', 'archived']).optional(),
  customerId: z.string().uuid().optional(),
});

const createRateCardSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'active', 'expired', 'archived']).default('draft'),
  description: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

const updateRateCardSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  customerId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'expired', 'archived']).optional(),
  description: z.string().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

const createLineSchema = z.object({
  itemId: z.string().uuid().optional(),
  itemCode: z.string().optional(),
  description: z.string().min(1),
  unitOfMeasure: z.string().optional(),
  unitPriceCents: z.number().int().min(0),
  discountPercent: z.number().min(0).max(100).optional(),
  minQuantity: z.number().min(0).optional(),
  maxQuantity: z.number().min(0).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const updateLineSchema = z.object({
  description: z.string().min(1).optional(),
  unitOfMeasure: z.string().optional(),
  unitPriceCents: z.number().int().min(0).optional(),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  minQuantity: z.number().min(0).nullable().optional(),
  maxQuantity: z.number().min(0).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function pricingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── GET / — list rate cards ──────────────────────────────────────
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
    const { page, pageSize, status, customerId } = query.data;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(rateCards.tenantId, tenantId),
      eq(rateCards.isActive, true),
    ];
    if (status) conditions.push(eq(rateCards.status, status));
    if (customerId) conditions.push(eq(rateCards.customerId, customerId));

    const where = and(...conditions);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(rateCards).where(where),
      db
        .select()
        .from(rateCards)
        .where(where)
        .orderBy(desc(rateCards.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);

    return reply.send({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  });

  // ── POST / — create rate card ────────────────────────────────────
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRateCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { name, code, currency, customerId, status, description, effectiveFrom, effectiveTo } = parsed.data;

    const [card] = await db
      .insert(rateCards)
      .values({
        tenantId,
        name,
        code,
        currency,
        customerId: customerId ?? null,
        status,
        description: description ?? null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return reply.status(201).send(card);
  });

  // ── GET /:id — get single rate card with lines ───────────────────
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [card] = await db
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    if (!card) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const lines = await db
      .select()
      .from(rateCardLines)
      .where(and(eq(rateCardLines.rateCardId, id), eq(rateCardLines.tenantId, tenantId)))
      .orderBy(asc(rateCardLines.sortOrder), asc(rateCardLines.createdAt));

    return reply.send({ ...card, lines });
  });

  // ── PATCH /:id — update rate card ────────────────────────────────
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateRateCardSchema.safeParse(request.body);
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
      .from(rateCards)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const updates: Partial<typeof rateCards.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    const { name, currency, customerId, status, description, effectiveFrom, effectiveTo } = parsed.data;

    if (name !== undefined) updates.name = name;
    if (currency !== undefined) updates.currency = currency;
    if (customerId !== undefined) updates.customerId = customerId;
    if (status !== undefined) updates.status = status;
    if (description !== undefined) updates.description = description;
    if (effectiveFrom !== undefined) updates.effectiveFrom = effectiveFrom ? new Date(effectiveFrom) : null;
    if (effectiveTo !== undefined) updates.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;

    const [updated] = await db
      .update(rateCards)
      .set(updates)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
      .returning();

    return reply.send(updated);
  });

  // ── DELETE /:id — soft delete ────────────────────────────────────
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    await db
      .update(rateCards)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: userId })
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    return reply.status(204).send();
  });

  // ── POST /:id/lines — add a rate card line ───────────────────────
  fastify.post('/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = createLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [card] = await db
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    if (!card) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const {
      itemId,
      itemCode,
      description,
      unitOfMeasure,
      unitPriceCents,
      discountPercent,
      minQuantity,
      maxQuantity,
      sortOrder,
    } = parsed.data;

    const [line] = await db
      .insert(rateCardLines)
      .values({
        tenantId,
        rateCardId: id,
        itemId: itemId ?? null,
        itemCode: itemCode ?? null,
        description,
        unitOfMeasure: unitOfMeasure ?? null,
        unitPriceCents,
        discountPercent: discountPercent != null ? String(discountPercent) : null,
        minQuantity: minQuantity != null ? String(minQuantity) : null,
        maxQuantity: maxQuantity != null ? String(maxQuantity) : null,
        sortOrder,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return reply.status(201).send(line);
  });

  // ── PATCH /:id/lines/:lineId — update a line ─────────────────────
  fastify.patch(
    '/:id/lines/:lineId',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateLineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { tenantId, sub: userId } = request.currentUser;
      const { id, lineId } = request.params;

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      const [existingLine] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!existingLine) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      const updates: Partial<typeof rateCardLines.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: userId,
      };

      const { description, unitOfMeasure, unitPriceCents, discountPercent, minQuantity, maxQuantity, sortOrder, isActive } = parsed.data;

      if (description !== undefined) updates.description = description;
      if (unitOfMeasure !== undefined) updates.unitOfMeasure = unitOfMeasure;
      if (unitPriceCents !== undefined) updates.unitPriceCents = unitPriceCents;
      if (discountPercent !== undefined) updates.discountPercent = discountPercent != null ? String(discountPercent) : null;
      if (minQuantity !== undefined) updates.minQuantity = minQuantity != null ? String(minQuantity) : null;
      if (maxQuantity !== undefined) updates.maxQuantity = maxQuantity != null ? String(maxQuantity) : null;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (isActive !== undefined) updates.isActive = isActive;

      const [updatedLine] = await db
        .update(rateCardLines)
        .set(updates)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        )
        .returning();

      return reply.send(updatedLine);
    },
  );

  // ── DELETE /:id/lines/:lineId — soft delete a line ───────────────
  fastify.delete(
    '/:id/lines/:lineId',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string } }>,
      reply: FastifyReply,
    ) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id, lineId } = request.params;

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      const [existingLine] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!existingLine) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      await db
        .update(rateCardLines)
        .set({ isActive: false, updatedAt: new Date(), updatedBy: userId })
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      return reply.status(204).send();
    },
  );
}
