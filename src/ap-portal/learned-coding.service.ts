import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection';
import { codingTrainingRecords } from '../db/schema/index';
import { ok, err, type Result, type AppError } from '../lib/result';

// ── Types ──────────────────────────────────────────────────────────

type TrainingRecord = typeof codingTrainingRecords.$inferSelect;

export interface CodingSuggestion {
  rank: number;
  glAccountId: string;
  departmentId: string | null;
  projectId: string | null;
  costCenterId: string | null;
  confidence: number; // 0.0 – 1.0
  observationCount: number;
  vendorMatch: boolean;
}

export interface SuggestCodingResult {
  suggestions: CodingSuggestion[];
  totalObservations: number;
  featureVector: {
    vendorId: string | null;
    tokens: string[];
    amountBucket: string;
  };
}

export interface ModelStats {
  totalTrainingRecords: number;
  bySource: Record<string, number>;
  byFeedback: Record<string, number>;
  topAccounts: { glAccountId: string; count: number }[];
}

export interface RecordDecisionInput {
  vendorId: string | null;
  description: string | null;
  amount: number;
  glAccountId: string;
  departmentId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  source: 'manual' | 'confirmed_rule' | 'confirmed_suggestion';
  feedback?: 'accepted' | 'rejected' | 'modified';
  apInvoiceLineId?: string | null;
}

// ── Amount Bucketing ───────────────────────────────────────────────

/**
 * Buckets amounts (in cents) into named tiers for feature matching.
 * xs: < $100 | sm: $100–$1k | md: $1k–$10k | lg: $10k–$100k | xl: > $100k
 */
export function bucketAmount(amountCents: number): string {
  if (amountCents < 10_000) return 'xs';
  if (amountCents < 100_000) return 'sm';
  if (amountCents < 1_000_000) return 'md';
  if (amountCents < 10_000_000) return 'lg';
  return 'xl';
}

// ── Tokenisation ───────────────────────────────────────────────────

/**
 * Tokenises a description string into lowercase, deduplicated, meaningful tokens.
 * Strips punctuation, numbers, stop words, and short tokens.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'at',
  'by', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'from', 'as', 'this', 'that', 'it', 'its', 'via', 'per', 'ref',
]);

export function tokenise(text: string | null): string[] {
  if (!text) return [];
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  return [...new Set(raw)];
}

// ── Jaccard similarity between two token sets ──────────────────────

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setB) {
    if (setA.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Recency weight (exponential decay, half-life = 90 days) ───────

function recencyWeight(createdAt: Date): number {
  const daysSince = (Date.now() - createdAt.getTime()) / 86_400_000;
  return Math.exp(-daysSince / 130); // ln(2)/90 ≈ 1/130
}

// ── Record a Coding Decision ───────────────────────────────────────

export async function recordCodingDecision(
  tenantId: string,
  input: RecordDecisionInput,
): Promise<Result<void, AppError>> {
  const tokens = tokenise(input.description);
  const amountBucket = bucketAmount(input.amount);

  await db.insert(codingTrainingRecords).values({
    tenantId,
    vendorId: input.vendorId ?? null,
    descriptionTokens: tokens,
    amountBucket,
    glAccountId: input.glAccountId,
    departmentId: input.departmentId ?? null,
    projectId: input.projectId ?? null,
    costCenterId: input.costCenterId ?? null,
    source: input.source,
    feedback: input.feedback ?? null,
    apInvoiceLineId: input.apInvoiceLineId ?? null,
  });

  return ok(undefined);
}

// ── Suggest Coding ─────────────────────────────────────────────────

/**
 * Uses historical coding decisions to suggest GL account + dimensions
 * for a given vendor/description/amount combination.
 *
 * Scoring: weighted combination of
 *   - vendor match (exact)
 *   - description token Jaccard similarity
 *   - amount bucket match
 *   - recency decay
 */
export async function suggestCoding(
  tenantId: string,
  vendorId: string | null,
  description: string | null,
  amount: number,
  maxSuggestions: number = 3,
): Promise<Result<SuggestCodingResult, AppError>> {
  const queryTokens = tokenise(description);
  const amountBucket = bucketAmount(amount);

  // Pull all training records for this tenant
  const records = await db
    .select()
    .from(codingTrainingRecords)
    .where(eq(codingTrainingRecords.tenantId, tenantId));

  if (records.length === 0) {
    return ok({
      suggestions: [],
      totalObservations: 0,
      featureVector: { vendorId, tokens: queryTokens, amountBucket },
    });
  }

  // Scoring: accumulate per (account, dept, project, costCenter) key
  const scoreMap = new Map<
    string,
    {
      score: number;
      count: number;
      glAccountId: string;
      departmentId: string | null;
      projectId: string | null;
      costCenterId: string | null;
      vendorMatch: boolean;
    }
  >();

  for (const rec of records) {
    // Skip rejected feedback records — user explicitly said "don't suggest this"
    if (rec.feedback === 'rejected') continue;

    const vendorMatch = rec.vendorId !== null && rec.vendorId === vendorId;
    // If vendor on record is set but doesn't match current vendor, downweight heavily
    const vendorScore = vendorMatch ? 3.0 : rec.vendorId !== null ? 0.1 : 1.0;

    const recTokens = (rec.descriptionTokens as string[] | null) ?? [];
    const descScore = jaccardSimilarity(queryTokens, recTokens) * 2.0;

    const amountScore = rec.amountBucket === amountBucket ? 0.5 : 0.0;

    const weight = recencyWeight(rec.createdAt);
    // Boost accepted suggestions
    const feedbackBoost = rec.feedback === 'accepted' ? 1.3 : 1.0;

    const score = (vendorScore + descScore + amountScore) * weight * feedbackBoost;

    const key = `${rec.glAccountId}|${rec.departmentId ?? ''}|${rec.projectId ?? ''}|${rec.costCenterId ?? ''}`;
    const existing = scoreMap.get(key);
    if (existing) {
      existing.score += score;
      existing.count++;
      if (vendorMatch) existing.vendorMatch = true;
    } else {
      scoreMap.set(key, {
        score,
        count: 1,
        glAccountId: rec.glAccountId,
        departmentId: rec.departmentId,
        projectId: rec.projectId,
        costCenterId: rec.costCenterId,
        vendorMatch,
      });
    }
  }

  if (scoreMap.size === 0) {
    return ok({
      suggestions: [],
      totalObservations: records.length,
      featureVector: { vendorId, tokens: queryTokens, amountBucket },
    });
  }

  // Sort by score descending, take top N
  const sorted = [...scoreMap.values()].sort((a, b) => b.score - a.score);
  const topN = sorted.slice(0, maxSuggestions);

  // Normalise confidence: top score = 1.0, rest proportional
  const maxScore = topN[0]?.score ?? 1;

  const suggestions: CodingSuggestion[] = topN.map((entry, idx) => ({
    rank: idx + 1,
    glAccountId: entry.glAccountId,
    departmentId: entry.departmentId,
    projectId: entry.projectId,
    costCenterId: entry.costCenterId,
    confidence: maxScore > 0 ? Math.min(1, entry.score / maxScore) : 0,
    observationCount: entry.count,
    vendorMatch: entry.vendorMatch,
  }));

  return ok({
    suggestions,
    totalObservations: records.length,
    featureVector: { vendorId, tokens: queryTokens, amountBucket },
  });
}

// ── Record Suggestion Feedback ────────────────────────────────────

/**
 * Records feedback on a previously generated suggestion.
 * Used to improve future suggestions (accepted = boost, rejected = suppress).
 */
export async function recordSuggestionFeedback(
  tenantId: string,
  apInvoiceLineId: string,
  glAccountId: string,
  feedback: 'accepted' | 'rejected' | 'modified',
): Promise<Result<void, AppError>> {
  // Check if there's already a training record for this line from a suggestion
  const [existing] = await db
    .select({ id: codingTrainingRecords.id })
    .from(codingTrainingRecords)
    .where(
      and(
        eq(codingTrainingRecords.tenantId, tenantId),
        eq(codingTrainingRecords.apInvoiceLineId, apInvoiceLineId),
        sql`${codingTrainingRecords.source} = 'confirmed_suggestion'`,
      ),
    )
    .limit(1);

  if (!existing) {
    return err({ code: 'NOT_FOUND', message: 'No suggestion training record found for this line' });
  }

  await db
    .update(codingTrainingRecords)
    .set({ feedback })
    .where(
      and(
        eq(codingTrainingRecords.tenantId, tenantId),
        eq(codingTrainingRecords.apInvoiceLineId, apInvoiceLineId),
      ),
    );

  return ok(undefined);
}

// ── Model Stats ───────────────────────────────────────────────────

export async function getModelStats(
  tenantId: string,
): Promise<Result<ModelStats, AppError>> {
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(codingTrainingRecords)
    .where(eq(codingTrainingRecords.tenantId, tenantId));

  const totalTrainingRecords = totalRow?.count ?? 0;

  const sourceRows = await db
    .select({
      source: codingTrainingRecords.source,
      count: sql<number>`count(*)::int`,
    })
    .from(codingTrainingRecords)
    .where(eq(codingTrainingRecords.tenantId, tenantId))
    .groupBy(codingTrainingRecords.source);

  const bySource: Record<string, number> = {};
  for (const row of sourceRows) {
    bySource[row.source] = row.count;
  }

  const feedbackRows = await db
    .select({
      feedback: codingTrainingRecords.feedback,
      count: sql<number>`count(*)::int`,
    })
    .from(codingTrainingRecords)
    .where(
      and(
        eq(codingTrainingRecords.tenantId, tenantId),
        sql`${codingTrainingRecords.feedback} IS NOT NULL`,
      ),
    )
    .groupBy(codingTrainingRecords.feedback);

  const byFeedback: Record<string, number> = {};
  for (const row of feedbackRows) {
    if (row.feedback) {
      byFeedback[row.feedback] = row.count;
    }
  }

  const topAccountRows = await db
    .select({
      glAccountId: codingTrainingRecords.glAccountId,
      count: sql<number>`count(*)::int`,
    })
    .from(codingTrainingRecords)
    .where(eq(codingTrainingRecords.tenantId, tenantId))
    .groupBy(codingTrainingRecords.glAccountId)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return ok({
    totalTrainingRecords,
    bySource,
    byFeedback,
    topAccounts: topAccountRows.map((r) => ({
      glAccountId: r.glAccountId,
      count: r.count,
    })),
  });
}
