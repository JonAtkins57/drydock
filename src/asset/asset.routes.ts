import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, gte, lte, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { fixedAssets, assetDepreciationBooks, assetDisposals } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { createJournalEntry } from '../gl/posting.service.js';
import { logAction } from '../core/audit.service.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const patchAssetSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  locationId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  salvageValue: z.number().int().min(0).optional(),
});

const depreciateSchema = z.object({
  bookType: z.enum(['tax', 'gaap', 'internal']),
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodDate must be YYYY-MM-DD'),
  unitsProduced: z.number().int().positive().optional(),
  periodId: z.string().uuid().optional(),
  depreciationAccountId: z.string().uuid().optional(),
  accumulatedDepreciationAccountId: z.string().uuid().optional(),
});

const disposeSchema = z.object({
  disposalType: z.enum(['sale', 'scrap', 'donation', 'write_off']),
  disposalDate: z.string().datetime(),
  proceedsAmount: z.number().int().min(0).default(0),
  notes: z.string().optional(),
  periodId: z.string().uuid().optional(),
  gainLossAccountId: z.string().uuid().optional(),
  assetAccountId: z.string().uuid().optional(),
  accumulatedDepreciationAccountId: z.string().uuid().optional(),
});

const booksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  bookType: z.enum(['tax', 'gaap', 'internal']).optional(),
});

const rollForwardQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  bookType: z.enum(['tax', 'gaap', 'internal']).optional(),
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

    await logAction({
      tenantId,
      userId,
      action: 'create',
      entityType: 'fixed_asset',
      entityId: asset.id,
      changes: { assetNumber: asset.assetNumber },
    });

    return reply.status(201).send(asset);
  });

  // GET /roll-forward — asset roll-forward report (must be before /:id)
  fastify.get('/roll-forward', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = rollForwardQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { from, to, bookType } = query.data;

    if (from > to) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'from must be on or before to',
      });
    }

    const bookConditions = and(
      eq(assetDepreciationBooks.assetId, fixedAssets.id),
      gte(assetDepreciationBooks.periodDate, from),
      lte(assetDepreciationBooks.periodDate, to),
      ...(bookType ? [eq(assetDepreciationBooks.bookType, bookType)] : []),
    );

    const rows = await db
      .select({
        assetId: fixedAssets.id,
        assetNumber: fixedAssets.assetNumber,
        name: fixedAssets.name,
        assetClass: fixedAssets.assetClass,
        status: fixedAssets.status,
        acquisitionCost: fixedAssets.acquisitionCost,
        accumulatedDepreciation: fixedAssets.accumulatedDepreciation,
        netBookValue: fixedAssets.netBookValue,
        totalDepreciationExpense: sql<number>`COALESCE(SUM(${assetDepreciationBooks.depreciationExpense}), 0)`,
        periodCount: sql<number>`COUNT(${assetDepreciationBooks.id})`,
        beginningNetBookValue: sql<number>`MIN(${assetDepreciationBooks.beginningBookValue})`,
        endingNetBookValue: sql<number>`MAX(${assetDepreciationBooks.endingBookValue})`,
      })
      .from(fixedAssets)
      .leftJoin(assetDepreciationBooks, bookConditions)
      .where(eq(fixedAssets.tenantId, tenantId))
      .groupBy(
        fixedAssets.id,
        fixedAssets.assetNumber,
        fixedAssets.name,
        fixedAssets.assetClass,
        fixedAssets.status,
        fixedAssets.acquisitionCost,
        fixedAssets.accumulatedDepreciation,
        fixedAssets.netBookValue,
      )
      .orderBy(fixedAssets.assetNumber);

    return reply.send({
      data: rows,
      meta: { from, to, bookType: bookType ?? null },
    });
  });

  // GET /:id/books — depreciation book entries for an asset
  fastify.get('/:id/books', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.currentUser;

    const query = booksQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const [asset] = await db
      .select({ id: fixedAssets.id })
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .limit(1);

    if (!asset) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Asset not found' });
    }

    const { page, pageSize, bookType } = query.data;
    const offset = (page - 1) * pageSize;

    const conditions = and(
      eq(assetDepreciationBooks.assetId, id),
      eq(assetDepreciationBooks.tenantId, tenantId),
      ...(bookType ? [eq(assetDepreciationBooks.bookType, bookType)] : []),
    );

    const [totalResult, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(assetDepreciationBooks)
        .where(conditions),
      db
        .select()
        .from(assetDepreciationBooks)
        .where(conditions)
        .orderBy(desc(assetDepreciationBooks.periodDate))
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

  // GET /:id — single asset
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId } = request.currentUser;

    const [asset] = await db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .limit(1);

    if (!asset) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Asset not found' });
    }

    return reply.send(asset);
  });

  // PATCH /:id — partial update
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId, sub: userId } = request.currentUser;

    const parsed = patchAssetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const [existing] = await db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Asset not found' });
    }

    const { name, description, locationId, departmentId, usefulLifeMonths, salvageValue } = parsed.data;
    const updates: Partial<typeof fixedAssets.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: userId,
    };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (locationId !== undefined) updates.locationId = locationId ?? null;
    if (departmentId !== undefined) updates.departmentId = departmentId ?? null;
    if (usefulLifeMonths !== undefined) updates.usefulLifeMonths = usefulLifeMonths;
    if (salvageValue !== undefined) updates.salvageValue = salvageValue;

    const [updated] = await db
      .update(fixedAssets)
      .set(updates)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .returning();

    await logAction({
      tenantId,
      userId,
      action: 'update',
      entityType: 'fixed_asset',
      entityId: id,
      changes: {
        before: {
          name: existing.name,
          locationId: existing.locationId,
          departmentId: existing.departmentId,
          usefulLifeMonths: existing.usefulLifeMonths,
          salvageValue: existing.salvageValue,
        },
        after: parsed.data,
      },
    });

    return reply.send(updated);
  });

  // POST /:id/actions/depreciate — run one period of depreciation
  fastify.post('/:id/actions/depreciate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId, sub: userId } = request.currentUser;

    const parsed = depreciateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { bookType, periodDate, unitsProduced, periodId, depreciationAccountId, accumulatedDepreciationAccountId } = parsed.data;

    // Fetch asset
    const [asset] = await db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .limit(1);

    if (!asset) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Asset not found' });
    }

    if (asset.status === 'disposed' || asset.status === 'fully_depreciated') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: `Cannot depreciate asset with status: ${asset.status}`,
      });
    }

    // Check for duplicate period
    const [existing] = await db
      .select({ id: assetDepreciationBooks.id })
      .from(assetDepreciationBooks)
      .where(
        and(
          eq(assetDepreciationBooks.assetId, id),
          eq(assetDepreciationBooks.bookType, bookType),
          eq(assetDepreciationBooks.periodDate, periodDate),
        ),
      )
      .limit(1);

    if (existing) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Depreciation already posted for this asset, book type, and period',
      });
    }

    // Calculate depreciation expense
    const currentNBV = asset.netBookValue;
    const { acquisitionCost, salvageValue, usefulLifeMonths, depreciationMethod } = asset;
    let expenseAmount: number;

    if (depreciationMethod === 'straight_line') {
      expenseAmount = Math.floor((acquisitionCost - salvageValue) / usefulLifeMonths);
    } else if (depreciationMethod === 'declining_balance') {
      expenseAmount = Math.floor((currentNBV * 2) / usefulLifeMonths);
    } else {
      // units_of_production — usefulLifeMonths repurposed as totalUnitsEstimated
      if (unitsProduced === undefined) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'unitsProduced is required for units_of_production method',
        });
      }
      expenseAmount = Math.floor(((acquisitionCost - salvageValue) / usefulLifeMonths) * unitsProduced);
    }

    // Cap so NBV never drops below salvageValue
    const maxExpense = currentNBV - salvageValue;
    const cappedExpense = Math.min(expenseAmount, Math.max(0, maxExpense));

    const newAccumulated = asset.accumulatedDepreciation + cappedExpense;
    const newNBV = currentNBV - cappedExpense;
    const fullyDepreciated = newNBV <= salvageValue;

    // Post GL entry if all GL params provided
    if (periodId && depreciationAccountId && accumulatedDepreciationAccountId) {
      const glResult = await createJournalEntry(
        tenantId,
        {
          journalType: 'automated',
          periodId,
          postingDate: new Date().toISOString(),
          description: `Depreciation - ${asset.assetNumber} ${asset.name} (${bookType}) ${periodDate}`,
          sourceModule: 'asset',
          sourceEntityType: 'fixed_asset',
          sourceEntityId: asset.id,
          lines: [
            { accountId: depreciationAccountId, debitAmount: cappedExpense, creditAmount: 0 },
            { accountId: accumulatedDepreciationAccountId, debitAmount: 0, creditAmount: cappedExpense },
          ],
        },
        userId,
      );

      if (!glResult.ok) {
        return reply.status(422).send({
          error: 'GL_ERROR',
          message: glResult.error.message,
        });
      }
    }

    // Persist book row + update asset in transaction
    const result = await db.transaction(async (tx) => {
      const [bookRow] = await tx
        .insert(assetDepreciationBooks)
        .values({
          tenantId,
          assetId: id,
          bookType,
          periodDate,
          beginningBookValue: currentNBV,
          depreciationExpense: cappedExpense,
          accumulatedDepreciation: newAccumulated,
          endingBookValue: newNBV,
          createdBy: userId,
        })
        .returning();

      const [updatedAsset] = await tx
        .update(fixedAssets)
        .set({
          accumulatedDepreciation: newAccumulated,
          netBookValue: newNBV,
          status: fullyDepreciated ? 'fully_depreciated' : 'active',
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
        .returning();

      return { bookRow, asset: updatedAsset };
    });

    await logAction({
      tenantId,
      userId,
      action: 'depreciate',
      entityType: 'fixed_asset',
      entityId: id,
      changes: { bookType, periodDate, expense: cappedExpense },
    });

    return reply.status(201).send(result);
  });

  // POST /:id/actions/dispose — record asset disposal
  fastify.post('/:id/actions/dispose', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { tenantId, sub: userId } = request.currentUser;

    const parsed = disposeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { disposalType, disposalDate, proceedsAmount, notes, periodId, gainLossAccountId, assetAccountId, accumulatedDepreciationAccountId } = parsed.data;

    // Fetch asset
    const [asset] = await db
      .select()
      .from(fixedAssets)
      .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
      .limit(1);

    if (!asset) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Asset not found' });
    }

    if (asset.status === 'disposed') {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Asset is already disposed',
      });
    }

    const netBookValueAtDisposal = asset.netBookValue;
    const gainLossAmount = proceedsAmount - netBookValueAtDisposal;

    // Post GL entry if all GL params provided
    if (periodId && gainLossAccountId && assetAccountId && accumulatedDepreciationAccountId) {
      const glLines: Array<{ accountId: string; debitAmount: number; creditAmount: number }> = [
        { accountId: accumulatedDepreciationAccountId, debitAmount: asset.accumulatedDepreciation, creditAmount: 0 },
        { accountId: assetAccountId, debitAmount: 0, creditAmount: asset.acquisitionCost },
      ];

      if (gainLossAmount > 0) {
        glLines.push({ accountId: gainLossAccountId, debitAmount: 0, creditAmount: gainLossAmount });
      } else if (gainLossAmount < 0) {
        glLines.push({ accountId: gainLossAccountId, debitAmount: Math.abs(gainLossAmount), creditAmount: 0 });
      }

      const glResult = await createJournalEntry(
        tenantId,
        {
          journalType: 'automated',
          periodId,
          postingDate: new Date(disposalDate).toISOString(),
          description: `Asset disposal - ${asset.assetNumber} ${asset.name} (${disposalType})`,
          sourceModule: 'asset',
          sourceEntityType: 'fixed_asset',
          sourceEntityId: asset.id,
          lines: glLines,
        },
        userId,
      );

      if (!glResult.ok) {
        return reply.status(422).send({
          error: 'GL_ERROR',
          message: glResult.error.message,
        });
      }
    }

    // Persist disposal + update asset in transaction
    const result = await db.transaction(async (tx) => {
      const [disposal] = await tx
        .insert(assetDisposals)
        .values({
          tenantId,
          assetId: id,
          disposalType,
          disposalDate: new Date(disposalDate),
          proceedsAmount,
          netBookValueAtDisposal,
          gainLossAmount,
          notes: notes ?? null,
          createdBy: userId,
        })
        .returning();

      const [updatedAsset] = await tx
        .update(fixedAssets)
        .set({
          status: 'disposed',
          disposalDate: new Date(disposalDate),
          disposalProceeds: proceedsAmount,
          isActive: false,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(and(eq(fixedAssets.id, id), eq(fixedAssets.tenantId, tenantId)))
        .returning();

      return { disposal, asset: updatedAsset };
    });

    await logAction({
      tenantId,
      userId,
      action: 'dispose',
      entityType: 'fixed_asset',
      entityId: id,
      changes: { disposalType, gainLossAmount },
    });

    return reply.status(201).send(result);
  });
}
