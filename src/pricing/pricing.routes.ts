import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, count, isNull, or, lte, gte, asc } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { rateCards, rateCardTiers, customerPriceOverrides } from '../db/schema/index.js';

// ── Validation Schemas ─────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

const createRateCardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateRateCardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  currency: z.string().length(3).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

const tierSchema = z.object({
  minQuantity: z.number().int().min(0).default(0),
  maxQuantity: z.number().int().positive().optional(),
  unitPriceCents: z.number().int().min(0),
});

const upsertTiersSchema = z.object({
  tiers: z.array(tierSchema).min(1),
});

const createOverrideSchema = z.object({
  rateCardId: z.string().uuid(),
  customerId: z.string().uuid(),
  unitPriceCents: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const overrideListQuerySchema = z.object({
  rateCardId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});

const lookupQuerySchema = z.object({
  rateCardId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function pricingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── Rate Cards ──────────────────────────────────────────────────

  // GET /rate-cards — list
  fastify.get('/rate-cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid query parameters' });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(rateCards).where(eq(rateCards.tenantId, tenantId)),
      db
        .select()
        .from(rateCards)
        .where(eq(rateCards.tenantId, tenantId))
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
    const { name, description, currency, effectiveFrom, effectiveTo } = parsed.data;

    const [card] = await db
      .insert(rateCards)
      .values({
        tenantId,
        name,
        description: description ?? null,
        currency,
        effectiveFrom,
        effectiveTo: effectiveTo ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(card);
  });

  // PATCH /rate-cards/:id — update
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

      const { tenantId } = request.currentUser;
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
      };
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.description !== undefined) updates.description = parsed.data.description;
      if (parsed.data.currency !== undefined) updates.currency = parsed.data.currency;
      if (parsed.data.effectiveFrom !== undefined) updates.effectiveFrom = parsed.data.effectiveFrom;
      if (parsed.data.effectiveTo !== undefined) updates.effectiveTo = parsed.data.effectiveTo;
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

      const [updated] = await db
        .update(rateCards)
        .set(updates)
        .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
        .returning();

      return reply.send(updated);
    },
  );

  // ── Tiers ───────────────────────────────────────────────────────

  // GET /rate-cards/:id/tiers
  fastify.get(
    '/rate-cards/:id/tiers',
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

      const tiers = await db
        .select()
        .from(rateCardTiers)
        .where(and(eq(rateCardTiers.rateCardId, id), eq(rateCardTiers.tenantId, tenantId)))
        .orderBy(asc(rateCardTiers.minQuantity));

      return reply.send(tiers);
    },
  );

  // PUT /rate-cards/:id/tiers — replace all tiers atomically
  fastify.put(
    '/rate-cards/:id/tiers',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parsed = upsertTiersSchema.safeParse(request.body);
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

      // Delete existing tiers, insert new ones
      await db
        .delete(rateCardTiers)
        .where(and(eq(rateCardTiers.rateCardId, id), eq(rateCardTiers.tenantId, tenantId)));

      const newTiers = await db
        .insert(rateCardTiers)
        .values(
          parsed.data.tiers.map((t) => ({
            tenantId,
            rateCardId: id,
            minQuantity: t.minQuantity,
            maxQuantity: t.maxQuantity ?? null,
            unitPriceCents: t.unitPriceCents,
          })),
        )
        .returning();

      return reply.send(newTiers);
    },
  );

  // ── Customer Price Overrides ────────────────────────────────────

  // GET /overrides
  fastify.get('/overrides', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = overrideListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid query parameters' });
    }

    const { tenantId } = request.currentUser;
    const { rateCardId, customerId } = query.data;

    const conditions = [
      eq(customerPriceOverrides.tenantId, tenantId),
      eq(customerPriceOverrides.isActive, true),
    ];
    if (rateCardId) conditions.push(eq(customerPriceOverrides.rateCardId, rateCardId));
    if (customerId) conditions.push(eq(customerPriceOverrides.customerId, customerId));

    const rows = await db
      .select()
      .from(customerPriceOverrides)
      .where(and(...conditions))
      .orderBy(desc(customerPriceOverrides.createdAt));

    return reply.send({ data: rows });
  });

  // POST /overrides — create
  fastify.post('/overrides', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createOverrideSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { rateCardId, customerId, unitPriceCents, effectiveFrom, effectiveTo } = parsed.data;

    // Verify rate card belongs to tenant
    const [card] = await db
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.id, rateCardId), eq(rateCards.tenantId, tenantId)));

    if (!card) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const [override] = await db
      .insert(customerPriceOverrides)
      .values({
        tenantId,
        rateCardId,
        customerId,
        unitPriceCents,
        effectiveFrom,
        effectiveTo: effectiveTo ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(override);
  });

  // DELETE /overrides/:id — soft delete
  fastify.delete(
    '/overrides/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId } = request.currentUser;
      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(customerPriceOverrides)
        .where(and(eq(customerPriceOverrides.id, id), eq(customerPriceOverrides.tenantId, tenantId)));

      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Price override not found' });
      }

      await db
        .update(customerPriceOverrides)
        .set({ isActive: false })
        .where(and(eq(customerPriceOverrides.id, id), eq(customerPriceOverrides.tenantId, tenantId)));

      return reply.status(204).send();
    },
  );

  // ── Price Lookup ────────────────────────────────────────────────

  // GET /lookup?rateCardId=&customerId=&quantity=&asOf=
  fastify.get('/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = lookupQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { rateCardId, customerId, quantity = 1, asOf } = query.data;
    const effectiveDate = asOf ?? new Date().toISOString().slice(0, 10);

    // Verify rate card exists and is active on effectiveDate
    const [card] = await db
      .select()
      .from(rateCards)
      .where(
        and(
          eq(rateCards.id, rateCardId),
          eq(rateCards.tenantId, tenantId),
          eq(rateCards.isActive, true),
          lte(rateCards.effectiveFrom, effectiveDate),
          or(isNull(rateCards.effectiveTo), gte(rateCards.effectiveTo, effectiveDate)),
        ),
      );

    if (!card) {
      return reply.send({ unitPriceCents: undefined, source: undefined });
    }

    // Check for a customer-specific override first
    if (customerId) {
      const [override] = await db
        .select()
        .from(customerPriceOverrides)
        .where(
          and(
            eq(customerPriceOverrides.tenantId, tenantId),
            eq(customerPriceOverrides.rateCardId, rateCardId),
            eq(customerPriceOverrides.customerId, customerId),
            eq(customerPriceOverrides.isActive, true),
            lte(customerPriceOverrides.effectiveFrom, effectiveDate),
            or(
              isNull(customerPriceOverrides.effectiveTo),
              gte(customerPriceOverrides.effectiveTo, effectiveDate),
            ),
          ),
        )
        .limit(1);

      if (override) {
        return reply.send({ unitPriceCents: override.unitPriceCents, source: 'override' });
      }
    }

    // Fall back to tiered pricing: find the tier covering `quantity`
    const tiers = await db
      .select()
      .from(rateCardTiers)
      .where(
        and(
          eq(rateCardTiers.tenantId, tenantId),
          eq(rateCardTiers.rateCardId, rateCardId),
          lte(rateCardTiers.minQuantity, quantity),
        ),
      )
      .orderBy(desc(rateCardTiers.minQuantity));

    // Pick the highest minQuantity tier whose maxQuantity covers the requested quantity
    const matchingTier = tiers.find(
      (t) => t.maxQuantity === null || t.maxQuantity >= quantity,
    );

    if (matchingTier) {
      return reply.send({ unitPriceCents: matchingTier.unitPriceCents, source: 'tier' });
    }

    return reply.send({ unitPriceCents: undefined, source: undefined });
  });
}
