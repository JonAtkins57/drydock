import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { quotes, quoteLines, salesOrders, orderLines } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateQuoteInput,
  UpdateQuoteInput,
  ListQuotesQuery,
  PaginatedResponse,
} from './q2c.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type QuoteRow = typeof quotes.$inferSelect;
type QuoteLineRow = typeof quoteLines.$inferSelect;

interface QuoteWithLines extends QuoteRow {
  lines: QuoteLineRow[];
}

// ── Create Quote ───────────────────────────────────────────────────

async function createQuote(
  tenantId: string,
  data: CreateQuoteInput,
  userId: string,
): Promise<Result<QuoteWithLines, AppError>> {
  const numResult = await generateNumber(tenantId, 'quote');
  if (!numResult.ok) return numResult;

  const totalAmount = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  const quoteRows = await db
    .insert(quotes)
    .values({
      tenantId,
      quoteNumber: numResult.value,
      customerId: data.customerId,
      name: data.name,
      status: 'draft',
      totalAmount,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      notes: data.notes ?? null,
      version: 1,
      parentQuoteId: null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const quote = quoteRows[0];
  if (!quote) {
    return err({ code: 'INTERNAL', message: 'Failed to create quote' });
  }

  const lineValues = data.lines.map((l, idx) => ({
    tenantId,
    quoteId: quote.id,
    lineNumber: idx + 1,
    itemId: l.itemId ?? null,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.quantity * l.unitPrice,
    accountId: l.accountId ?? null,
  }));

  const lines = await db.insert(quoteLines).values(lineValues).returning();

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'quote',
    entityId: quote.id,
    changes: { name: data.name, lineCount: data.lines.length },
  });

  return ok({ ...quote, lines });
}

// ── Get Quote ──────────────────────────────────────────────────────

async function getQuote(
  tenantId: string,
  id: string,
): Promise<Result<QuoteWithLines, AppError>> {
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .limit(1);

  const quote = rows[0];
  if (!quote) {
    return err({ code: 'NOT_FOUND', message: `Quote '${id}' not found` });
  }

  const lines = await db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.quoteId, id), eq(quoteLines.tenantId, tenantId)));

  return ok({ ...quote, lines });
}

// ── List Quotes ────────────────────────────────────────────────────

async function listQuotes(
  tenantId: string,
  options: ListQuotesQuery,
): Promise<Result<PaginatedResponse<QuoteRow>, AppError>> {
  const { page, pageSize, status, customerId } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(quotes.tenantId, tenantId)];
  if (status) conditions.push(eq(quotes.status, status));
  if (customerId) conditions.push(eq(quotes.customerId, customerId));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(whereClause),
    db.select().from(quotes).where(whereClause).orderBy(desc(quotes.createdAt)).limit(pageSize).offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

// ── Update Quote (versioning) ──────────────────────────────────────

async function updateQuote(
  tenantId: string,
  id: string,
  data: UpdateQuoteInput,
  userId: string,
): Promise<Result<QuoteWithLines, AppError>> {
  const existing = await getQuote(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    // Non-draft quote: create new version linked to parent
    const numResult = await generateNumber(tenantId, 'quote');
    if (!numResult.ok) return numResult;

    const lines = data.lines ?? existing.value.lines.map((l) => ({
      itemId: l.itemId ?? undefined,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      accountId: l.accountId ?? undefined,
    }));

    const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

    const newQuoteRows = await db
      .insert(quotes)
      .values({
        tenantId,
        quoteNumber: numResult.value,
        customerId: existing.value.customerId,
        name: data.name ?? existing.value.name,
        status: 'draft',
        totalAmount,
        validUntil: data.validUntil ? new Date(data.validUntil) : existing.value.validUntil,
        notes: data.notes ?? existing.value.notes,
        version: existing.value.version + 1,
        parentQuoteId: existing.value.id,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    const newQuote = newQuoteRows[0];
    if (!newQuote) {
      return err({ code: 'INTERNAL', message: 'Failed to create quote version' });
    }

    const lineValues = lines.map((l, idx) => ({
      tenantId,
      quoteId: newQuote.id,
      lineNumber: idx + 1,
      itemId: l.itemId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.quantity * l.unitPrice,
      accountId: l.accountId ?? null,
    }));

    const newLines = await db.insert(quoteLines).values(lineValues).returning();

    await logAction({
      tenantId,
      userId,
      action: 'version',
      entityType: 'quote',
      entityId: newQuote.id,
      changes: { parentQuoteId: existing.value.id, version: newQuote.version },
    });

    return ok({ ...newQuote, lines: newLines });
  }

  // Draft quote: update in-place
  const updateData: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  if (data.name !== undefined) updateData['name'] = data.name;
  if (data.validUntil !== undefined) updateData['validUntil'] = new Date(data.validUntil);
  if (data.notes !== undefined) updateData['notes'] = data.notes;

  if (data.lines) {
    const totalAmount = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    updateData['totalAmount'] = totalAmount;

    // Delete existing lines and insert new ones
    await db.delete(quoteLines).where(and(eq(quoteLines.quoteId, id), eq(quoteLines.tenantId, tenantId)));

    const lineValues = data.lines.map((l, idx) => ({
      tenantId,
      quoteId: id,
      lineNumber: idx + 1,
      itemId: l.itemId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.quantity * l.unitPrice,
      accountId: l.accountId ?? null,
    }));

    await db.insert(quoteLines).values(lineValues);
  }

  const updatedRows = await db
    .update(quotes)
    .set(updateData)
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  const updated = updatedRows[0];
  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update quote' });
  }

  const lines = await db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.quoteId, id), eq(quoteLines.tenantId, tenantId)));

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'quote',
    entityId: id,
    changes: data as Record<string, unknown>,
  });

  return ok({ ...updated, lines });
}

// ── Send Quote ─────────────────────────────────────────────────────

async function sendQuote(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<QuoteRow, AppError>> {
  const existing = await getQuote(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'draft') {
    return err({ code: 'CONFLICT', message: `Quote can only be sent from draft status, current: ${existing.value.status}` });
  }

  const rows = await db
    .update(quotes)
    .set({ status: 'sent', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) return err({ code: 'INTERNAL', message: 'Failed to send quote' });

  await logAction({ tenantId, userId, action: 'send', entityType: 'quote', entityId: id });

  return ok(row);
}

// ── Accept Quote → auto-create Sales Order ─────────────────────────

async function acceptQuote(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<{ quote: QuoteRow; salesOrder: typeof salesOrders.$inferSelect }, AppError>> {
  const existing = await getQuote(tenantId, id);
  if (!existing.ok) return existing;

  if (existing.value.status !== 'sent') {
    return err({ code: 'CONFLICT', message: `Quote can only be accepted from sent status, current: ${existing.value.status}` });
  }

  // Update quote status
  const quoteRows = await db
    .update(quotes)
    .set({ status: 'accepted', updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)))
    .returning();

  const updatedQuote = quoteRows[0];
  if (!updatedQuote) return err({ code: 'INTERNAL', message: 'Failed to accept quote' });

  // Auto-create sales order
  const orderNumResult = await generateNumber(tenantId, 'sales_order');
  if (!orderNumResult.ok) return orderNumResult;

  const soRows = await db
    .insert(salesOrders)
    .values({
      tenantId,
      orderNumber: orderNumResult.value,
      customerId: existing.value.customerId,
      quoteId: id,
      status: 'draft',
      totalAmount: existing.value.totalAmount,
      notes: existing.value.notes,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const so = soRows[0];
  if (!so) return err({ code: 'INTERNAL', message: 'Failed to create sales order from quote' });

  // Copy quote lines to order lines
  const olValues = existing.value.lines.map((ql) => ({
    tenantId,
    orderId: so.id,
    lineNumber: ql.lineNumber,
    itemId: ql.itemId ?? null,
    description: ql.description,
    quantity: ql.quantity,
    unitPrice: ql.unitPrice,
    amount: ql.amount,
  }));

  if (olValues.length > 0) {
    await db.insert(orderLines).values(olValues);
  }

  await logAction({
    tenantId,
    userId,
    action: 'accept',
    entityType: 'quote',
    entityId: id,
    changes: { salesOrderId: so.id },
  });

  return ok({ quote: updatedQuote, salesOrder: so });
}

export const quoteService = {
  createQuote,
  getQuote,
  listQuotes,
  updateQuote,
  sendQuote,
  acceptQuote,
};
