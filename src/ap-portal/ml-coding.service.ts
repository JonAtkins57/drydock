import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { codingDecisions } from '../db/schema/index';
import { ok, err, type Result, type AppError } from '../lib/result';

// ── Types ──────────────────────────────────────────────────────────

type CodingDecision = typeof codingDecisions.$inferSelect;

export type CodingDecisionSource = 'manual' | 'rule' | 'ml_accepted' | 'ml_corrected';

export interface RecordDecisionInput {
  vendorId: string | null;
  description: string | null;
  amountCents: number | null;
  accountId: string;
  departmentId: string | null;
  projectId: string | null;
  costCenterId: string | null;
  source: CodingDecisionSource;
  userId: string | null;
}

export interface CodingSuggestion {
  accountId: string;
  departmentId: string | null;
  projectId: string | null;
  costCenterId: string | null;
  confidence: number;
  sampleCount: number;
}

// ── Record Decision ────────────────────────────────────────────────
// Called whenever a line is coded (manually, by rule, or ML acceptance).

export async function recordDecision(
  tenantId: string,
  input: RecordDecisionInput,
): Promise<Result<CodingDecision, AppError>> {
  const [inserted] = await db
    .insert(codingDecisions)
    .values({
      tenantId,
      vendorId: input.vendorId ?? null,
      description: input.description ?? null,
      amountCents: input.amountCents ?? null,
      accountId: input.accountId,
      departmentId: input.departmentId ?? null,
      projectId: input.projectId ?? null,
      costCenterId: input.costCenterId ?? null,
      source: input.source,
      createdBy: input.userId ?? null,
    })
    .returning();

  if (!inserted) {
    return err({ code: 'INTERNAL', message: 'Failed to record coding decision' });
  }

  return ok(inserted);
}

// ── Suggest Coding ─────────────────────────────────────────────────
// Returns ranked suggestions based on historical decisions using a
// weighted k-nearest-neighbour approach:
//   - Vendor match:               +3.0 pts
//   - Description token overlap:  Jaccard × 5.0 pts
//   - Amount within ±10%:         +3.0 pts (exclusive)
//   - Amount within ±30%:         +1.5 pts
// The top-N scored decisions are grouped by accountId; the group's
// total score is used as a proxy for confidence.

const MAX_HISTORY = 500;
const TOP_K = 15;

export async function suggestCoding(
  tenantId: string,
  vendorId: string | null,
  description: string | null,
  amountCents: number | null,
): Promise<Result<CodingSuggestion[], AppError>> {
  // Fetch recent decisions for this tenant, vendor first for relevance
  const history = await db
    .select()
    .from(codingDecisions)
    .where(eq(codingDecisions.tenantId, tenantId))
    .orderBy(desc(codingDecisions.createdAt))
    .limit(MAX_HISTORY);

  if (history.length === 0) {
    return ok([]);
  }

  const queryTokens = tokenize(description);

  // Score every historical decision
  const scored = history.map((d) => ({
    decision: d,
    score: score(d, vendorId, queryTokens, amountCents),
  }));

  // Take top-K by score (discard zero-score entries)
  const topK = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  if (topK.length === 0) {
    return ok([]);
  }

  // Aggregate by (accountId, departmentId, projectId, costCenterId)
  const buckets = new Map<string, {
    accountId: string;
    departmentId: string | null;
    projectId: string | null;
    costCenterId: string | null;
    totalScore: number;
    count: number;
  }>();

  for (const { decision: d, score: s } of topK) {
    const key = `${d.accountId}|${d.departmentId ?? ''}|${d.projectId ?? ''}|${d.costCenterId ?? ''}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.totalScore += s;
      existing.count += 1;
    } else {
      buckets.set(key, {
        accountId: d.accountId,
        departmentId: d.departmentId ?? null,
        projectId: d.projectId ?? null,
        costCenterId: d.costCenterId ?? null,
        totalScore: s,
        count: 1,
      });
    }
  }

  const totalScore = Array.from(buckets.values()).reduce((sum, b) => sum + b.totalScore, 0);

  const suggestions: CodingSuggestion[] = Array.from(buckets.values())
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 3)
    .map((b) => ({
      accountId: b.accountId,
      departmentId: b.departmentId,
      projectId: b.projectId,
      costCenterId: b.costCenterId,
      confidence: totalScore > 0 ? Math.round((b.totalScore / totalScore) * 100) / 100 : 0,
      sampleCount: b.count,
    }));

  return ok(suggestions);
}

// ── Helpers ────────────────────────────────────────────────────────

function score(
  d: CodingDecision,
  queryVendorId: string | null,
  queryTokens: Set<string>,
  queryAmount: number | null,
): number {
  let pts = 0;

  // Vendor match
  if (queryVendorId && d.vendorId === queryVendorId) {
    pts += 3.0;
  }

  // Description similarity (Jaccard on word tokens)
  if (queryTokens.size > 0 && d.description) {
    const histTokens = tokenize(d.description);
    const intersection = [...queryTokens].filter((t) => histTokens.has(t)).length;
    const union = new Set([...queryTokens, ...histTokens]).size;
    if (union > 0) {
      pts += (intersection / union) * 5.0;
    }
  }

  // Amount proximity
  if (queryAmount !== null && d.amountCents !== null && d.amountCents > 0) {
    const ratio = Math.abs(queryAmount - d.amountCents) / d.amountCents;
    if (ratio <= 0.10) {
      pts += 3.0;
    } else if (ratio <= 0.30) {
      pts += 1.5;
    }
  }

  return pts;
}

function tokenize(text: string | null): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}
