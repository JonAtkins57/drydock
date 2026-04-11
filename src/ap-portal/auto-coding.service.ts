import type pg from 'pg';
import { ok, err, type Result, type AppError } from '../lib/result.js';

// ── Types ──────────────────────────────────────────────────────────

export interface SuggestionItem {
  accountId: string;
  accountName: string;
  confidence: number;
  rank: number;
}

export interface SuggestionResult {
  suggestionId: string;
  suggestions: SuggestionItem[];
}

export interface FeedbackRecord {
  id: string;
  tenantId: string;
  suggestionId: string;
  apInvoiceLineId: string;
  vendorId: string;
  descriptionTokens: string;
  chosenAccountId: string;
  accepted: boolean;
  acceptedRank: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopAccount {
  accountId: string;
  accountName: string;
  frequency: number;
  acceptanceRate: number;
}

export interface MetricsResult {
  totalSuggestions: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate: number;
  topAccounts: TopAccount[];
}

// ── Stopwords ──────────────────────────────────────────────────────

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'of', 'in', 'to', 'with', 'and', 'or', 'by', 'from', 'at', 'is', 'was']);

// ── normalizeDescription ───────────────────────────────────────────

export function normalizeDescription(raw: string | null): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .join(' ');
}

// ── getSuggestions ─────────────────────────────────────────────────

export async function getSuggestions(
  tenantId: string,
  vendorId: string,
  descriptionTokens: string,
  apInvoiceLineId: string,
  pool: pg.Pool,
): Promise<Result<SuggestionResult, AppError>> {
  const client = await pool.connect();
  try {
    const tokens = descriptionTokens.split(/\s+/).filter((t) => t.length > 0);

    // Build ILIKE conditions for token matching
    let feedbackRows: Array<{ account_id: string; account_name: string; freq: number }> = [];

    if (tokens.length > 0) {
      const ilikeClauses = tokens.map((_, i) => `cf.description_tokens ILIKE $${i + 3}`).join(' OR ');
      const tokenParams = tokens.map((t) => `%${t}%`);

      const mlQuery = `
        SELECT
          cf.chosen_account_id AS account_id,
          a.name AS account_name,
          COUNT(*) AS freq
        FROM drydock_ap.coding_feedback cf
        JOIN drydock_gl.accounts a ON a.id = cf.chosen_account_id
        WHERE cf.tenant_id = $1
          AND cf.vendor_id = $2
          AND (${ilikeClauses})
        GROUP BY cf.chosen_account_id, a.name
        ORDER BY freq DESC
        LIMIT 3
      `;

      const { rows } = await client.query<{ account_id: string; account_name: string; freq: string }>(
        mlQuery,
        [tenantId, vendorId, ...tokenParams],
      );
      feedbackRows = rows.map((r) => ({ account_id: r.account_id, account_name: r.account_name, freq: parseInt(r.freq, 10) }));
    }

    // Laplace-smoothed confidence
    let totalFeedback = 0;
    let numDistinct = feedbackRows.length;

    if (feedbackRows.length > 0) {
      const { rows: totalRows } = await client.query<{ total: string; distinct_accounts: string }>(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT chosen_account_id) AS distinct_accounts
         FROM drydock_ap.coding_feedback
         WHERE tenant_id = $1 AND vendor_id = $2`,
        [tenantId, vendorId],
      );
      totalFeedback = parseInt(totalRows[0]?.total ?? '0', 10);
      numDistinct = parseInt(totalRows[0]?.distinct_accounts ?? '0', 10);
    }

    const suggestions: SuggestionItem[] = feedbackRows.map((row, idx) => ({
      accountId: row.account_id,
      accountName: row.account_name,
      confidence: numDistinct > 0
        ? (row.freq + 1) / (totalFeedback + numDistinct)
        : 0.5,
      rank: idx + 1,
    }));

    // Cold-start fallback: fill remaining slots from coding_rules
    if (suggestions.length < 3) {
      const existingIds = suggestions.map((s) => s.accountId);
      const needed = 3 - suggestions.length;
      const excludeClause = existingIds.length > 0
        ? `AND cr.default_account_id NOT IN (${existingIds.map((_, i) => `$${i + 3}`).join(', ')})`
        : '';

      const fallbackQuery = `
        SELECT cr.default_account_id AS account_id, a.name AS account_name
        FROM drydock_ap.coding_rules cr
        JOIN drydock_gl.accounts a ON a.id = cr.default_account_id
        WHERE cr.tenant_id = $1
          AND (cr.vendor_id = $2 OR cr.vendor_id IS NULL)
          AND cr.is_active = true
          ${excludeClause}
        ORDER BY cr.priority DESC
        LIMIT ${needed}
      `;

      const { rows: fallbackRows } = await client.query<{ account_id: string; account_name: string }>(
        fallbackQuery,
        existingIds.length > 0 ? [tenantId, vendorId, ...existingIds] : [tenantId, vendorId],
      );

      for (const row of fallbackRows) {
        suggestions.push({
          accountId: row.account_id,
          accountName: row.account_name,
          confidence: 0.5,
          rank: suggestions.length + 1,
        });
      }
    }

    // Insert coding_suggestions row
    const { rows: inserted } = await client.query<{ id: string }>(
      `INSERT INTO drydock_ap.coding_suggestions
         (tenant_id, ap_invoice_line_id, vendor_id, description_tokens, suggestions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, apInvoiceLineId, vendorId, descriptionTokens, JSON.stringify(suggestions)],
    );

    const suggestionId = inserted[0]?.id;
    if (!suggestionId) {
      return err({ code: 'INTERNAL', message: 'Failed to persist coding suggestion' });
    }

    return ok({ suggestionId, suggestions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error in getSuggestions';
    return err({ code: 'INTERNAL', message: msg });
  } finally {
    client.release();
  }
}

// ── recordFeedback ─────────────────────────────────────────────────

export async function recordFeedback(
  tenantId: string,
  suggestionId: string,
  accepted: boolean,
  chosenAccountId: string,
  acceptedRank: number | null | undefined,
  pool: pg.Pool,
): Promise<Result<FeedbackRecord, AppError>> {
  const client = await pool.connect();
  try {
    // Verify suggestionId exists for tenantId
    const { rows: suggRows } = await client.query<{
      id: string;
      vendor_id: string;
      description_tokens: string;
      ap_invoice_line_id: string;
    }>(
      `SELECT id, vendor_id, description_tokens, ap_invoice_line_id
       FROM drydock_ap.coding_suggestions
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [suggestionId, tenantId],
    );

    const suggestion = suggRows[0];
    if (!suggestion) {
      return err({ code: 'NOT_FOUND', message: 'Coding suggestion not found' });
    }

    const { rows: inserted } = await client.query<{
      id: string;
      tenant_id: string;
      suggestion_id: string;
      ap_invoice_line_id: string;
      vendor_id: string;
      description_tokens: string;
      chosen_account_id: string;
      accepted: boolean;
      accepted_rank: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO drydock_ap.coding_feedback
         (tenant_id, suggestion_id, ap_invoice_line_id, vendor_id, description_tokens,
          chosen_account_id, accepted, accepted_rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        suggestionId,
        suggestion.ap_invoice_line_id,
        suggestion.vendor_id,
        suggestion.description_tokens,
        chosenAccountId,
        accepted,
        acceptedRank ?? null,
      ],
    );

    const row = inserted[0];
    if (!row) {
      return err({ code: 'INTERNAL', message: 'Failed to insert coding feedback' });
    }

    return ok({
      id: row.id,
      tenantId: row.tenant_id,
      suggestionId: row.suggestion_id,
      apInvoiceLineId: row.ap_invoice_line_id,
      vendorId: row.vendor_id,
      descriptionTokens: row.description_tokens,
      chosenAccountId: row.chosen_account_id,
      accepted: row.accepted,
      acceptedRank: row.accepted_rank,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error in recordFeedback';
    return err({ code: 'INTERNAL', message: msg });
  } finally {
    client.release();
  }
}

// ── getModelMetrics ────────────────────────────────────────────────

export async function getModelMetrics(
  tenantId: string,
  pool: pg.Pool,
): Promise<Result<MetricsResult, AppError>> {
  const client = await pool.connect();
  try {
    const { rows: countRows } = await client.query<{ total_suggestions: string }>(
      `SELECT COUNT(*) AS total_suggestions FROM drydock_ap.coding_suggestions WHERE tenant_id = $1`,
      [tenantId],
    );

    const { rows: feedbackRows } = await client.query<{ accepted_count: string; rejected_count: string }>(
      `SELECT
         SUM(CASE WHEN accepted THEN 1 ELSE 0 END) AS accepted_count,
         SUM(CASE WHEN NOT accepted THEN 1 ELSE 0 END) AS rejected_count
       FROM drydock_ap.coding_feedback
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const { rows: topRows } = await client.query<{
      account_id: string;
      account_name: string;
      frequency: string;
      acceptance_rate: string;
    }>(
      `SELECT
         cf.chosen_account_id AS account_id,
         a.name AS account_name,
         COUNT(*) AS frequency,
         COALESCE(SUM(cf.accepted::int)::float / NULLIF(COUNT(*), 0), 0) AS acceptance_rate
       FROM drydock_ap.coding_feedback cf
       JOIN drydock_gl.accounts a ON a.id = cf.chosen_account_id
       WHERE cf.tenant_id = $1
       GROUP BY cf.chosen_account_id, a.name
       ORDER BY frequency DESC
       LIMIT 10`,
      [tenantId],
    );

    const totalSuggestions = parseInt(countRows[0]?.total_suggestions ?? '0', 10);
    const acceptedCount = parseInt(feedbackRows[0]?.accepted_count ?? '0', 10);
    const rejectedCount = parseInt(feedbackRows[0]?.rejected_count ?? '0', 10);

    return ok({
      totalSuggestions,
      acceptedCount,
      rejectedCount,
      acceptanceRate: totalSuggestions > 0 ? acceptedCount / totalSuggestions : 0,
      topAccounts: topRows.map((r) => ({
        accountId: r.account_id,
        accountName: r.account_name,
        frequency: parseInt(r.frequency, 10),
        acceptanceRate: parseFloat(r.acceptance_rate),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error in getModelMetrics';
    return err({ code: 'INTERNAL', message: msg });
  } finally {
    client.release();
  }
}
