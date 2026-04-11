/**
 * OCC (Oracle Commerce Cloud) Usage-Based Billing Service
 *
 * Pulls usage/meter data from the OCC API, rates it against locally-stored
 * rate cards, and generates invoice + invoice line items in drydock_q2c.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { integrationConfigs } from '../db/schema/integration.js';
import { invoices, invoiceLines } from '../db/schema/q2c.js';
import { occRateCards, occPullRuns, occUsageLines } from '../db/schema/usage-billing.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

// ── Types ──────────────────────────────────────────────────────────

interface OccConfig {
  baseUrl: string;
  apiKey: string;
  /** OCC customer/account identifier used when querying usage */
  accountId: string;
}

interface OccMeterReading {
  meterType: string;
  quantity: number;
  unit: string;
}

interface OccUsageResponse {
  accountId: string;
  periodStart: string;
  periodEnd: string;
  meters: OccMeterReading[];
}

export interface RateCard {
  id: string;
  tenantId: string;
  name: string;
  meterType: string;
  unitPriceCents: number;
  currency: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PullRun {
  id: string;
  tenantId: string;
  integrationConfigId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  rawUsage: unknown;
  usageSummary: unknown;
  totalAmountCents: number | null;
  invoiceId: string | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

// ── Helpers ────────────────────────────────────────────────────────

async function getOccConfig(
  tenantId: string,
  configId: string,
): Promise<Result<{ id: string; config: OccConfig; customerId: string | null }, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'occ'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'OCC integration config not found or inactive' });
  }

  const raw = row.config as Record<string, unknown> | null;
  if (!raw?.baseUrl || !raw?.apiKey || !raw?.accountId) {
    return err({ code: 'VALIDATION', message: 'OCC config missing required fields: baseUrl, apiKey, accountId' });
  }

  return ok({
    id: row.id,
    config: {
      baseUrl: raw.baseUrl as string,
      apiKey: raw.apiKey as string,
      accountId: raw.accountId as string,
    },
    customerId: (raw.drydockCustomerId as string | undefined) ?? null,
  });
}

/** Fetch usage from the OCC API for a given period. */
async function fetchOccUsage(
  config: OccConfig,
  periodStart: string,
  periodEnd: string,
): Promise<Result<OccUsageResponse, AppError>> {
  const url = new URL('/api/v1/usage', config.baseUrl);
  url.searchParams.set('accountId', config.accountId);
  url.searchParams.set('periodStart', periodStart);
  url.searchParams.set('periodEnd', periodEnd);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    return err({ code: 'INTERNAL', message: `OCC API request failed: ${String(e)}` });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return err({
      code: 'INTERNAL',
      message: `OCC API error ${res.status}: ${body.slice(0, 200)}`,
    });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return err({ code: 'INTERNAL', message: 'OCC API returned non-JSON response' });
  }

  const payload = data as OccUsageResponse;
  if (!Array.isArray(payload?.meters)) {
    return err({ code: 'INTERNAL', message: 'OCC API response missing meters array' });
  }

  return ok(payload);
}

/** Rate usage readings against local rate cards. Returns per-line totals. */
interface RatedLine {
  meterType: string;
  rateCardId: string | null;
  quantity: number;
  unitPriceCents: number;
  totalAmountCents: number;
  description: string;
}

async function rateUsage(
  tenantId: string,
  meters: OccMeterReading[],
): Promise<Result<{ lines: RatedLine[]; totalAmountCents: number }, AppError>> {
  // Load all active rate cards for this tenant
  const cards = await db
    .select()
    .from(occRateCards)
    .where(and(eq(occRateCards.tenantId, tenantId), eq(occRateCards.isActive, true)));

  const cardByMeter = new Map<string, typeof cards[number]>();
  for (const card of cards) {
    cardByMeter.set(card.meterType, card);
  }

  const lines: RatedLine[] = [];
  let totalAmountCents = 0;

  for (const meter of meters) {
    const card = cardByMeter.get(meter.meterType);
    const unitPrice = card?.unitPriceCents ?? 0;
    const total = Math.round(meter.quantity * unitPrice);
    totalAmountCents += total;
    lines.push({
      meterType: meter.meterType,
      rateCardId: card?.id ?? null,
      quantity: meter.quantity,
      unitPriceCents: unitPrice,
      totalAmountCents: total,
      description: `OCC usage: ${meter.meterType} — ${meter.quantity} ${meter.unit}`,
    });
  }

  return ok({ lines, totalAmountCents });
}

// ── Public Service Functions ───────────────────────────────────────

/** List rate cards for a tenant. */
export async function listRateCards(
  tenantId: string,
): Promise<Result<RateCard[], AppError>> {
  const rows = await db
    .select()
    .from(occRateCards)
    .where(eq(occRateCards.tenantId, tenantId))
    .orderBy(occRateCards.meterType);

  return ok(rows as RateCard[]);
}

/** List pull runs for a given integration config. */
export async function listPullRuns(
  tenantId: string,
  configId: string,
  limit: number,
): Promise<Result<PullRun[], AppError>> {
  const rows = await db
    .select()
    .from(occPullRuns)
    .where(
      and(
        eq(occPullRuns.tenantId, tenantId),
        eq(occPullRuns.integrationConfigId, configId),
      ),
    )
    .orderBy(desc(occPullRuns.startedAt))
    .limit(limit);

  return ok(rows as unknown as PullRun[]);
}

/**
 * Pull usage from OCC for a billing period, rate it against local rate cards,
 * and create an invoice + invoice lines in drydock_q2c.
 *
 * Returns the pull run ID and the invoice ID (null if totalAmount is zero).
 */
export async function pullAndInvoice(
  tenantId: string,
  configId: string,
  periodStart: string,
  periodEnd: string,
  createdBy: string,
): Promise<Result<{ runId: string; invoiceId: string | null }, AppError>> {
  // 1. Load OCC config
  const configResult = await getOccConfig(tenantId, configId);
  if (!configResult.ok) return configResult;
  const { config, customerId } = configResult.value;

  // 2. Create a pull run record in pending state
  const [run] = await db
    .insert(occPullRuns)
    .values({
      tenantId,
      integrationConfigId: configId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      status: 'running',
      createdBy,
    })
    .returning({ id: occPullRuns.id });

  const runId = run.id;

  // 3. Fetch usage from OCC
  const usageResult = await fetchOccUsage(config, periodStart, periodEnd);
  if (!usageResult.ok) {
    await db
      .update(occPullRuns)
      .set({
        status: 'failed',
        errorMessage: usageResult.error.message,
        completedAt: new Date(),
      })
      .where(eq(occPullRuns.id, runId));
    return usageResult;
  }

  const usage = usageResult.value;

  // 4. Rate the usage against local rate cards
  const ratingResult = await rateUsage(tenantId, usage.meters);
  if (!ratingResult.ok) {
    await db
      .update(occPullRuns)
      .set({
        status: 'failed',
        errorMessage: ratingResult.error.message,
        rawUsage: usage,
        completedAt: new Date(),
      })
      .where(eq(occPullRuns.id, runId));
    return ratingResult;
  }

  const { lines, totalAmountCents } = ratingResult.value;

  // Build usage summary: meterType -> quantity
  const usageSummary: Record<string, number> = {};
  for (const line of lines) {
    usageSummary[line.meterType] = line.quantity;
  }

  // 5. Write usage lines
  if (lines.length > 0) {
    await db.insert(occUsageLines).values(
      lines.map((line) => ({
        tenantId,
        pullRunId: runId,
        meterType: line.meterType,
        rateCardId: line.rateCardId ?? undefined,
        quantity: String(line.quantity),
        unitPriceCents: line.unitPriceCents,
        totalAmountCents: line.totalAmountCents,
        description: line.description,
      })),
    );
  }

  // 6. Create invoice if there is a customer and non-zero amount
  let invoiceId: string | null = null;
  if (customerId && totalAmountCents > 0) {
    const invoiceNumber = `OCC-${new Date().toISOString().slice(0, 10)}-${runId.slice(0, 8).toUpperCase()}`;
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await db
      .insert(invoices)
      .values({
        tenantId,
        invoiceNumber,
        customerId,
        status: 'draft',
        totalAmount: totalAmountCents,
        taxAmount: 0,
        dueDate,
        notes: `OCC usage-based billing for ${periodStart} to ${periodEnd}`,
        createdBy,
      })
      .returning({ id: invoices.id });

    invoiceId = invoice.id;

    // Insert invoice lines
    if (lines.length > 0) {
      await db.insert(invoiceLines).values(
        lines.map((line, idx) => ({
          tenantId,
          invoiceId: invoiceId as string,
          lineNumber: idx + 1,
          description: line.description,
          quantity: 1,
          unitPrice: line.totalAmountCents,
          amount: line.totalAmountCents,
        })),
      );
    }
  }

  // 7. Mark run complete
  await db
    .update(occPullRuns)
    .set({
      status: 'complete',
      rawUsage: usage,
      usageSummary,
      totalAmountCents,
      invoiceId,
      completedAt: new Date(),
    })
    .where(eq(occPullRuns.id, runId));

  return ok({ runId, invoiceId });
}
