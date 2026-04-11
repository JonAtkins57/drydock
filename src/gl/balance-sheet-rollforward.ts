import { pool } from '../db/connection.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type { RollForwardRow } from './gl.schemas.js';

export async function getBalanceSheetRollForward(
  tenantId: string,
  periodId: string,
  accountType?: 'asset' | 'liability' | 'equity',
): Promise<Result<RollForwardRow[], AppError>> {
  const client = await pool.connect();
  try {
    // Phase 1: resolve period dates
    const periodRes = await client.query<{ start_date: string; end_date: string }>(
      `SELECT start_date, end_date
       FROM drydock_gl.accounting_periods
       WHERE id = $1 AND tenant_id = $2`,
      [periodId, tenantId],
    );

    if (periodRes.rows.length === 0) {
      return err({ code: 'NOT_FOUND', message: `Period ${periodId} not found` });
    }

    const { start_date, end_date } = periodRes.rows[0];

    // Phase 2: conditional aggregation — single pass
    // Params: $1=tenantId, $2=periodId, $3=startDate, $4=endDate, $5..=accountTypes
    const accountTypes = accountType ? [accountType] : ['asset', 'liability', 'equity'];
    const placeholders = accountTypes.map((_, i) => `$${i + 5}`).join(', ');
    const params: unknown[] = [tenantId, periodId, start_date, end_date, ...accountTypes];

    const queryText = `
      SELECT
        a.id          AS account_id,
        a.account_number,
        a.name        AS account_name,
        a.account_type,
        CASE
          WHEN a.account_type = 'asset'
            THEN (COALESCE(SUM(jel.debit_amount)  FILTER (WHERE je.posting_date < $3::timestamptz), 0)
                - COALESCE(SUM(jel.credit_amount) FILTER (WHERE je.posting_date < $3::timestamptz), 0))::bigint
          ELSE
            (COALESCE(SUM(jel.credit_amount) FILTER (WHERE je.posting_date < $3::timestamptz), 0)
           - COALESCE(SUM(jel.debit_amount)  FILTER (WHERE je.posting_date < $3::timestamptz), 0))::bigint
        END AS beginning_balance,
        COALESCE(SUM(jel.debit_amount)  FILTER (WHERE je.period_id = $2), 0)::bigint AS period_debits,
        COALESCE(SUM(jel.credit_amount) FILTER (WHERE je.period_id = $2), 0)::bigint AS period_credits,
        CASE
          WHEN a.account_type = 'asset'
            THEN (COALESCE(SUM(jel.debit_amount),  0) - COALESCE(SUM(jel.credit_amount), 0))::bigint
          ELSE
            (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount),  0))::bigint
        END AS ending_balance
      FROM drydock_gl.accounts a
      INNER JOIN drydock_gl.journal_entry_lines jel ON jel.account_id = a.id
      INNER JOIN drydock_gl.journal_entries je ON je.id = jel.journal_entry_id
      WHERE a.tenant_id = $1
        AND a.is_active = true
        AND a.account_type IN (${placeholders})
        AND je.tenant_id = $1
        AND je.status = 'posted'
        AND je.posting_date <= $4::timestamptz
      GROUP BY a.id, a.account_number, a.name, a.account_type
      ORDER BY a.account_type, a.account_number
    `;

    const { rows } = await client.query<{
      account_id: string;
      account_number: string;
      account_name: string;
      account_type: string;
      beginning_balance: string;
      period_debits: string;
      period_credits: string;
      ending_balance: string;
    }>(queryText, params);

    return ok(
      rows.map((row) => ({
        accountId: row.account_id,
        accountNumber: row.account_number,
        accountName: row.account_name,
        accountType: row.account_type,
        beginningBalance: Number(row.beginning_balance),
        periodDebits: Number(row.period_debits),
        periodCredits: Number(row.period_credits),
        endingBalance: Number(row.ending_balance),
      })),
    );
  } catch (e) {
    return err({ code: 'INTERNAL', message: String(e) });
  } finally {
    client.release();
  }
}
