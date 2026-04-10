import { eq, and } from 'drizzle-orm';
import { db, pool } from '../db/connection';
import { apInvoices, apInvoiceLines, poMatchResults } from '../db/schema/index';
import { ok, err, type Result, type AppError } from '../lib/result';
import { logAction } from '../core/audit.service';

// ── Types ──────────────────────────────────────────────────────────

type PoMatchResult = typeof poMatchResults.$inferSelect;

const DEFAULT_PRICE_TOLERANCE_PERCENT = 5;
const DEFAULT_QUANTITY_TOLERANCE = 0;

interface MatchInput {
  poTotalAmount: number;
  poQuantity?: number;
  receiptQuantity?: number;
}

// ── Two-Way Match (Invoice vs PO) ─────────────────────────────────

export async function matchToPO(
  tenantId: string,
  invoiceId: string,
  poId: string,
  poData?: MatchInput,
): Promise<Result<PoMatchResult, AppError>> {
  // Verify invoice exists
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  // If no PO data provided, look up from existing PO tables
  // For now, require poData to be passed (PO module integration point)
  if (!poData) {
    // Attempt to read PO from p2p schema — fallback to requiring explicit data
    const poResult = await lookupPOAmount(tenantId, poId);
    if (!poResult.ok) return poResult;
    poData = poResult.value;
  }

  const invoiceAmount = invoice.totalAmount ?? 0;
  const priceVariance = invoiceAmount - poData.poTotalAmount;
  const variancePercent = poData.poTotalAmount !== 0
    ? Math.abs(priceVariance / poData.poTotalAmount) * 100
    : (priceVariance === 0 ? 0 : 100);

  let matchStatus: 'matched' | 'tolerance' | 'exception';
  if (priceVariance === 0) {
    matchStatus = 'matched';
  } else if (variancePercent <= DEFAULT_PRICE_TOLERANCE_PERCENT) {
    matchStatus = 'tolerance';
  } else {
    matchStatus = 'exception';
  }

  const [result] = await db
    .insert(poMatchResults)
    .values({
      tenantId,
      apInvoiceId: invoiceId,
      poId,
      matchType: 'two_way',
      matchStatus,
      priceVariance,
      quantityVariance: 0,
      tolerancePercent: String(DEFAULT_PRICE_TOLERANCE_PERCENT),
      notes: `Price variance: ${priceVariance} cents (${variancePercent.toFixed(2)}%)`,
    })
    .returning();

  if (!result) {
    return err({ code: 'INTERNAL', message: 'Failed to create PO match result' });
  }

  // Link PO to invoice if not already linked
  if (!invoice.poId) {
    await db
      .update(apInvoices)
      .set({ poId, updatedAt: new Date() })
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)));
  }

  await logAction({
    tenantId,
    userId: null,
    action: 'ap_invoice.po_match',
    entityType: 'ap_invoice',
    entityId: invoiceId,
    changes: { poId, matchType: 'two_way', matchStatus, priceVariance },
  });

  return ok(result);
}

// ── Three-Way Match (Invoice vs PO vs Receipt) ───────────────────

export async function threeWayMatch(
  tenantId: string,
  invoiceId: string,
  poId: string,
  receiptId: string,
  matchInput?: MatchInput,
): Promise<Result<PoMatchResult, AppError>> {
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  if (!matchInput) {
    const poResult = await lookupPOAmount(tenantId, poId);
    if (!poResult.ok) return poResult;
    matchInput = poResult.value;
  }

  const invoiceAmount = invoice.totalAmount ?? 0;
  const priceVariance = invoiceAmount - matchInput.poTotalAmount;
  const variancePercent = matchInput.poTotalAmount !== 0
    ? Math.abs(priceVariance / matchInput.poTotalAmount) * 100
    : (priceVariance === 0 ? 0 : 100);

  // Quantity check: invoice line quantities vs receipt quantities
  const quantityVariance = (matchInput.receiptQuantity ?? 0) - (matchInput.poQuantity ?? 0);

  let matchStatus: 'matched' | 'tolerance' | 'exception';
  if (priceVariance === 0 && quantityVariance === 0) {
    matchStatus = 'matched';
  } else if (
    variancePercent <= DEFAULT_PRICE_TOLERANCE_PERCENT &&
    Math.abs(quantityVariance) <= DEFAULT_QUANTITY_TOLERANCE
  ) {
    matchStatus = 'tolerance';
  } else {
    matchStatus = 'exception';
  }

  const [result] = await db
    .insert(poMatchResults)
    .values({
      tenantId,
      apInvoiceId: invoiceId,
      poId,
      matchType: 'three_way',
      matchStatus,
      priceVariance,
      quantityVariance,
      tolerancePercent: String(DEFAULT_PRICE_TOLERANCE_PERCENT),
      notes: `Price variance: ${priceVariance} cents (${variancePercent.toFixed(2)}%), Qty variance: ${quantityVariance}. Receipt: ${receiptId}`,
    })
    .returning();

  if (!result) {
    return err({ code: 'INTERNAL', message: 'Failed to create PO match result' });
  }

  if (!invoice.poId) {
    await db
      .update(apInvoices)
      .set({ poId, updatedAt: new Date() })
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)));
  }

  await logAction({
    tenantId,
    userId: null,
    action: 'ap_invoice.three_way_match',
    entityType: 'ap_invoice',
    entityId: invoiceId,
    changes: { poId, receiptId, matchType: 'three_way', matchStatus, priceVariance, quantityVariance },
  });

  return ok(result);
}

// ── PO Lookup Stub ────────────────────────────────────────────────
// Integration point with P2P module. Returns PO totals for matching.

async function lookupPOAmount(
  tenantId: string,
  poId: string,
): Promise<Result<MatchInput, AppError>> {
  // Try reading from p2p schema purchase_orders table
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ total_amount: string; total_quantity: string }>(
        `SELECT
           COALESCE(SUM(line_amount), 0)::text AS total_amount,
           COALESCE(SUM(quantity), 0)::text AS total_quantity
         FROM drydock_p2p.purchase_order_lines
         WHERE purchase_order_id = $1`,
        [poId],
      );
      const row = rows[0];
      if (row) {
        return ok({
          poTotalAmount: parseInt(row.total_amount, 10),
          poQuantity: parseInt(row.total_quantity, 10),
        });
      }
    } finally {
      client.release();
    }
  } catch {
    // P2P schema may not exist yet — fall through
  }

  return err({
    code: 'NOT_FOUND',
    message: `PO ${poId} not found. Pass poData explicitly or ensure the P2P module is set up.`,
  });
}
