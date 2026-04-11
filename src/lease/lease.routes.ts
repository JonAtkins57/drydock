import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { leaseContracts } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createLeaseSchema = z.object({
  lessorName: z.string().nullish(),
  description: z.string().min(1),
  leaseType: z.enum(['operating', 'finance']).default('operating'),
  commencementDate: z.string().datetime(),
  endDate: z.string().datetime(),
  leaseTermMonths: z.number().int().positive(),
  paymentAmount: z.number().int().min(0),
  paymentFrequency: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  incrementalBorrowingRate: z.number().int().min(0).default(0),
  rouAssetValue: z.number().int().min(0).default(0),
  leaseLiabilityValue: z.number().int().min(0).default(0),
  rouAccountId: z.string().uuid().nullish(),
  liabilityAccountId: z.string().uuid().nullish(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function leaseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list lease contracts
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
        .from(leaseContracts)
        .where(eq(leaseContracts.tenantId, tenantId)),
      db
        .select()
        .from(leaseContracts)
        .where(eq(leaseContracts.tenantId, tenantId))
        .orderBy(desc(leaseContracts.createdAt))
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

  // POST / — create lease contract
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createLeaseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;

    const numResult = await generateNumber(tenantId, 'lease');
    if (!numResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: numResult.error.message });
    }

    const [lease] = await db
      .insert(leaseContracts)
      .values({
        tenantId,
        leaseNumber: numResult.value,
        lessorName: parsed.data.lessorName ?? null,
        assetDescription: parsed.data.description,
        leaseType: parsed.data.leaseType,
        status: 'draft',
        commencementDate: new Date(parsed.data.commencementDate),
        leaseEndDate: new Date(parsed.data.endDate),
        leaseTermMonths: parsed.data.leaseTermMonths,
        paymentAmount: parsed.data.paymentAmount,
        paymentFrequency: parsed.data.paymentFrequency,
        discountRate: parsed.data.incrementalBorrowingRate,
        rouAssetAmount: parsed.data.rouAssetValue,
        leaseLiabilityAmount: parsed.data.leaseLiabilityValue,
        rouAccountId: parsed.data.rouAccountId ?? null,
        liabilityAccountId: parsed.data.liabilityAccountId ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(lease);
  });
}
