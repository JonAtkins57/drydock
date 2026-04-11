import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
<<<<<<< HEAD
import { eq, desc, count, and, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { inventoryItems, inventoryTransactions, inventoryAdjustments, warehouses } from '../db/schema/index.js';
=======
import { eq, desc, count, and } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { warehouses, inventoryItems, inventoryTransactions } from '../db/schema/index.js';
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
<<<<<<< HEAD
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
=======
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
});

const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  locationId: z.string().uuid().optional(),
});

<<<<<<< HEAD
const createAdjustmentSchema = z.object({
  adjustmentDate: z.string().min(1),
  warehouseId: z.string().uuid(),
  notes: z.string().optional(),
});

=======
const createTransactionSchema = z.object({
  transactionType: z.enum(['receipt', 'issue', 'transfer', 'count', 'adjustment']),
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  fromWarehouseId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  transactionDate: z.string().datetime().optional(),
});

// Sentinel thrown inside db.transaction() when stock is insufficient.
// Caught outside the transaction to return a 422 without leaking through Fastify's error handler.
class InventoryError extends Error {
  constructor(message: string, public readonly available: number = 0) {
    super(message);
    this.name = 'InventoryError';
  }
}

>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
// ── Plugin ─────────────────────────────────────────────────────────

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

<<<<<<< HEAD
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
=======
  // ── Warehouses ──────────────────────────────────────────────────────

>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
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
<<<<<<< HEAD
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
=======
      db.select({ value: count() }).from(warehouses).where(
        and(eq(warehouses.tenantId, tenantId), eq(warehouses.isActive, true)),
      ),
      db.select().from(warehouses).where(
        and(eq(warehouses.tenantId, tenantId), eq(warehouses.isActive, true)),
      ).orderBy(desc(warehouses.createdAt)).limit(pageSize).offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
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

<<<<<<< HEAD
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
=======
    const [warehouse] = await db.insert(warehouses).values({
      tenantId,
      name,
      code,
      locationId: locationId ?? null,
      createdBy: userId,
      updatedBy: userId,
    }).returning();
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha

    return reply.status(201).send(warehouse);
  });

<<<<<<< HEAD
  // GET /inventory/adjustments — list inventory adjustments
  fastify.get('/inventory/adjustments', async (request: FastifyRequest, reply: FastifyReply) => {
=======
  // ── Inventory Item Balances ─────────────────────────────────────────

  fastify.get('/items', async (request: FastifyRequest, reply: FastifyReply) => {
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
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
<<<<<<< HEAD
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
=======
      db.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.tenantId, tenantId)),
      db.select().from(inventoryItems).where(eq(inventoryItems.tenantId, tenantId))
        .orderBy(desc(inventoryItems.createdAt)).limit(pageSize).offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // ── Inventory Transactions ──────────────────────────────────────────

  fastify.get('/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
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
      db.select({ value: count() }).from(inventoryTransactions).where(eq(inventoryTransactions.tenantId, tenantId)),
      db.select().from(inventoryTransactions).where(eq(inventoryTransactions.tenantId, tenantId))
        .orderBy(desc(inventoryTransactions.createdAt)).limit(pageSize).offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({ data: rows, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  // POST /transactions — core stock mutation
  // Bug fixes applied:
  //   1. db.transaction wrap — all balance updates are atomic
  //   2. transfer: decrement fromWarehouse AND increment toWarehouse
  //   3. count: absolute SET, not an increment
  //   4. avg cost formula: weighted average on receipt
  //   5. issue: 422 stock check before entering the transaction
  //   6. totalCost sign: negative for issue, positive otherwise
  fastify.post('/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createTransactionSchema.safeParse(request.body);
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
<<<<<<< HEAD
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
=======
    const {
      transactionType, itemId, warehouseId, fromWarehouseId,
      quantity, unitCost, notes, referenceNumber, transactionDate,
    } = parsed.data;

    // Bug fix 2: transfers require a source warehouse
    if (transactionType === 'transfer' && !fromWarehouseId) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'fromWarehouseId is required for transfer transactions',
      });
    }

    // Bug fix 5: pre-flight stock check for issue — return 422 before touching the DB
    if (transactionType === 'issue') {
      const [balance] = await db
        .select()
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.itemId, itemId),
          eq(inventoryItems.warehouseId, warehouseId),
        ));

      const onHand = parseFloat(balance?.quantityOnHand ?? '0');
      if (onHand < quantity) {
        return reply.status(422).send({
          error: 'INSUFFICIENT_STOCK',
          message: `Insufficient stock: ${onHand} on hand, ${quantity} requested`,
        });
      }
    }

    // Pre-flight stock check for transfer — source warehouse must have sufficient stock.
    // Mirrors the issue pre-flight above. A null fromBalance means the item has never
    // been received at that warehouse, so available = 0 and we reject immediately.
    if (transactionType === 'transfer') {
      const [sourceBalance] = await db
        .select()
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.tenantId, tenantId),
          eq(inventoryItems.itemId, itemId),
          eq(inventoryItems.warehouseId, fromWarehouseId!),
        ));

      const available = parseFloat(sourceBalance?.quantityOnHand ?? '0');
      if (available < quantity) {
        return reply.status(422).send({
          error: 'INSUFFICIENT_STOCK',
          message: `Insufficient stock in source warehouse: ${available} on hand, ${quantity} requested`,
        });
      }
    }

    // Bug fix 6: sign totalCost — negative for issues (inventory leaving)
    const signedTotalCost = transactionType === 'issue'
      ? -(quantity * unitCost)
      : quantity * unitCost;

    // Bug fix 1: wrap all inserts/updates in a single DB transaction.
    // InventoryError is thrown inside to signal a 422 condition (stock depleted between
    // pre-flight and lock acquisition) without escaping through Fastify's error handler.
    let txRecord;
    try {
    txRecord = await db.transaction(async (tx) => {
      const [txn] = await tx
        .insert(inventoryTransactions)
        .values({
          tenantId,
          transactionType,
          itemId,
          warehouseId,
          fromWarehouseId: fromWarehouseId ?? null,
          quantity: String(quantity),
          unitCost: String(unitCost),
          totalCost: String(signedTotalCost),
          notes: notes ?? null,
          referenceNumber: referenceNumber ?? null,
          transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
          createdBy: userId,
        })
        .returning();

      if (transactionType === 'receipt' || transactionType === 'adjustment') {
        const [existing] = await tx
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));

        if (existing) {
          const existingQty = parseFloat(existing.quantityOnHand);
          const existingCost = parseFloat(existing.unitCost);
          const newQty = existingQty + quantity;
          // Bug fix 4: weighted average cost
          const newUnitCost = newQty > 0
            ? (existingQty * existingCost + quantity * unitCost) / newQty
            : unitCost;

          await tx.update(inventoryItems).set({
            quantityOnHand: String(newQty),
            unitCost: String(newUnitCost),
            totalCost: String(newQty * newUnitCost),
            updatedAt: new Date(),
            updatedBy: userId,
          }).where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));
        } else {
          await tx.insert(inventoryItems).values({
            tenantId,
            itemId,
            warehouseId,
            quantityOnHand: String(quantity),
            unitCost: String(unitCost),
            totalCost: String(quantity * unitCost),
            createdBy: userId,
            updatedBy: userId,
          });
        }
      } else if (transactionType === 'issue') {
        // Re-validate with a row-level lock so concurrent issue requests that both passed
        // the pre-flight check cannot both decrement past zero.
        const [lockedRow] = await tx
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ))
          .for('update');

        const available = parseFloat(lockedRow?.quantityOnHand ?? '0');
        if (!lockedRow || available < quantity) {
          throw new InventoryError(
            `Insufficient stock: ${available} on hand, ${quantity} requested`,
            available,
          );
        }

        if (lockedRow) {
          const existing = lockedRow;
          const newQty = parseFloat(existing.quantityOnHand) - quantity;
          const currentUnitCost = parseFloat(existing.unitCost);

          await tx.update(inventoryItems).set({
            quantityOnHand: String(newQty),
            totalCost: String(newQty * currentUnitCost),
            updatedAt: new Date(),
            updatedBy: userId,
          }).where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));
        }
      } else if (transactionType === 'transfer') {
        // Bug fix 2: decrement source warehouse, increment destination warehouse

        // Decrement source (fromWarehouseId) — lock the row to prevent concurrent over-issue.
        // A null fromBalance means the item was never received here; the pre-flight already
        // caught most cases but we re-validate inside the transaction under the lock.
        const [fromBalance] = await tx
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, fromWarehouseId!),
          ))
          .for('update');

        const sourceAvailable = parseFloat(fromBalance?.quantityOnHand ?? '0');
        if (!fromBalance || sourceAvailable < quantity) {
          throw new InventoryError(
            `Insufficient stock in source warehouse: ${sourceAvailable} on hand, ${quantity} requested`,
            sourceAvailable,
          );
        }

        const sourceCostPerUnit = parseFloat(fromBalance.unitCost);

        {
          const fromNewQty = parseFloat(fromBalance.quantityOnHand) - quantity;
          await tx.update(inventoryItems).set({
            quantityOnHand: String(fromNewQty),
            totalCost: String(fromNewQty * sourceCostPerUnit),
            updatedAt: new Date(),
            updatedBy: userId,
          }).where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, fromWarehouseId!),
          ));
        }

        // Increment destination (warehouseId) with weighted average cost
        const [toBalance] = await tx
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));

        if (toBalance) {
          const toExistingQty = parseFloat(toBalance.quantityOnHand);
          const toExistingCost = parseFloat(toBalance.unitCost);
          const toNewQty = toExistingQty + quantity;
          // Bug fix 4: weighted average cost at destination
          const toNewUnitCost = toNewQty > 0
            ? (toExistingQty * toExistingCost + quantity * sourceCostPerUnit) / toNewQty
            : sourceCostPerUnit;

          await tx.update(inventoryItems).set({
            quantityOnHand: String(toNewQty),
            unitCost: String(toNewUnitCost),
            totalCost: String(toNewQty * toNewUnitCost),
            updatedAt: new Date(),
            updatedBy: userId,
          }).where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));
        } else {
          await tx.insert(inventoryItems).values({
            tenantId,
            itemId,
            warehouseId,
            quantityOnHand: String(quantity),
            unitCost: String(sourceCostPerUnit),
            totalCost: String(quantity * sourceCostPerUnit),
            createdBy: userId,
            updatedBy: userId,
          });
        }
      } else if (transactionType === 'count') {
        // Bug fix 3: physical count is an absolute SET, not an increment/decrement
        const [existing] = await tx
          .select()
          .from(inventoryItems)
          .where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));

        if (existing) {
          const currentUnitCost = parseFloat(existing.unitCost);
          await tx.update(inventoryItems).set({
            quantityOnHand: String(quantity),
            totalCost: String(quantity * currentUnitCost),
            updatedAt: new Date(),
            updatedBy: userId,
          }).where(and(
            eq(inventoryItems.tenantId, tenantId),
            eq(inventoryItems.itemId, itemId),
            eq(inventoryItems.warehouseId, warehouseId),
          ));
        } else {
          await tx.insert(inventoryItems).values({
            tenantId,
            itemId,
            warehouseId,
            quantityOnHand: String(quantity),
            unitCost: String(unitCost),
            totalCost: String(quantity * unitCost),
            createdBy: userId,
            updatedBy: userId,
          });
        }
      }

      return txn;
    });
    } catch (err) {
      if (err instanceof InventoryError) {
        return reply.status(422).send({
          error: 'INSUFFICIENT_STOCK',
          message: err.message,
        });
      }
      throw err;
    }

    return reply.status(201).send(txRecord);
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
  });
}
