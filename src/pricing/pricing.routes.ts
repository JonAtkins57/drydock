import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, gte, lte, isNull, or } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { rateCards, rateCardTiers, pricingOverrides } from '../db/schema/index.js';

// ── Schemas ────────────────────────────────────────────────────────

const listPageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

const createRateCardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

const createTierSchema = z.object({
  minQuantity: z.number().int().min(0).default(0),
  maxQuantity: z.number().int().positive().nullable().optional(),
  unitPriceCents: z.number().int().min(0),
});

const createOverrideSchema = z.object({
  customerId: z.string().uuid(),
  rateCardId: z.string().uuid(),
  unitPriceCents: z.number().int().min(0),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const updateOverrideSchema = createOverrideSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const lookupQuerySchema = z.object({
  customerId: z.string().uuid(),
  rateCardId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0),
  effectiveDate: z.string().datetime(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function pricingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── Rate Cards ──────────────────────────────────────────────────

  // GET /rate-cards/lookup — MUST be registered before /rate-cards/:id
  // find-my-way (Fastify's router) gives static segments priority, but
  // registering first also makes the intent explicit.
  fastify.get('/rate-cards/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = lookupQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { customerId, rateCardId, quantity, effectiveDate } = query.data;
    const effectiveDateTs = new Date(effectiveDate);

    // Check for an active customer-specific override first
    const overrideRows = await db
      .select()
      .from(pricingOverrides)
      .where(
        and(
          eq(pricingOverrides.tenantId, tenantId),
          eq(pricingOverrides.customerId, customerId),
          eq(pricingOverrides.rateCardId, rateCardId),
          eq(pricingOverrides.isActive, true),
          or(
            isNull(pricingOverrides.effectiveFrom),
            lte(pricingOverrides.effectiveFrom, effectiveDateTs),
          ),
          or(
            isNull(pricingOverrides.effectiveTo),
            gte(pricingOverrides.effectiveTo, effectiveDateTs),
          ),
        ),
      )
      .limit(1);

    if (overrideRows.length > 0) {
      const override = overrideRows[0];
      return reply.send({
        source: 'override' as const,
        unitPriceCents: override.unitPriceCents,
        currency: 'USD',
      });
    }

    // Fall back to rate card tiers
    const card = await db
      .select()
      .from(rateCards)
      .where(and(eq(rateCards.tenantId, tenantId), eq(rateCards.id, rateCardId), eq(rateCards.isActive, true)))
      .limit(1);

    if (card.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const tiers = await db
      .select()
      .from(rateCardTiers)
      .where(and(eq(rateCardTiers.tenantId, tenantId), eq(rateCardTiers.rateCardId, rateCardId)))
      .orderBy(rateCardTiers.minQuantity);

    // Find the matching tier (last tier with maxQuantity null acts as catch-all)
    const matchingTier = tiers.find(
      (t) => quantity >= t.minQuantity && (t.maxQuantity === null || quantity <= t.maxQuantity),
    );

    if (!matchingTier) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'No tier matches the given quantity' });
    }

    return reply.send({
      source: 'tier' as const,
      unitPriceCents: matchingTier.unitPriceCents,
      currency: card[0].currency,
    });
  });

  // GET /rate-cards
  fastify.get('/rate-cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listPageSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid query parameters' });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;
    const where = eq(rateCards.tenantId, tenantId);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(rateCards).where(where),
      db.select().from(rateCards).where(where).orderBy(desc(rateCards.createdAt)).limit(pageSize).offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // POST /rate-cards
  fastify.post('/rate-cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRateCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
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
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(card);
  });

  // GET /rate-cards/:id
  fastify.get('/rate-cards/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.currentUser;

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
      .orderBy(rateCardTiers.minQuantity);

    return reply.send({ ...card, tiers });
  });

  // POST /rate-cards/:id/tiers
  fastify.post('/rate-cards/:id/tiers', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = createTierSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }

    const { tenantId, sub: userId } = request.currentUser;

    const [card] = await db
      .select({ id: rateCards.id })
      .from(rateCards)
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)));

    if (!card) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    const { minQuantity, maxQuantity, unitPriceCents } = parsed.data;

    const [tier] = await db
      .insert(rateCardTiers)
      .values({
        tenantId,
        rateCardId: id,
        minQuantity,
        maxQuantity: maxQuantity ?? null,
        unitPriceCents,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(tier);
  });

  // DELETE /rate-cards/:id — soft delete
  fastify.delete('/rate-cards/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.currentUser;

    const [updated] = await db
      .update(rateCards)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(rateCards.id, id), eq(rateCards.tenantId, tenantId)))
      .returning({ id: rateCards.id });

    if (!updated) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Rate card not found' });
    }

    return reply.status(204).send();
  });

  // ── Pricing Overrides ───────────────────────────────────────────

  // GET /overrides
  fastify.get('/overrides', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listPageSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid query parameters' });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;
    const where = eq(pricingOverrides.tenantId, tenantId);

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(pricingOverrides).where(where),
      db.select().from(pricingOverrides).where(where).orderBy(desc(pricingOverrides.createdAt)).limit(pageSize).offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // POST /overrides
  fastify.post('/overrides', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createOverrideSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { customerId, rateCardId, unitPriceCents, effectiveFrom, effectiveTo, notes } = parsed.data;

    const [override] = await db
      .insert(pricingOverrides)
      .values({
        tenantId,
        customerId,
        rateCardId,
        unitPriceCents,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(override);
  });

  // PATCH /overrides/:id
  fastify.patch('/overrides/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parsed = updateOverrideSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors });
    }

    const { tenantId } = request.currentUser;
    const { customerId, rateCardId, unitPriceCents, effectiveFrom, effectiveTo, notes, isActive } = parsed.data;

    const updates: Partial<typeof pricingOverrides.$inferInsert> = { updatedAt: new Date() };
    if (customerId !== undefined) updates.customerId = customerId;
    if (rateCardId !== undefined) updates.rateCardId = rateCardId;
    if (unitPriceCents !== undefined) updates.unitPriceCents = unitPriceCents;
    if (effectiveFrom !== undefined) updates.effectiveFrom = new Date(effectiveFrom);
    if (effectiveTo !== undefined) updates.effectiveTo = new Date(effectiveTo);
    if (notes !== undefined) updates.notes = notes;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(pricingOverrides)
      .set(updates)
      .where(and(eq(pricingOverrides.id, id), eq(pricingOverrides.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Pricing override not found' });
    }

    return reply.send(updated);
  });
}
