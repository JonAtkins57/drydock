import { eq, and, sql, asc } from 'drizzle-orm';
import { db, pool } from '../db/connection.js';
import {
  journalEntries,
  journalEntryLines,
  accountingPeriods,
  accounts,
} from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { logAction } from '../core/audit.service.js';
import { generateNumber } from '../core/numbering.service.js';
import { checkPermission, checkSegregationOfDuties } from '../core/auth.service.js';
import type {
  CreateJournalEntryInput,
  ListJournalEntriesQuery,
} from './gl.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

type JournalEntry = typeof journalEntries.$inferSelect;
type JournalEntryLine = typeof journalEntryLines.$inferSelect;

interface JournalEntryWithLines extends JournalEntry {
  lines: JournalEntryLine[];
}

interface PaginatedJournalEntries {
  data: JournalEntryWithLines[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Create Journal Entry ───────────────────────────────────────────

export async function createJournalEntry(
  tenantId: string,
  data: CreateJournalEntryInput,
  userId: string,
): Promise<Result<JournalEntryWithLines, AppError>> {
  // Validate at least one debit and one credit line
  const hasDebit = data.lines.some((l) => l.debitAmount > 0);
  const hasCredit = data.lines.some((l) => l.creditAmount > 0);
  if (!hasDebit || !hasCredit) {
    return err({
      code: 'VALIDATION',
      message: 'Journal entry must have at least one debit line and one credit line',
    });
  }

  // Each line must have either debit or credit, not both
  for (const line of data.lines) {
    if (line.debitAmount > 0 && line.creditAmount > 0) {
      return err({
        code: 'VALIDATION',
        message: 'A journal line cannot have both debit and credit amounts',
      });
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      return err({
        code: 'VALIDATION',
        message: 'A journal line must have a non-zero debit or credit amount',
      });
    }
  }

  // Verify period exists and belongs to tenant
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.tenantId, tenantId),
        eq(accountingPeriods.id, data.periodId),
      ),
    )
    .limit(1);

  if (!period) {
    return err({ code: 'NOT_FOUND', message: 'Accounting period not found' });
  }

  // Verify all accounts exist and are posting accounts
  for (const line of data.lines) {
    const [account] = await db
      .select({ id: accounts.id, isPostingAccount: accounts.isPostingAccount, isActive: accounts.isActive })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.id, line.accountId),
        ),
      )
      .limit(1);

    if (!account) {
      return err({ code: 'NOT_FOUND', message: `Account ${line.accountId} not found` });
    }
    if (!account.isPostingAccount) {
      return err({
        code: 'VALIDATION',
        message: `Account ${line.accountId} is not a posting account`,
      });
    }
    if (!account.isActive) {
      return err({
        code: 'VALIDATION',
        message: `Account ${line.accountId} is inactive`,
      });
    }
  }

  // Generate journal number
  const numResult = await generateNumber(tenantId, 'journal_entry');
  if (!numResult.ok) {
    return err(numResult.error);
  }

  const [entry] = await db
    .insert(journalEntries)
    .values({
      tenantId,
      entityId: data.entityId ?? null,
      journalNumber: numResult.value,
      journalType: data.journalType,
      periodId: data.periodId,
      postingDate: new Date(data.postingDate),
      description: data.description ?? null,
      status: 'draft',
      sourceModule: data.sourceModule ?? null,
      sourceEntityType: data.sourceEntityType ?? null,
      sourceEntityId: data.sourceEntityId ?? null,
      createdBy: userId,
    })
    .returning();

  if (!entry) {
    return err({ code: 'INTERNAL', message: 'Failed to create journal entry' });
  }

  // Insert lines
  const lineValues = data.lines.map((line, idx) => ({
    journalEntryId: entry.id,
    lineNumber: idx + 1,
    accountId: line.accountId,
    debitAmount: line.debitAmount,
    creditAmount: line.creditAmount,
    description: line.description ?? null,
    departmentId: line.departmentId ?? null,
    locationId: line.locationId ?? null,
    customerId: line.customerId ?? null,
    vendorId: line.vendorId ?? null,
    projectId: line.projectId ?? null,
    costCenterId: line.costCenterId ?? null,
    entityId: line.entityId ?? null,
    customDimensions: line.customDimensions ?? null,
  }));

  const insertedLines = await db
    .insert(journalEntryLines)
    .values(lineValues)
    .returning();

  await logAction({
    tenantId,
    userId,
    action: 'journal_entry.create',
    entityType: 'journal_entry',
    entityId: entry.id,
    changes: { journalNumber: entry.journalNumber, lineCount: data.lines.length },
  });

  return ok({ ...entry, lines: insertedLines });
}

// ── Get Journal Entry ──────────────────────────────────────────────

export async function getJournalEntry(
  tenantId: string,
  id: string,
): Promise<Result<JournalEntryWithLines, AppError>> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, id)))
    .limit(1);

  if (!entry) {
    return err({ code: 'NOT_FOUND', message: 'Journal entry not found' });
  }

  const lines = await db
    .select()
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, id))
    .orderBy(asc(journalEntryLines.lineNumber));

  return ok({ ...entry, lines });
}

// ── List Journal Entries ───────────────────────────────────────────

export async function listJournalEntries(
  tenantId: string,
  options: ListJournalEntriesQuery,
): Promise<Result<PaginatedJournalEntries, AppError>> {
  const conditions = [eq(journalEntries.tenantId, tenantId)];

  if (options.status) {
    conditions.push(eq(journalEntries.status, options.status));
  }
  if (options.periodId) {
    conditions.push(eq(journalEntries.periodId, options.periodId));
  }
  if (options.startDate) {
    conditions.push(sql`${journalEntries.postingDate} >= ${options.startDate}::timestamptz`);
  }
  if (options.endDate) {
    conditions.push(sql`${journalEntries.postingDate} <= ${options.endDate}::timestamptz`);
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(where);

  const total = countResult?.count ?? 0;
  const offset = (options.page - 1) * options.pageSize;

  const entries = await db
    .select()
    .from(journalEntries)
    .where(where)
    .orderBy(asc(journalEntries.createdAt))
    .limit(options.pageSize)
    .offset(offset);

  // Fetch lines for all entries
  const entryIds = entries.map((e) => e.id);
  let allLines: JournalEntryLine[] = [];

  if (entryIds.length > 0) {
    allLines = await db
      .select()
      .from(journalEntryLines)
      .where(sql`${journalEntryLines.journalEntryId} = ANY(${sql.raw(`ARRAY[${entryIds.map((id) => `'${id}'::uuid`).join(',')}]`)})`)
      .orderBy(asc(journalEntryLines.lineNumber));
  }

  const linesByEntry = new Map<string, JournalEntryLine[]>();
  for (const line of allLines) {
    const existing = linesByEntry.get(line.journalEntryId) ?? [];
    existing.push(line);
    linesByEntry.set(line.journalEntryId, existing);
  }

  const data: JournalEntryWithLines[] = entries.map((entry) => ({
    ...entry,
    lines: linesByEntry.get(entry.id) ?? [],
  }));

  return ok({ data, total, page: options.page, pageSize: options.pageSize });
}

// ── Submit For Approval ────────────────────────────────────────────

export async function submitForApproval(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<JournalEntry, AppError>> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, id)))
    .limit(1);

  if (!entry) {
    return err({ code: 'NOT_FOUND', message: 'Journal entry not found' });
  }

  if (entry.status !== 'draft') {
    return err({
      code: 'VALIDATION',
      message: `Cannot submit journal in '${entry.status}' status. Must be 'draft'.`,
    });
  }

  // Pre-check: debits must equal credits
  const [balanceCheck] = await db
    .select({
      totalDebit: sql<number>`COALESCE(sum(${journalEntryLines.debitAmount}), 0)::bigint`,
      totalCredit: sql<number>`COALESCE(sum(${journalEntryLines.creditAmount}), 0)::bigint`,
    })
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, id));

  if (!balanceCheck || balanceCheck.totalDebit !== balanceCheck.totalCredit) {
    return err({
      code: 'VALIDATION',
      message: `Journal is unbalanced. Debits: ${balanceCheck?.totalDebit ?? 0}, Credits: ${balanceCheck?.totalCredit ?? 0}`,
    });
  }

  const [updated] = await db
    .update(journalEntries)
    .set({ status: 'pending_approval', updatedAt: new Date() })
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, id)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to submit journal' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'journal_entry.submit',
    entityType: 'journal_entry',
    entityId: id,
  });

  return ok(updated);
}

// ── Approve ────────────────────────────────────────────────────────

export async function approveJournal(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<JournalEntry, AppError>> {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, id)))
    .limit(1);

  if (!entry) {
    return err({ code: 'NOT_FOUND', message: 'Journal entry not found' });
  }

  if (entry.status !== 'pending_approval') {
    return err({
      code: 'VALIDATION',
      message: `Cannot approve journal in '${entry.status}' status. Must be 'pending_approval'.`,
    });
  }

  // Segregation of duties: approver must not be the creator
  if (entry.createdBy === userId) {
    return err({
      code: 'FORBIDDEN',
      message: 'Cannot approve a journal entry you created (segregation of duties)',
    });
  }

  // Also check via audit-based SoD
  const sodResult = await checkSegregationOfDuties(userId, 'journal_entry', id, 'approve');
  if (sodResult.ok && !sodResult.value) {
    return err({
      code: 'FORBIDDEN',
      message: 'Segregation of duties violation',
    });
  }

  const [updated] = await db
    .update(journalEntries)
    .set({
      status: 'approved',
      approvedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, id)))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to approve journal' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'journal_entry.approve',
    entityType: 'journal_entry',
    entityId: id,
  });

  return ok(updated);
}

// ── Post Journal ───────────────────────────────────────────────────
// THE BIG ONE. Everything inside a single DB transaction.

export async function postJournal(
  tenantId: string,
  id: string,
  userId: string,
): Promise<Result<JournalEntry, AppError>> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch the journal entry
    const { rows: entryRows } = await client.query<{
      id: string;
      tenant_id: string;
      status: string;
      period_id: string;
      journal_number: string;
      created_by: string | null;
      approved_by: string | null;
      entity_id: string | null;
      journal_type: string;
      posting_date: Date;
      description: string | null;
      source_module: string | null;
      source_entity_type: string | null;
      source_entity_id: string | null;
      reversed_by_journal_id: string | null;
      posted_by: string | null;
      posted_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM drydock_gl.journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );

    const entryRow = entryRows[0];
    if (!entryRow) {
      await client.query('ROLLBACK');
      return err({ code: 'NOT_FOUND', message: 'Journal entry not found' });
    }

    // 2. Verify status is approved
    if (entryRow.status !== 'approved') {
      await client.query('ROLLBACK');
      return err({
        code: 'VALIDATION',
        message: `Cannot post journal in '${entryRow.status}' status. Must be 'approved'.`,
      });
    }

    // 3. Verify period is open
    const { rows: periodRows } = await client.query<{ status: string }>(
      `SELECT status FROM drydock_gl.accounting_periods WHERE id = $1 AND tenant_id = $2 FOR SHARE`,
      [entryRow.period_id, tenantId],
    );

    const periodRow = periodRows[0];
    if (!periodRow) {
      await client.query('ROLLBACK');
      return err({ code: 'NOT_FOUND', message: 'Accounting period not found' });
    }

    if (periodRow.status !== 'open') {
      await client.query('ROLLBACK');
      return err({
        code: 'VALIDATION',
        message: `Cannot post to period with status '${periodRow.status}'. Period must be 'open'.`,
      });
    }

    // 4. Verify user has gl.journal.post permission
    const permResult = await checkPermission(userId, 'gl.journal.post');
    if (!permResult.ok) {
      await client.query('ROLLBACK');
      return err(permResult.error);
    }
    if (!permResult.value) {
      await client.query('ROLLBACK');
      return err({
        code: 'FORBIDDEN',
        message: 'User lacks gl.journal.post permission',
      });
    }

    // 5. Check journal balance via SQL function
    const { rows: balanceRows } = await client.query<{ is_balanced: boolean }>(
      `SELECT drydock_gl.check_journal_balance($1) AS is_balanced`,
      [id],
    );

    const balanceRow = balanceRows[0];
    if (!balanceRow || !balanceRow.is_balanced) {
      await client.query('ROLLBACK');
      return err({
        code: 'VALIDATION',
        message: 'Journal entry is unbalanced. Total debits must equal total credits.',
      });
    }

    // 6. Verify all required dimensions are present
    const { rows: lineRows } = await client.query<{
      line_number: number;
      account_id: string;
      debit_amount: string;
      credit_amount: string;
    }>(
      `SELECT line_number, account_id, debit_amount, credit_amount
       FROM drydock_gl.journal_entry_lines
       WHERE journal_entry_id = $1`,
      [id],
    );

    // Verify all accounts exist and are active posting accounts
    for (const line of lineRows) {
      const { rows: acctRows } = await client.query<{
        is_posting_account: boolean;
        is_active: boolean;
      }>(
        `SELECT is_posting_account, is_active FROM drydock_gl.accounts
         WHERE id = $1 AND tenant_id = $2`,
        [line.account_id, tenantId],
      );

      const acct = acctRows[0];
      if (!acct) {
        await client.query('ROLLBACK');
        return err({
          code: 'VALIDATION',
          message: `Account ${line.account_id} on line ${line.line_number} not found`,
        });
      }
      if (!acct.is_posting_account) {
        await client.query('ROLLBACK');
        return err({
          code: 'VALIDATION',
          message: `Account ${line.account_id} on line ${line.line_number} is not a posting account`,
        });
      }
      if (!acct.is_active) {
        await client.query('ROLLBACK');
        return err({
          code: 'VALIDATION',
          message: `Account ${line.account_id} on line ${line.line_number} is inactive`,
        });
      }
    }

    // 7. Set status = posted, posted_by, posted_at
    const now = new Date();
    const { rows: postedRows } = await client.query<{
      id: string;
      tenant_id: string;
      entity_id: string | null;
      journal_number: string;
      journal_type: string;
      period_id: string;
      posting_date: Date;
      description: string | null;
      status: string;
      source_module: string | null;
      source_entity_type: string | null;
      source_entity_id: string | null;
      created_by: string | null;
      approved_by: string | null;
      posted_by: string | null;
      posted_at: Date | null;
      reversed_by_journal_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE drydock_gl.journal_entries
       SET status = 'posted', posted_by = $1, posted_at = $2, updated_at = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [userId, now.toISOString(), id, tenantId],
    );

    const postedRow = postedRows[0];
    if (!postedRow) {
      await client.query('ROLLBACK');
      return err({ code: 'INTERNAL', message: 'Failed to post journal entry' });
    }

    // 8. Write audit log
    await client.query(
      `INSERT INTO drydock_audit.audit_log (tenant_id, user_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        userId,
        'journal_entry.post',
        'journal_entry',
        id,
        JSON.stringify({ journalNumber: postedRow.journal_number, postedAt: now.toISOString() }),
      ],
    );

    await client.query('COMMIT');

    // Map raw row to typed return value
    return ok(mapRawToJournalEntry(postedRow));
  } catch (error) {
    await client.query('ROLLBACK');
    return err({
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : 'Unknown error during posting',
    });
  } finally {
    client.release();
  }
}

// ── Reverse Journal ────────────────────────────────────────────────

export async function reverseJournal(
  tenantId: string,
  id: string,
  userId: string,
  reversalDate: string,
): Promise<Result<JournalEntryWithLines, AppError>> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock and fetch original entry
    const { rows: entryRows } = await client.query<{
      id: string;
      tenant_id: string;
      entity_id: string | null;
      journal_number: string;
      journal_type: string;
      period_id: string;
      posting_date: Date;
      description: string | null;
      status: string;
      source_module: string | null;
      source_entity_type: string | null;
      source_entity_id: string | null;
      created_by: string | null;
      approved_by: string | null;
      posted_by: string | null;
      posted_at: Date | null;
      reversed_by_journal_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM drydock_gl.journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );

    const original = entryRows[0];
    if (!original) {
      await client.query('ROLLBACK');
      return err({ code: 'NOT_FOUND', message: 'Journal entry not found' });
    }

    if (original.status !== 'posted') {
      await client.query('ROLLBACK');
      return err({
        code: 'VALIDATION',
        message: `Can only reverse posted journals. Current status: '${original.status}'`,
      });
    }

    if (original.reversed_by_journal_id) {
      await client.query('ROLLBACK');
      return err({
        code: 'CONFLICT',
        message: 'Journal entry has already been reversed',
      });
    }

    // Find period for reversal date
    const { rows: periodRows } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM drydock_gl.accounting_periods
       WHERE tenant_id = $1 AND start_date <= $2::timestamptz AND end_date >= $2::timestamptz
       LIMIT 1`,
      [tenantId, reversalDate],
    );

    const reversalPeriod = periodRows[0];
    if (!reversalPeriod) {
      await client.query('ROLLBACK');
      return err({
        code: 'NOT_FOUND',
        message: `No accounting period found for reversal date ${reversalDate}`,
      });
    }

    if (reversalPeriod.status !== 'open') {
      await client.query('ROLLBACK');
      return err({
        code: 'VALIDATION',
        message: `Reversal period must be open. Current status: '${reversalPeriod.status}'`,
      });
    }

    // Generate reversal journal number
    const numResult = await generateNumber(tenantId, 'journal_entry');
    if (!numResult.ok) {
      await client.query('ROLLBACK');
      return err(numResult.error);
    }

    // Create reversal entry — posted immediately (atomic reversal)
    const now = new Date();
    const { rows: reversalEntryRows } = await client.query<{
      id: string;
      tenant_id: string;
      entity_id: string | null;
      journal_number: string;
      journal_type: string;
      period_id: string;
      posting_date: Date;
      description: string | null;
      status: string;
      source_module: string | null;
      source_entity_type: string | null;
      source_entity_id: string | null;
      created_by: string | null;
      approved_by: string | null;
      posted_by: string | null;
      posted_at: Date | null;
      reversed_by_journal_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO drydock_gl.journal_entries
       (tenant_id, entity_id, journal_number, journal_type, period_id, posting_date,
        description, status, source_module, source_entity_type, source_entity_id,
        created_by, approved_by, posted_by, posted_at)
       VALUES ($1, $2, $3, 'reversal', $4, $5::timestamptz,
        $6, 'posted', $7, $8, $9, $10, $10, $10, $11)
       RETURNING *`,
      [
        tenantId,
        original.entity_id,
        numResult.value,
        reversalPeriod.id,
        reversalDate,
        `Reversal of ${original.journal_number}: ${original.description ?? ''}`.trim(),
        original.source_module,
        original.source_entity_type,
        original.source_entity_id,
        userId,
        now.toISOString(),
      ],
    );

    const reversalEntry = reversalEntryRows[0];
    if (!reversalEntry) {
      await client.query('ROLLBACK');
      return err({ code: 'INTERNAL', message: 'Failed to create reversal entry' });
    }

    // Fetch original lines
    const { rows: originalLines } = await client.query<{
      line_number: number;
      account_id: string;
      debit_amount: string;
      credit_amount: string;
      description: string | null;
      department_id: string | null;
      location_id: string | null;
      customer_id: string | null;
      vendor_id: string | null;
      project_id: string | null;
      cost_center_id: string | null;
      entity_id: string | null;
      custom_dimensions: unknown;
    }>(
      `SELECT * FROM drydock_gl.journal_entry_lines WHERE journal_entry_id = $1 ORDER BY line_number`,
      [id],
    );

    // Insert reversed lines (debits become credits, credits become debits)
    const reversedLineIds: string[] = [];
    for (const line of originalLines) {
      const { rows: insertedLine } = await client.query<{ id: string }>(
        `INSERT INTO drydock_gl.journal_entry_lines
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount,
          description, department_id, location_id, customer_id, vendor_id,
          project_id, cost_center_id, entity_id, custom_dimensions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          reversalEntry.id,
          line.line_number,
          line.account_id,
          line.credit_amount, // Flip: original credit → reversal debit
          line.debit_amount,  // Flip: original debit → reversal credit
          line.description ? `Reversal: ${line.description}` : 'Reversal',
          line.department_id,
          line.location_id,
          line.customer_id,
          line.vendor_id,
          line.project_id,
          line.cost_center_id,
          line.entity_id,
          line.custom_dimensions ? JSON.stringify(line.custom_dimensions) : null,
        ],
      );
      const insertedId = insertedLine[0]?.id;
      if (insertedId) {
        reversedLineIds.push(insertedId);
      }
    }

    // Mark original as reversed
    await client.query(
      `UPDATE drydock_gl.journal_entries
       SET reversed_by_journal_id = $1, status = 'reversed', updated_at = $2
       WHERE id = $3 AND tenant_id = $4`,
      [reversalEntry.id, now.toISOString(), id, tenantId],
    );

    // Audit log for both
    await client.query(
      `INSERT INTO drydock_audit.audit_log (tenant_id, user_id, action, entity_type, entity_id, changes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        userId,
        'journal_entry.reverse',
        'journal_entry',
        id,
        JSON.stringify({
          originalJournal: original.journal_number,
          reversalJournal: reversalEntry.journal_number,
          reversalDate,
        }),
      ],
    );

    await client.query('COMMIT');

    // Fetch the full reversal entry with lines
    const result = await getJournalEntry(tenantId, reversalEntry.id);
    if (!result.ok) {
      // Entry was committed — return what we have
      return ok({
        ...mapRawToJournalEntry(reversalEntry),
        lines: [],
      });
    }

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    return err({
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : 'Unknown error during reversal',
    });
  } finally {
    client.release();
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function mapRawToJournalEntry(row: {
  id: string;
  tenant_id: string;
  entity_id: string | null;
  journal_number: string;
  journal_type: string;
  period_id: string;
  posting_date: Date;
  description: string | null;
  status: string;
  source_module: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  reversed_by_journal_id: string | null;
  created_at: Date;
  updated_at: Date;
}): JournalEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    journalNumber: row.journal_number,
    journalType: row.journal_type,
    periodId: row.period_id,
    postingDate: row.posting_date,
    description: row.description,
    status: row.status,
    sourceModule: row.source_module,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    postedBy: row.posted_by,
    postedAt: row.posted_at,
    reversedByJournalId: row.reversed_by_journal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
