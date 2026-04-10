import { eq, and, sql, asc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { accounts, journalEntryLines, journalEntries } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { logAction } from '../core/audit.service.js';
import type { CreateAccountInput, UpdateAccountInput, ListAccountsQuery } from './gl.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type Account = typeof accounts.$inferSelect;

interface PaginatedAccounts {
  data: Account[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Create ─────────────────────────────────────────────────────────

export async function createAccount(
  tenantId: string,
  data: CreateAccountInput,
  userId: string,
): Promise<Result<Account, AppError>> {
  // Check for duplicate account number within tenant
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, tenantId),
        eq(accounts.accountNumber, data.accountNumber),
      ),
    )
    .limit(1);

  if (existing) {
    return err({
      code: 'CONFLICT',
      message: `Account number ${data.accountNumber} already exists`,
    });
  }

  // Validate parent exists if specified
  if (data.parentAccountId) {
    const [parent] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.id, data.parentAccountId),
        ),
      )
      .limit(1);

    if (!parent) {
      return err({
        code: 'NOT_FOUND',
        message: 'Parent account not found',
      });
    }
  }

  const [created] = await db
    .insert(accounts)
    .values({
      tenantId,
      accountNumber: data.accountNumber,
      name: data.name,
      accountType: data.accountType,
      accountSubtype: data.accountSubtype ?? null,
      parentAccountId: data.parentAccountId ?? null,
      isPostingAccount: data.isPostingAccount,
      normalBalance: data.normalBalance,
      description: data.description ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  if (!created) {
    return err({ code: 'INTERNAL', message: 'Failed to create account' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'gl_account.create',
    entityType: 'gl_account',
    entityId: created.id,
    changes: { accountNumber: data.accountNumber, name: data.name },
  });

  return ok(created);
}

// ── Get ────────────────────────────────────────────────────────────

export async function getAccount(
  tenantId: string,
  id: string,
): Promise<Result<Account, AppError>> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.id, id)))
    .limit(1);

  if (!account) {
    return err({ code: 'NOT_FOUND', message: 'Account not found' });
  }

  return ok(account);
}

// ── List ───────────────────────────────────────────────────────────

export async function listAccounts(
  tenantId: string,
  options: ListAccountsQuery,
): Promise<Result<PaginatedAccounts, AppError>> {
  const conditions = [eq(accounts.tenantId, tenantId)];

  if (options.accountType) {
    conditions.push(eq(accounts.accountType, options.accountType));
  }
  if (options.parentAccountId) {
    conditions.push(eq(accounts.parentAccountId, options.parentAccountId));
  }
  if (options.postingOnly) {
    conditions.push(eq(accounts.isPostingAccount, true));
  }
  if (options.activeOnly) {
    conditions.push(eq(accounts.isActive, true));
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accounts)
    .where(where);

  const total = countResult?.count ?? 0;
  const offset = (options.page - 1) * options.pageSize;

  const data = await db
    .select()
    .from(accounts)
    .where(where)
    .orderBy(asc(accounts.accountNumber))
    .limit(options.pageSize)
    .offset(offset);

  return ok({
    data,
    total,
    page: options.page,
    pageSize: options.pageSize,
  });
}

// ── Update ─────────────────────────────────────────────────────────

export async function updateAccount(
  tenantId: string,
  id: string,
  data: UpdateAccountInput,
  userId: string,
): Promise<Result<Account, AppError>> {
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.id, id)))
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: 'Account not found' });
  }

  // Validate parent if changing
  if (data.parentAccountId) {
    if (data.parentAccountId === id) {
      return err({ code: 'VALIDATION', message: 'Account cannot be its own parent' });
    }

    const [parent] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.id, data.parentAccountId),
        ),
      )
      .limit(1);

    if (!parent) {
      return err({ code: 'NOT_FOUND', message: 'Parent account not found' });
    }
  }

  const updateValues: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.accountSubtype !== undefined) updateValues.accountSubtype = data.accountSubtype ?? null;
  if (data.parentAccountId !== undefined) updateValues.parentAccountId = data.parentAccountId ?? null;
  if (data.description !== undefined) updateValues.description = data.description ?? null;
  if (data.normalBalance !== undefined) updateValues.normalBalance = data.normalBalance;

  const [updated] = await db
    .update(accounts)
    .set(updateValues)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.id, id)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update account' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'gl_account.update',
    entityType: 'gl_account',
    entityId: id,
    changes: data as Record<string, unknown>,
  });

  return ok(updated);
}

// ── Deactivate ─────────────────────────────────────────────────────

export async function deactivateAccount(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<Account, AppError>> {
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.id, id)))
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: 'Account not found' });
  }

  if (!existing.isActive) {
    return err({ code: 'CONFLICT', message: 'Account is already inactive' });
  }

  // Check if any posted journals reference this account
  const [usedInPosted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
    .where(
      and(
        eq(journalEntryLines.accountId, id),
        eq(journalEntries.status, 'posted'),
        eq(journalEntries.tenantId, tenantId),
      ),
    );

  if (usedInPosted && usedInPosted.count > 0) {
    return err({
      code: 'CONFLICT',
      message: 'Cannot deactivate account with posted journal entries. Use a replacement account instead.',
    });
  }

  const [deactivated] = await db
    .update(accounts)
    .set({
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.id, id)))
    .returning();

  if (!deactivated) {
    return err({ code: 'INTERNAL', message: 'Failed to deactivate account' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'gl_account.deactivate',
    entityType: 'gl_account',
    entityId: id,
  });

  return ok(deactivated);
}
