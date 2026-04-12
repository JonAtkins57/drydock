import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { apAllocations } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface AllocationLineInput {
  invoiceLineId?: string;
  accountId: string;
  departmentId?: string;
  projectId?: string;
  costCenterId?: string;
  amountCents: number;
  allocationPct?: number;
}

export async function listAllocations(
  tenantId: string,
  invoiceId: string,
): Promise<Result<typeof apAllocations.$inferSelect[], AppError>> {
  try {
    const rows = await db.select().from(apAllocations)
      .where(and(eq(apAllocations.tenantId, tenantId), eq(apAllocations.invoiceId, invoiceId)));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list allocations', details: { error: e } });
  }
}

export async function setAllocations(
  tenantId: string,
  userId: string,
  invoiceId: string,
  lines: AllocationLineInput[],
): Promise<Result<typeof apAllocations.$inferSelect[], AppError>> {
  try {
    // Validate amounts sum (if percentages given, they must sum to 100)
    const hasPct = lines.some((l) => l.allocationPct != null);
    if (hasPct) {
      const total = lines.reduce((s, l) => s + (l.allocationPct ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        return err({ code: 'VALIDATION', message: `Allocation percentages must sum to 100 (got ${total})` });
      }
    }

    await db.delete(apAllocations)
      .where(and(eq(apAllocations.tenantId, tenantId), eq(apAllocations.invoiceId, invoiceId)));

    if (lines.length === 0) return ok([]);

    const rows = await db.insert(apAllocations).values(
      lines.map((l) => ({
        tenantId,
        invoiceId,
        invoiceLineId: l.invoiceLineId ?? null,
        accountId: l.accountId,
        departmentId: l.departmentId ?? null,
        projectId: l.projectId ?? null,
        costCenterId: l.costCenterId ?? null,
        amountCents: l.amountCents,
        allocationPct: l.allocationPct?.toString() ?? null,
        status: 'pending' as const,
        createdBy: userId,
      })),
    ).returning();

    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to set allocations', details: { error: e } });
  }
}

export async function approveAllocations(
  tenantId: string,
  invoiceId: string,
): Promise<Result<void, AppError>> {
  try {
    await db.update(apAllocations).set({ status: 'approved', updatedAt: new Date() })
      .where(and(eq(apAllocations.tenantId, tenantId), eq(apAllocations.invoiceId, invoiceId)));
    return ok(undefined);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to approve allocations', details: { error: e } });
  }
}
