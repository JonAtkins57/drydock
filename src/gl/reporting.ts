import { pool } from '../db/connection.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type { AccountRow, IncomeStatementResult, BalanceSheetResult } from './gl.schemas.js';

// ── Income Statement ───────────────────────────────────────────────

export async function getIncomeStatement(
  tenantId: string,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  entityId: string | undefined,
): Promise<Result<IncomeStatementResult, AppError>> {
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  const jeConditions: string[] = [
    `je.tenant_id = $1`,
    `je.status = 'posted'`,
  ];

  if (dateFrom) {
    jeConditions.push(`je.posting_date >= $${paramIdx}::timestamptz`);
    params.push(dateFrom);
    paramIdx++;
  }
  if (dateTo) {
    jeConditions.push(`je.posting_date <= $${paramIdx}::timestamptz`);
    params.push(dateTo);
    paramIdx++;
  }
  if (entityId) {
    jeConditions.push(`jel.entity_id = $${paramIdx}`);
    params.push(entityId);
    paramIdx++;
  }

  const whereClause = jeConditions.join(' AND ');

  // Revenue: normal balance = credit → net = credit - debit (positive = revenue earned)
  // Expense: normal balance = debit  → net = debit - credit (positive = expense incurred)
  const queryText = `
    SELECT
      a.id          AS account_id,
      a.account_number,
      a.name        AS account_name,
      a.account_type,
      CASE
        WHEN a.account_type = 'revenue'
          THEN (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0))::bigint
        ELSE
          (COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0))::bigint
      END AS net_amount
    FROM drydock_gl.accounts a
    INNER JOIN drydock_gl.journal_entry_lines jel ON jel.account_id = a.id
    INNER JOIN drydock_gl.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.tenant_id = $1
      AND a.is_active = true
      AND a.account_type IN ('revenue', 'expense')
      AND ${whereClause}
    GROUP BY a.id, a.account_number, a.name, a.account_type
    ORDER BY a.account_type, a.account_number
  `;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      account_id: string;
      account_number: string;
      account_name: string;
      account_type: string;
      net_amount: string;
    }>(queryText, params);

    const revenue: AccountRow[] = [];
    const expenses: AccountRow[] = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const row of rows) {
      const netAmount = Number(row.net_amount);
      const accountRow: AccountRow = {
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        accountType: row.account_type,
        netAmount,
      };
      if (row.account_type === 'revenue') {
        revenue.push(accountRow);
        totalRevenue += netAmount;
      } else {
        expenses.push(accountRow);
        totalExpenses += netAmount;
      }
    }

    return ok({
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    });
  } catch (e) {
    return err({ code: 'INTERNAL', message: String(e) });
  } finally {
    client.release();
  }
}

// ── Balance Sheet ──────────────────────────────────────────────────

export async function getBalanceSheet(
  tenantId: string,
  asOf: string | undefined,
  entityId: string | undefined,
): Promise<Result<BalanceSheetResult, AppError>> {
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  const jeConditions: string[] = [
    `je.tenant_id = $1`,
    `je.status = 'posted'`,
  ];

  if (asOf) {
    jeConditions.push(`je.posting_date <= $${paramIdx}::timestamptz`);
    params.push(asOf);
    paramIdx++;
  }
  if (entityId) {
    jeConditions.push(`jel.entity_id = $${paramIdx}`);
    params.push(entityId);
    paramIdx++;
  }

  const whereClause = jeConditions.join(' AND ');

  // Assets: normal balance = debit → net = debit - credit
  // Liabilities/Equity: normal balance = credit → net = credit - debit
  const queryText = `
    SELECT
      a.id          AS account_id,
      a.account_number,
      a.name        AS account_name,
      a.account_type,
      CASE
        WHEN a.account_type = 'asset'
          THEN (COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0))::bigint
        ELSE
          (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0))::bigint
      END AS net_amount
    FROM drydock_gl.accounts a
    INNER JOIN drydock_gl.journal_entry_lines jel ON jel.account_id = a.id
    INNER JOIN drydock_gl.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.tenant_id = $1
      AND a.is_active = true
      AND a.account_type IN ('asset', 'liability', 'equity')
      AND ${whereClause}
    GROUP BY a.id, a.account_number, a.name, a.account_type
    ORDER BY a.account_type, a.account_number
  `;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      account_id: string;
      account_number: string;
      account_name: string;
      account_type: string;
      net_amount: string;
    }>(queryText, params);

    const assets: AccountRow[] = [];
    const liabilities: AccountRow[] = [];
    const equity: AccountRow[] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const row of rows) {
      const netAmount = Number(row.net_amount);
      const accountRow: AccountRow = {
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        accountType: row.account_type,
        netAmount,
      };
      if (row.account_type === 'asset') {
        assets.push(accountRow);
        totalAssets += netAmount;
      } else if (row.account_type === 'liability') {
        liabilities.push(accountRow);
        totalLiabilities += netAmount;
      } else {
        equity.push(accountRow);
        totalEquity += netAmount;
      }
    }

    return ok({
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
    });
  } catch (e) {
    return err({ code: 'INTERNAL', message: String(e) });
  } finally {
    client.release();
  }
}
