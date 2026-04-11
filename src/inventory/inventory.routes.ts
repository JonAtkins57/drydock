import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { inventoryItems, inventoryTransactions, inventoryAdjustments, warehouses } from '../db/schema/index.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  warehouseId: z.string().uuid().optional(),
});

const createTransactionSchema = z.object({
  transactionType: z.enum(['receipt', 'issue', 'adjustment', 'transfer', 'count']),
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  fromWarehouseId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unitCost: z.number(),
  totalCost: z.number(),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  locationId: z.string().uuid().optional(),
});

const createAdjustmentSchema = z.object({
  adjustmentDate: z.string().min(1),
  warehouseId: z.string().uuid(),
  notes: z.string().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /inventory — list inventory items with optional warehouse filter
  fastify.get('/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize, warehouseId } = query.data;
    const offset = (page - 1) * pageSize;

    const whereClause = warehouseId
      ? and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.warehouseId, warehouseId))
      : eq(inventoryItems.tenantId, tenantId);

    const [totalResult, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(inventoryItems)
        .where(whereClause),
      db
        .select({
          id: inventoryItems.id,
          tenantId: inventoryItems.tenantId,
          itemId: inventoryItems.itemId,
          warehouseId: inventoryItems.warehouseId,
          quantityOnHand: inventoryItems.quantityOnHand,
          quantityReserved: inventoryItems.quantityReserved,
          quantityAvailable: sql<string>`(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved})`,
          unitCost: inventoryItems.unitCost,
          totalCost: inventoryItems.totalCost,
          isActive: inventoryItems.isActive,
          createdAt: inventoryItems.createdAt,
          updatedAt: inventoryItems.updatedAt,
        })
        .from(inventoryItems)
        .where(whereClause)
        .orderBy(desc(inventoryItems.createdAt))
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

  // GET /inventory/:itemId — get inventory balances by item across warehouses
  fastify.get('/inventory/:itemId', async (request: FastifyRequest<{ Params: { itemId: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { itemId } = request.params;

    const rows = await db
      .select({
        id: inventoryItems.id,
        tenantId: inventoryItems.tenantId,
        itemId: inventoryItems.itemId,
        warehouseId: inventoryItems.warehouseId,
        quantityOnHand: inventoryItems.quantityOnHand,
        quantityReserved: inventoryItems.quantityReserved,
        quantityAvailable: sql<string>`(${inventoryItems.quantityOnHand} - ${inventoryItems.quantityReserved})`,
        unitCost: inventoryItems.unitCost,
        totalCost: inventoryItems.totalCost,
        isActive: inventoryItems.isActive,
        createdAt: inventoryItems.createdAt,
        updatedAt: inventoryItems.updatedAt,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.itemId, itemId)))
      .orderBy(desc(inventoryItems.createdAt));

    return reply.send({ data: rows });
  });

  // POST /inventory/transactions — record an inventory transaction
  fastify.post('/inventory/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createTransactionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const {
      transactionType,
      itemId,
      warehouseId,
      fromWarehouseId,
      quantity,
      unitCost,
      totalCost,
      referenceType,
      referenceId,
      notes,
    } = parsed.data;

    if (transactionType === 'transfer' && !fromWarehouseId) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'fromWarehouseId is required for transfer transactions',
        details: { fromWarehouseId: ['Required when transactionType is transfer'] },
      });
    }

    const [txn] = await db
      .insert(inventoryTransactions)
      .values({
        tenantId,
        transactionType,
        itemId,
        warehouseId,
        fromWarehouseId: fromWarehouseId ?? null,
        quantity: String(quantity),
        unitCost: String(unitCost),
        totalCost: String(totalCost),
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(txn);
  });

  // GET /warehouses — list warehouses
  fastify.get('/warehouses', async (request: FastifyRequest, reply: FastifyReply) => {
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
        .from(warehouses)
        .where(eq(warehouses.tenantId, tenantId)),
      db
        .select()
        .from(warehouses)
        .where(eq(warehouses.tenantId, tenantId))
        .orderBy(desc(warehouses.createdAt))
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

  // POST /warehouses — create a warehouse
  fastify.post('/warehouses', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createWarehouseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { name, code, locationId } = parsed.data;

    const [warehouse] = await db
      .insert(warehouses)
      .values({
        tenantId,
        name,
        code,
        locationId: locationId ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(warehouse);
  });

  // GET /inventory/adjustments — list inventory adjustments
  fastify.get('/inventory/adjustments', async (request: FastifyRequest, reply: FastifyReply) => {
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
        .from(inventoryAdjustments)
        .where(eq(inventoryAdjustments.tenantId, tenantId)),
      db
        .select()
        .from(inventoryAdjustments)
        .where(eq(inventoryAdjustments.tenantId, tenantId))
        .orderBy(desc(inventoryAdjustments.createdAt))
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

  // POST /inventory/adjustments — create an inventory adjustment
  fastify.post('/inventory/adjustments', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { adjustmentDate, warehouseId, notes } = parsed.data;

    const [adjustment] = await db
      .insert(inventoryAdjustments)
      .values({
        tenantId,
        adjustmentDate,
        warehouseId,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(adjustment);
  });
}
