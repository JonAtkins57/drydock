import { pool } from '../db/connection.js';
import { ok, type Result, type AppError } from '../lib/result.js';
import type { TrialBalanceQuery, TrialBalanceResult, TrialBalanceRow } from './gl.schemas.js';

// ── Trial Balance ──────────────────────────────────────────────────

export async function getTrialBalance(
  tenantId: string,
  query: TrialBalanceQuery,
): Promise<Result<TrialBalanceResult, AppError>> {
  // Build parameterized query to prevent SQL injection
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  // Journal entry conditions
  const jeConditions: string[] = [
    `je.tenant_id = $1`,
    `je.status = 'posted'`,
  ];

  if (query.periodId) {
    jeConditions.push(`je.period_id = $${paramIdx}`);
    params.push(query.periodId);
    paramIdx++;
  }
  if (query.startDate) {
    jeConditions.push(`je.posting_date >= $${paramIdx}::timestamptz`);
    params.push(query.startDate);
    paramIdx++;
  }
  if (query.endDate) {
    jeConditions.push(`je.posting_date <= $${paramIdx}::timestamptz`);
    params.push(query.endDate);
    paramIdx++;
  }

  // Dimension filters on lines
  if (query.departmentId) {
    jeConditions.push(`jel.department_id = $${paramIdx}`);
    params.push(query.departmentId);
    paramIdx++;
  }
  if (query.locationId) {
    jeConditions.push(`jel.location_id = $${paramIdx}`);
    params.push(query.locationId);
    paramIdx++;
  }
  if (query.projectId) {
    jeConditions.push(`jel.project_id = $${paramIdx}`);
    params.push(query.projectId);
    paramIdx++;
  }
  if (query.costCenterId) {
    jeConditions.push(`jel.cost_center_id = $${paramIdx}`);
    params.push(query.costCenterId);
    paramIdx++;
  }
  if (query.entityId) {
    jeConditions.push(`jel.entity_id = $${paramIdx}`);
    params.push(query.entityId);
    paramIdx++;
  }

  const whereClause = jeConditions.join(' AND ');

  const queryText = `
    SELECT
      a.id AS account_id,
      a.account_number,
      a.name AS account_name,
      a.account_type,
      COALESCE(SUM(jel.debit_amount), 0)::bigint AS debit_total,
      COALESCE(SUM(jel.credit_amount), 0)::bigint AS credit_total,
      (COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0))::bigint AS balance
    FROM drydock_gl.accounts a
    INNER JOIN drydock_gl.journal_entry_lines jel ON jel.account_id = a.id
    INNER JOIN drydock_gl.journal_entries je ON je.id = jel.journal_entry_id
    WHERE a.tenant_id = $1
      AND a.is_active = true
      AND ${whereClause}
    GROUP BY a.id, a.account_number, a.name, a.account_type
    ORDER BY a.account_number
  `;

  const client = await pool.connect();
  try {
    const { rows } = await client.query<{
      account_id: string;
      account_number: string;
      account_name: string;
      account_type: string;
      debit_total: string;
      credit_total: string;
      balance: string;
    }>(queryText, params);

    let totalDebits = 0;
    let totalCredits = 0;

    const accountRows: TrialBalanceRow[] = rows.map((row) => {
      const debitTotal = Number(row.debit_total);
      const creditTotal = Number(row.credit_total);
      totalDebits += debitTotal;
      totalCredits += creditTotal;

      return {
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        accountType: row.account_type,
        debitTotal,
        creditTotal,
        balance: debitTotal - creditTotal,
      };
    });

    return ok({
      accounts: accountRows,
      totalDebits,
      totalCredits,
    });
  } finally {
    client.release();
  }
}
