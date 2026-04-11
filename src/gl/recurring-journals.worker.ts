import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { eq, and, lte } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  recurringJournalTemplates,
  recurringJournalTemplateLines,
  journalEntries,
  journalEntryLines,
  accountingPeriods,
} from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

export const RECURRING_JOURNAL_QUEUE = 'recurring-journals';

// ── Next-run computation ───────────────────────────────────────────

export function computeNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

// ── Core processor ─────────────────────────────────────────────────

export interface ProcessResult {
  processed: number;
  skipped: number;
  errors: string[];
}

export async function processRecurringJournals(
  asOfDate: Date = new Date(),
): Promise<Result<ProcessResult, AppError>> {
  // 1. Find all active templates where nextRunDate <= asOfDate
  const dueTemplates = await db
    .select()
    .from(recurringJournalTemplates)
    .where(
      and(
        eq(recurringJournalTemplates.status, 'active'),
        eq(recurringJournalTemplates.isActive, true),
        lte(recurringJournalTemplates.nextRunDate, asOfDate),
      ),
    );

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const template of dueTemplates) {
    // Skip if past end date — mark completed
    if (template.endDate && template.endDate.getTime() < asOfDate.getTime()) {
      await db
        .update(recurringJournalTemplates)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(recurringJournalTemplates.id, template.id));
      skipped++;
      continue;
    }

    // Find the open accounting period that covers asOfDate
    const allPeriods = await db
      .select()
      .from(accountingPeriods)
      .where(
        and(
          eq(accountingPeriods.tenantId, template.tenantId),
          eq(accountingPeriods.status, 'open'),
        ),
      );

    const openPeriod = allPeriods.find(
      (p) => p.startDate.getTime() <= asOfDate.getTime() && p.endDate.getTime() >= asOfDate.getTime(),
    );

    if (!openPeriod) {
      errors.push(
        `Template ${template.id} (${template.name}): no open period found covering ${asOfDate.toISOString().slice(0, 10)}`,
      );
      skipped++;
      continue;
    }

    // Get template lines
    const lines = await db
      .select()
      .from(recurringJournalTemplateLines)
      .where(eq(recurringJournalTemplateLines.templateId, template.id));

    if (lines.length === 0) {
      errors.push(`Template ${template.id} (${template.name}): no lines defined — skipped`);
      skipped++;
      continue;
    }

    // Create the journal entry
    const journalNumber = `REC-${template.id.slice(0, 8).toUpperCase()}-${Date.now()}`;
    const [entry] = await db
      .insert(journalEntries)
      .values({
        tenantId: template.tenantId,
        journalNumber,
        journalType: template.journalType,
        periodId: openPeriod.id,
        postingDate: asOfDate,
        description: template.description ?? template.name,
        status: 'draft',
        sourceModule: 'gl',
        sourceEntityType: 'recurring_journal_template',
        sourceEntityId: template.id,
        createdBy: template.createdBy,
      })
      .returning();

    if (!entry) {
      errors.push(`Template ${template.id} (${template.name}): failed to insert journal entry`);
      skipped++;
      continue;
    }

    // Insert journal lines
    await db.insert(journalEntryLines).values(
      lines.map((l) => ({
        journalEntryId: entry.id,
        lineNumber: l.lineNumber,
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description,
        departmentId: l.departmentId,
        locationId: l.locationId,
        projectId: l.projectId,
        costCenterId: l.costCenterId,
      })),
    );

    // Advance nextRunDate
    const nextRun = computeNextRunDate(template.nextRunDate, template.frequency);
    await db
      .update(recurringJournalTemplates)
      .set({ nextRunDate: nextRun, updatedAt: new Date() })
      .where(eq(recurringJournalTemplates.id, template.id));

    processed++;
  }

  return ok({ processed, skipped, errors });
}

// ── BullMQ worker setup ────────────────────────────────────────────

export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function setupRecurringJournalsWorker(): Worker {
  const connection = createRedisConnection();

  const worker = new Worker(
    RECURRING_JOURNAL_QUEUE,
    async (_job) => {
      const result = await processRecurringJournals(new Date());
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[recurring-journals] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export function setupRecurringJournalsSchedule(): Queue {
  const connection = createRedisConnection();
  const queue = new Queue(RECURRING_JOURNAL_QUEUE, { connection });

  // Run once per day at 00:05 UTC
  queue
    .add(
      'daily-run',
      {},
      {
        repeat: { pattern: '5 0 * * *' },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 100 },
      },
    )
    .catch((e: unknown) => {
      console.error('[recurring-journals] failed to register repeatable job:', e);
    });

  return queue;
}
