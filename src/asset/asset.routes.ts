import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { fixedAssets } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createAssetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  assetClass: z.enum(['land', 'building', 'equipment', 'vehicle', 'furniture', 'software', 'other']),
  acquisitionDate: z.string().datetime(),
  acquisitionCost: z.number().int().min(0),
  salvageValue: z.number().int().min(0).default(0),
  usefulLifeMonths: z.number().int().positive(),
  depreciationMethod: z.enum(['straight_line', 'declining_balance', 'units_of_production']),
  locationId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function assetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list fixed assets
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
        .from(fixedAssets)
        .where(eq(fixedAssets.tenantId, tenantId)),
      db
        .select()
        .from(fixedAssets)
        .where(eq(fixedAssets.tenantId, tenantId))
        .orderBy(desc(fixedAssets.createdAt))
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

  // POST / — create fixed asset
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createAssetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const {
      name,
      description,
      assetClass,
      acquisitionDate,
      acquisitionCost,
      salvageValue,
      usefulLifeMonths,
      depreciationMethod,
      locationId,
      departmentId,
    } = parsed.data;

    const numResult = await generateNumber(tenantId, 'asset');
    if (!numResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: numResult.error.message });
    }

    const [asset] = await db
      .insert(fixedAssets)
      .values({
        tenantId,
        assetNumber: numResult.value,
        name,
        description: description ?? null,
        assetClass,
        acquisitionDate: new Date(acquisitionDate),
        acquisitionCost,
        salvageValue: salvageValue ?? 0,
        usefulLifeMonths,
        depreciationMethod,
        locationId: locationId ?? null,
        departmentId: departmentId ?? null,
        accumulatedDepreciation: 0,
        netBookValue: acquisitionCost,
        status: 'active',
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(asset);
  });
}
