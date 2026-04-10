import { eq, and, sql, desc, type SQL } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { contracts, contractLines } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type {
  CreateContractInput,
  UpdateContractInput,
  ListContractsQuery,
  AddContractLineInput,
  ContractStatus,
  PaginatedResponse,
} from './crm.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type ContractRow = typeof contracts.$inferSelect;
type ContractLineRow = typeof contractLines.$inferSelect;

// ── Allowed Status Transitions ─────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['executed'],
  executed: ['active'],
  active: ['expired', 'terminated'],
  expired: [],
  terminated: [],
};

// ── Create Contract ────────────────────────────────────────────────

export async function createContract(
  tenantId: string,
  data: CreateContractInput,
  userId: string,
): Promise<Result<ContractRow, AppError>> {
  const rows = await db
    .insert(contracts)
    .values({
      tenantId,
      contractNumber: data.contractNumber,
      name: data.name,
      customerId: data.customerId,
      opportunityId: data.opportunityId ?? null,
      status: data.status ?? 'draft',
      effectiveDate: new Date(data.effectiveDate),
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
      totalValue: data.totalValue ?? null,
      terms: data.terms ?? null,
      autoRenew: data.autoRenew ?? false,
      renewalNoticeDays: data.renewalNoticeDays ?? null,
      billingPlanId: data.billingPlanId ?? null,
      assignedTo: data.assignedTo ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create contract' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'contract',
    entityId: row.id,
    changes: data as Record<string, unknown>,
  });

  return ok(row);
}

// ── Get Contract ───────────────────────────────────────────────────

export async function getContract(
  tenantId: string,
  id: string,
): Promise<Result<ContractRow, AppError>> {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: `Contract '${id}' not found` });
  }

  return ok(row);
}

// ── List Contracts ─────────────────────────────────────────────────

export async function listContracts(
  tenantId: string,
  options: ListContractsQuery,
): Promise<Result<PaginatedResponse<ContractRow>, AppError>> {
  const { page, pageSize, status, customerId, assignedTo } = options;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(contracts.tenantId, tenantId)];
  if (status) conditions.push(eq(contracts.status, status));
  if (customerId) conditions.push(eq(contracts.customerId, customerId));
  if (assignedTo) conditions.push(eq(contracts.assignedTo, assignedTo));

  const whereClause = and(...conditions);

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contracts)
      .where(whereClause),
    db
      .select()
      .from(contracts)
      .where(whereClause)
      .orderBy(desc(contracts.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = countResult[0]?.count ?? 0;

  return ok({
    data: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// ── Update Contract ────────────────────────────────────────────────

export async function updateContract(
  tenantId: string,
  id: string,
  data: UpdateContractInput,
  userId: string,
): Promise<Result<ContractRow, AppError>> {
  const existing = await getContract(tenantId, id);
  if (!existing.ok) return existing;

  const updateData: Record<string, unknown> = { ...data, updatedBy: userId, updatedAt: new Date() };

  if (data.effectiveDate !== undefined) {
    updateData['effectiveDate'] = new Date(data.effectiveDate);
  }
  if (data.expirationDate !== undefined) {
    updateData['expirationDate'] = data.expirationDate ? new Date(data.expirationDate) : null;
  }

  const rows = await db
    .update(contracts)
    .set(updateData)
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to update contract' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'update',
    entityType: 'contract',
    entityId: id,
    changes: { before: existing.value, after: data },
  });

  return ok(row);
}

// ── Transition Contract Status ─────────────────────────────────────

export async function transitionContractStatus(
  tenantId: string,
  id: string,
  toStatus: ContractStatus,
  userId: string,
): Promise<Result<ContractRow, AppError>> {
  const existing = await getContract(tenantId, id);
  if (!existing.ok) return existing;

  const currentStatus = existing.value.status as ContractStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];

  if (!allowed.includes(toStatus)) {
    return err({
      code: 'BAD_REQUEST',
      message: `Cannot transition contract from '${currentStatus}' to '${toStatus}'`,
    });
  }

  const rows = await db
    .update(contracts)
    .set({ status: toStatus, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(contracts.id, id), eq(contracts.tenantId, tenantId)))
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to transition contract status' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'transition',
    entityType: 'contract',
    entityId: id,
    changes: { from: currentStatus, to: toStatus },
  });

  return ok(row);
}

// ── Add Contract Line ──────────────────────────────────────────────

export async function addContractLine(
  tenantId: string,
  contractId: string,
  data: AddContractLineInput,
  userId: string,
): Promise<Result<ContractLineRow, AppError>> {
  const contractResult = await getContract(tenantId, contractId);
  if (!contractResult.ok) return contractResult;

  const rows = await db
    .insert(contractLines)
    .values({
      tenantId,
      contractId,
      lineNumber: data.lineNumber,
      description: data.description,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      amount: data.amount,
      deliveryTerms: data.deliveryTerms ?? null,
      itemId: data.itemId ?? null,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to add contract line' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'create',
    entityType: 'contract_line',
    entityId: row.id,
    changes: { contractId, ...data } as Record<string, unknown>,
  });

  return ok(row);
}

// ── List Contract Lines ────────────────────────────────────────────

export async function listContractLines(
  tenantId: string,
  contractId: string,
): Promise<Result<ContractLineRow[], AppError>> {
  const contractResult = await getContract(tenantId, contractId);
  if (!contractResult.ok) return contractResult;

  const rows = await db
    .select()
    .from(contractLines)
    .where(and(eq(contractLines.contractId, contractId), eq(contractLines.tenantId, tenantId)))
    .orderBy(contractLines.lineNumber);

  return ok(rows);
}

export const contractService = {
  createContract,
  getContract,
  listContracts,
  updateContract,
  transitionContractStatus,
  addContractLine,
  listContractLines,
};
