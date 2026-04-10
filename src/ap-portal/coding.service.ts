import { eq, and, asc, sql, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { apInvoices, apInvoiceLines, codingRules } from '../db/schema/index';
import { ok, err, type Result, type AppError } from '../lib/result';
import { logAction } from '../core/audit.service';
import type { UpdateLineCodingInput } from './ap.schemas';

// ── Types ──────────────────────────────────────────────────────────

type ApInvoice = typeof apInvoices.$inferSelect;
type ApInvoiceLine = typeof apInvoiceLines.$inferSelect;
type CodingRule = typeof codingRules.$inferSelect;

interface CodingApplication {
  linesUpdated: number;
  rulesApplied: CodingRule[];
}

// ── Apply Coding Rules ────────────────────────────────────────────

export async function applyCodingRules(
  tenantId: string,
  invoiceId: string,
): Promise<Result<CodingApplication, AppError>> {
  // Verify invoice exists and is in coding status
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  if (invoice.status !== 'coding' && invoice.status !== 'review') {
    return err({
      code: 'VALIDATION',
      message: `Cannot apply coding rules to invoice in '${invoice.status}' status. Must be 'coding' or 'review'.`,
    });
  }

  // Fetch all active coding rules for this tenant, ordered by priority desc
  const rules = await db
    .select()
    .from(codingRules)
    .where(and(eq(codingRules.tenantId, tenantId), eq(codingRules.isActive, true)))
    .orderBy(desc(codingRules.priority));

  // Fetch invoice lines
  const lines = await db
    .select()
    .from(apInvoiceLines)
    .where(
      and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.apInvoiceId, invoiceId)),
    )
    .orderBy(asc(apInvoiceLines.lineNumber));

  let linesUpdated = 0;
  const rulesApplied: CodingRule[] = [];

  for (const line of lines) {
    // Skip lines that already have an account coded
    if (line.accountId) continue;

    const matchedRule = findMatchingRule(rules, invoice.vendorId, line.description);
    if (!matchedRule) continue;

    // Apply the rule defaults to the line
    await db
      .update(apInvoiceLines)
      .set({
        accountId: matchedRule.defaultAccountId,
        departmentId: matchedRule.defaultDepartmentId ?? line.departmentId,
        projectId: matchedRule.defaultProjectId ?? line.projectId,
        costCenterId: matchedRule.defaultCostCenterId ?? line.costCenterId,
        updatedAt: new Date(),
      })
      .where(and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.id, line.id)));

    // Increment match count on the rule
    await db
      .update(codingRules)
      .set({
        matchCount: sql`${codingRules.matchCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(codingRules.id, matchedRule.id));

    linesUpdated++;
    if (!rulesApplied.find((r) => r.id === matchedRule.id)) {
      rulesApplied.push(matchedRule);
    }
  }

  return ok({ linesUpdated, rulesApplied });
}

// ── Find Matching Rule ────────────────────────────────────────────

function findMatchingRule(
  rules: CodingRule[],
  vendorId: string,
  lineDescription: string | null,
): CodingRule | null {
  for (const rule of rules) {
    // Vendor-specific rules match first (higher priority)
    const vendorMatch = !rule.vendorId || rule.vendorId === vendorId;
    if (!vendorMatch) continue;

    // Description pattern match (case-insensitive substring)
    if (rule.descriptionPattern && lineDescription) {
      const pattern = rule.descriptionPattern.toLowerCase();
      if (lineDescription.toLowerCase().includes(pattern)) {
        return rule;
      }
    }

    // Vendor-only rule (no description pattern) — matches all lines for that vendor
    if (rule.vendorId && !rule.descriptionPattern) {
      return rule;
    }

    // Catch-all rule (no vendor, no pattern)
    if (!rule.vendorId && !rule.descriptionPattern) {
      return rule;
    }
  }

  return null;
}

// ── Update Line Coding (Manual) ───────────────────────────────────

export async function updateLineCoding(
  tenantId: string,
  invoiceId: string,
  lineId: string,
  codingData: UpdateLineCodingInput,
  userId: string,
): Promise<Result<ApInvoiceLine, AppError>> {
  // Verify invoice exists and is in a codable status
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  if (invoice.status !== 'coding' && invoice.status !== 'review') {
    return err({
      code: 'VALIDATION',
      message: `Cannot update coding on invoice in '${invoice.status}' status.`,
    });
  }

  // Verify line exists and belongs to this invoice
  const [line] = await db
    .select()
    .from(apInvoiceLines)
    .where(
      and(
        eq(apInvoiceLines.tenantId, tenantId),
        eq(apInvoiceLines.apInvoiceId, invoiceId),
        eq(apInvoiceLines.id, lineId),
      ),
    )
    .limit(1);

  if (!line) {
    return err({ code: 'NOT_FOUND', message: 'Invoice line not found' });
  }

  const [updated] = await db
    .update(apInvoiceLines)
    .set({
      accountId: codingData.accountId !== undefined ? codingData.accountId : line.accountId,
      departmentId: codingData.departmentId !== undefined ? codingData.departmentId : line.departmentId,
      projectId: codingData.projectId !== undefined ? codingData.projectId : line.projectId,
      costCenterId: codingData.costCenterId !== undefined ? codingData.costCenterId : line.costCenterId,
      updatedAt: new Date(),
    })
    .where(and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.id, lineId)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update line coding' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'ap_invoice_line.update_coding',
    entityType: 'ap_invoice_line',
    entityId: lineId,
    changes: codingData as Record<string, unknown>,
  });

  return ok(updated);
}

// ── Submit For Approval ───────────────────────────────────────────

export async function submitForApproval(
  tenantId: string,
  invoiceId: string,
  userId: string,
): Promise<Result<ApInvoice, AppError>> {
  const [invoice] = await db
    .select()
    .from(apInvoices)
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .limit(1);

  if (!invoice) {
    return err({ code: 'NOT_FOUND', message: 'AP invoice not found' });
  }

  if (invoice.status !== 'coding') {
    return err({
      code: 'VALIDATION',
      message: `Cannot submit invoice in '${invoice.status}' status. Must be 'coding'.`,
    });
  }

  // Verify all lines have accounts coded
  const uncoded = await db
    .select({ id: apInvoiceLines.id })
    .from(apInvoiceLines)
    .where(
      and(
        eq(apInvoiceLines.tenantId, tenantId),
        eq(apInvoiceLines.apInvoiceId, invoiceId),
        sql`${apInvoiceLines.accountId} IS NULL`,
      ),
    )
    .limit(1);

  if (uncoded.length > 0) {
    return err({
      code: 'VALIDATION',
      message: 'All invoice lines must have an account coded before submitting for approval',
    });
  }

  const [updated] = await db
    .update(apInvoices)
    .set({ status: 'approval', updatedAt: new Date(), updatedBy: userId })
    .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to submit invoice for approval' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'ap_invoice.submit_for_approval',
    entityType: 'ap_invoice',
    entityId: invoiceId,
  });

  return ok(updated);
}
