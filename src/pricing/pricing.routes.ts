import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, count, isNull, lte, gte, or } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import {
  rateCards,
  rateCardLines,
  pricingTiers,
  customerPriceOverrides,
} from '../db/schema/index.js';

// ── Zod Schemas ────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  customerId: z.string().uuid().optional(),
});

const createRateCardSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  customerId: z.string().uuid().optional(),
  isDefault: z.boolean().default(false),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const updateRateCardSchema = createRateCardSchema.partial().omit({ code: true });

const createRateCardLineSchema = z.object({
  itemId: z.string().uuid().optional(),
  itemNumber: z.string().optional(),
  itemName: z.string().min(1),
  unitOfMeasure: z.string().optional(),
  unitPriceCents: z.number().int().min(0),
  discountPercent: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const updateRateCardLineSchema = createRateCardLineSchema.partial();

const createPricingTierSchema = z.object({
  tierName: z.string().optional(),
  minQty: z.number().int().min(1),
  maxQty: z.number().int().min(1).optional(),
  unitPriceCents: z.number().int().min(0),
});

const createOverrideSchema = z.object({
  customerId: z.string().uuid(),
  itemId: z.string().uuid(),
  rateCardId: z.string().uuid().optional(),
  unitPriceCents: z.number().int().min(0),
  discountPercent: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const priceLookupQuerySchema = z.object({
  itemId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  qty: z.coerce.number().int().positive().default(1),
  asOf: z.string().datetime().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function pricingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── Rate Cards ─────────────────────────────────────────────────

  // GET /rate-cards — list
  fastify.get('/rate-cards', async (request: FastifyRequest, reply: FastifyReply) => {
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

    const whereClause = and(...conditions);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(rateCards).where(whereClause),
      db
        .select()
        .from(rateCards)
        .where(whereClause)
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

  // POST /rate-cards — create
  fastify.post('/rate-cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRateCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const {
      name, code, description, currency, customerId, isDefault,
      effectiveFrom, effectiveTo, notes,
    } = parsed.data;

    // Ensure code is unique within tenant
    const [existing] = await db
      .select({ id: rateCards.id })
      .from(rateCards)
      .where(and(eq(rateCards.tenantId, tenantId), eq(rateCards.code, code)));

    if (existing) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `Rate card with code '${code}' already exists`,
      });
    }

    const [card] = await db
      .insert(rateCards)
      .values({
        tenantId,
        name,
        code,
        description: description ?? null,
        currency,
        customerId: customerId ?? null,
        isDefault,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return reply.status(201).send(card);
  });

  // GET /rate-cards/:id — get with lines
  fastify.get(
    '/rate-cards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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
        .where(and(eq(rateCardLines.rateCardId, id), eq(rateCardLines.tenantId, tenantId), eq(rateCardLines.isActive, true)))
        .orderBy(rateCardLines.sortOrder, rateCardLines.createdAt);

      const lineIds = lines.map((l) => l.id);
      const tiers =
        lineIds.length > 0
          ? await db
              .select()
              .from(pricingTiers)
              .where(
                and(
                  eq(pricingTiers.tenantId, tenantId),
                  // Drizzle inArray requires import — use a join-style filter instead
                  // Since lineIds could be large, build a manual OR filter
                  or(...lineIds.map((lid) => eq(pricingTiers.rateCardLineId, lid))),
                ),
              )
          : [];

      const tiersByLine = new Map<string, typeof tiers>();
      for (const tier of tiers) {
        const arr = tiersByLine.get(tier.rateCardLineId) ?? [];
        arr.push(tier);
        tiersByLine.set(tier.rateCardLineId, arr);
      }

      const linesWithTiers = lines.map((line) => ({
        ...line,
        pricingTiers: tiersByLine.get(line.id) ?? [],
      }));

      return reply.send({ ...card, lines: linesWithTiers });
    },
  );

  // PATCH /rate-cards/:id — update header
  fastify.patch(
    '/rate-cards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      const {
        name, description, currency, customerId, isDefault,
        effectiveFrom, effectiveTo, notes,
      } = parsed.data;

      const [updated] = await db
        .update(rateCards)
        .set({
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(currency !== undefined && { currency }),
          ...(customerId !== undefined && { customerId }),
          ...(isDefault !== undefined && { isDefault }),
          ...(effectiveFrom !== undefined && { effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null }),
          ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
          ...(notes !== undefined && { notes }),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
        .returning();

      return reply.send(updated);
    },
  );

  // DELETE /rate-cards/:id — soft delete
  fastify.delete(
    '/rate-cards/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      await db
        .update(rateCards)
        .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      return reply.status(204).send();
    },
  );

  // POST /rate-cards/:id/actions/activate — transition to active
  fastify.post(
    '/rate-cards/:id/actions/activate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      if (card.status === 'archived') {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Cannot activate an archived rate card',
        });
      }

      const [updated] = await db
        .update(rateCards)
        .set({ status: 'active', updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
        .returning();

      return reply.send(updated);
    },
  );

  // POST /rate-cards/:id/actions/archive — transition to archived
  fastify.post(
    '/rate-cards/:id/actions/archive',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [card] = await db
        .select()
        .from(rateCards)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

      if (!card) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
      }

      const [updated] = await db
        .update(rateCards)
        .set({ status: 'archived', updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
        .returning();

      return reply.send(updated);
    },
  );

  // ── Rate Card Lines ────────────────────────────────────────────

  // POST /rate-cards/:id/lines — add line
  fastify.post(
    '/rate-cards/:id/lines',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parsed = createRateCardLineSchema.safeParse(request.body);
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
        itemId, itemNumber, itemName, unitOfMeasure, unitPriceCents,
        discountPercent, effectiveFrom, effectiveTo, notes, sortOrder,
      } = parsed.data;

      const [line] = await db
        .insert(rateCardLines)
        .values({
          tenantId,
          rateCardId: id,
          itemId: itemId ?? null,
          itemNumber: itemNumber ?? null,
          itemName,
          unitOfMeasure: unitOfMeasure ?? null,
          unitPriceCents,
          discountPercent: discountPercent ?? null,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
          notes: notes ?? null,
          sortOrder,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.status(201).send(line);
    },
  );

  // PATCH /rate-cards/:id/lines/:lineId — update line
  fastify.patch(
    '/rate-cards/:id/lines/:lineId',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateRateCardLineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { tenantId, sub: userId } = request.currentUser;
      const { id, lineId } = request.params;

      const [line] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!line) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      const {
        itemId, itemNumber, itemName, unitOfMeasure, unitPriceCents,
        discountPercent, effectiveFrom, effectiveTo, notes, sortOrder,
      } = parsed.data;

      const [updated] = await db
        .update(rateCardLines)
        .set({
          ...(itemId !== undefined && { itemId }),
          ...(itemNumber !== undefined && { itemNumber }),
          ...(itemName !== undefined && { itemName }),
          ...(unitOfMeasure !== undefined && { unitOfMeasure }),
          ...(unitPriceCents !== undefined && { unitPriceCents }),
          ...(discountPercent !== undefined && { discountPercent }),
          ...(effectiveFrom !== undefined && { effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null }),
          ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
          ...(notes !== undefined && { notes }),
          ...(sortOrder !== undefined && { sortOrder }),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        )
        .returning();

      return reply.send(updated);
    },
  );

  // DELETE /rate-cards/:id/lines/:lineId — soft delete
  fastify.delete(
    '/rate-cards/:id/lines/:lineId',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string } }>,
      reply: FastifyReply,
    ) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id, lineId } = request.params;

      const [line] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!line) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      await db
        .update(rateCardLines)
        .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
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

  // ── Pricing Tiers ──────────────────────────────────────────────

  // POST /rate-cards/:id/lines/:lineId/tiers — add tier
  fastify.post(
    '/rate-cards/:id/lines/:lineId/tiers',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string } }>,
      reply: FastifyReply,
    ) => {
      const parsed = createPricingTierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { tenantId, sub: userId } = request.currentUser;
      const { id, lineId } = request.params;

      // Verify line belongs to this rate card + tenant
      const [line] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!line) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      const { tierName, minQty, maxQty, unitPriceCents } = parsed.data;

      const [tier] = await db
        .insert(pricingTiers)
        .values({
          tenantId,
          rateCardLineId: lineId,
          tierName: tierName ?? null,
          minQty,
          maxQty: maxQty ?? null,
          unitPriceCents,
          createdBy: userId,
        })
        .returning();

      return reply.status(201).send(tier);
    },
  );

  // DELETE /rate-cards/:id/lines/:lineId/tiers/:tierId — delete tier
  fastify.delete(
    '/rate-cards/:id/lines/:lineId/tiers/:tierId',
    async (
      request: FastifyRequest<{ Params: { id: string; lineId: string; tierId: string } }>,
      reply: FastifyReply,
    ) => {
      const { tenantId } = request.currentUser;
      const { id, lineId, tierId } = request.params;

      // Verify line belongs to this rate card + tenant
      const [line] = await db
        .select()
        .from(rateCardLines)
        .where(
          and(
            eq(rateCardLines.id, lineId),
            eq(rateCardLines.rateCardId, id),
            eq(rateCardLines.tenantId, tenantId),
          ),
        );

      if (!line) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card line not found' });
      }

      const [tier] = await db
        .select()
        .from(pricingTiers)
        .where(
          and(
            eq(pricingTiers.id, tierId),
            eq(pricingTiers.rateCardLineId, lineId),
            eq(pricingTiers.tenantId, tenantId),
          ),
        );

      if (!tier) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Pricing tier not found' });
      }

      await db
        .delete(pricingTiers)
        .where(
          and(
            eq(pricingTiers.id, tierId),
            eq(pricingTiers.rateCardLineId, lineId),
            eq(pricingTiers.tenantId, tenantId),
          ),
        );

      return reply.status(204).send();
    },
  );

  // ── Customer Price Overrides ───────────────────────────────────

  // GET /customer-price-overrides — list
  fastify.get('/customer-price-overrides', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(200).default(50),
        customerId: z.string().uuid().optional(),
        itemId: z.string().uuid().optional(),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize, customerId, itemId } = query.data;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(customerPriceOverrides.tenantId, tenantId),
      eq(customerPriceOverrides.isActive, true),
    ];
    if (customerId) conditions.push(eq(customerPriceOverrides.customerId, customerId));
    if (itemId) conditions.push(eq(customerPriceOverrides.itemId, itemId));

    const whereClause = and(...conditions);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(customerPriceOverrides).where(whereClause),
      db
        .select()
        .from(customerPriceOverrides)
        .where(whereClause)
        .orderBy(desc(customerPriceOverrides.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);

    return reply.send({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  });

  // POST /customer-price-overrides — create
  fastify.post(
    '/customer-price-overrides',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createOverrideSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { tenantId, sub: userId } = request.currentUser;
      const {
        customerId, itemId, rateCardId, unitPriceCents, discountPercent,
        effectiveFrom, effectiveTo, notes,
      } = parsed.data;

      const [override] = await db
        .insert(customerPriceOverrides)
        .values({
          tenantId,
          customerId,
          itemId,
          rateCardId: rateCardId ?? null,
          unitPriceCents,
          discountPercent: discountPercent ?? null,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
          notes: notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.status(201).send(override);
    },
  );

  // DELETE /customer-price-overrides/:id — soft delete
  fastify.delete(
    '/customer-price-overrides/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [override] = await db
        .select()
        .from(customerPriceOverrides)
        .where(and(eq(customerPriceOverrides.id, id), eq(customerPriceOverrides.tenantId, tenantId)));

      if (!override) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Price override not found' });
      }

      await db
        .update(customerPriceOverrides)
        .set({ isActive: false, updatedBy: userId, updatedAt: new Date() })
        .where(and(eq(customerPriceOverrides.id, id), eq(customerPriceOverrides.tenantId, tenantId)));

      return reply.status(204).send();
    },
  );

  // ── Price Lookup ───────────────────────────────────────────────
  // Resolves effective price for item + optional customer + qty.
  // Resolution order: customer override → customer rate card line (tiered) →
  // default rate card line (tiered) → null (no price found).

  fastify.get('/pricing/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = priceLookupQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { itemId, customerId, qty, asOf } = query.data;
    const asOfDate = asOf ? new Date(asOf) : new Date();

    // 1. Check customer-specific override (highest priority)
    if (customerId) {
      const overrideConditions = [
        eq(customerPriceOverrides.tenantId, tenantId),
        eq(customerPriceOverrides.customerId, customerId),
        eq(customerPriceOverrides.itemId, itemId),
        eq(customerPriceOverrides.isActive, true),
        or(
          isNull(customerPriceOverrides.effectiveFrom),
          lte(customerPriceOverrides.effectiveFrom, asOfDate),
        ),
        or(
          isNull(customerPriceOverrides.effectiveTo),
          gte(customerPriceOverrides.effectiveTo, asOfDate),
        ),
      ];

      const [override] = await db
        .select()
        .from(customerPriceOverrides)
        .where(and(...overrideConditions))
        .orderBy(desc(customerPriceOverrides.createdAt))
        .limit(1);

      if (override) {
        const base = override.unitPriceCents;
        const disc = override.discountPercent ? parseFloat(String(override.discountPercent)) : 0;
        const effective = Math.round(base * (1 - disc / 100));
        return reply.send({
          source: 'customer_override',
          overrideId: override.id,
          unitPriceCents: base,
          discountPercent: disc,
          effectivePriceCents: effective,
          qty,
          totalCents: effective * qty,
        });
      }
    }

    // 2. Find an active rate card line for this item
    //    Prefer customer-specific card, then default/global card.
    const rateCardConditions = [
      eq(rateCards.tenantId, tenantId),
      eq(rateCards.status, 'active'),
      eq(rateCards.isActive, true),
      or(isNull(rateCards.effectiveFrom), lte(rateCards.effectiveFrom, asOfDate)),
      or(isNull(rateCards.effectiveTo), gte(rateCards.effectiveTo, asOfDate)),
    ];

    if (customerId) {
      rateCardConditions.push(
        or(
          eq(rateCards.customerId, customerId),
          isNull(rateCards.customerId),
        ),
      );
    } else {
      rateCardConditions.push(isNull(rateCards.customerId));
    }

    const activeCards = await db
      .select()
      .from(rateCards)
      .where(and(...rateCardConditions))
      // Customer-specific cards sort before global ones
      .orderBy(desc(rateCards.isDefault));

    if (activeCards.length === 0) {
      return reply.send({ source: null, unitPriceCents: null, message: 'No active rate card found' });
    }

    // Try cards in priority order (customer-specific first, then default)
    const sortedCards = customerId
      ? [
          ...activeCards.filter((c) => c.customerId === customerId),
          ...activeCards.filter((c) => c.customerId === null),
        ]
      : activeCards;

    for (const card of sortedCards) {
      const lineConditions = [
        eq(rateCardLines.rateCardId, card.id),
        eq(rateCardLines.tenantId, tenantId),
        eq(rateCardLines.itemId, itemId),
        eq(rateCardLines.isActive, true),
        or(isNull(rateCardLines.effectiveFrom), lte(rateCardLines.effectiveFrom, asOfDate)),
        or(isNull(rateCardLines.effectiveTo), gte(rateCardLines.effectiveTo, asOfDate)),
      ];

      const [line] = await db
        .select()
        .from(rateCardLines)
        .where(and(...lineConditions))
        .limit(1);

      if (!line) continue;

      // Check for tiered pricing
      const tiers = await db
        .select()
        .from(pricingTiers)
        .where(
          and(
            eq(pricingTiers.rateCardLineId, line.id),
            eq(pricingTiers.tenantId, tenantId),
          ),
        )
        .orderBy(pricingTiers.minQty);

      let unitPriceCents = line.unitPriceCents;
      let tierId: string | null = null;

      if (tiers.length > 0) {
        const matchingTier = tiers.find(
          (t) => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty),
        );
        if (matchingTier) {
          unitPriceCents = matchingTier.unitPriceCents;
          tierId = matchingTier.id;
        }
      }

      const disc = line.discountPercent ? parseFloat(String(line.discountPercent)) : 0;
      const effective = Math.round(unitPriceCents * (1 - disc / 100));

      return reply.send({
        source: card.customerId ? 'customer_rate_card' : 'default_rate_card',
        rateCardId: card.id,
        rateCardName: card.name,
        lineId: line.id,
        tierId,
        unitPriceCents,
        discountPercent: disc,
        effectivePriceCents: effective,
        qty,
        totalCents: effective * qty,
      });
    }

    return reply.send({ source: null, unitPriceCents: null, message: 'No matching rate card line found' });
  });
}
