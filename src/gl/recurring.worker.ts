import { Queue, Worker, type Job } from 'bullmq';
import { pool } from '../db/connection.js';
import { createJournalEntry } from './posting.service.js';
import { autoPostJournal, reverseJournal } from './posting.service.js';
import { sendEmail } from '../core/email.service.js';
import { logAction } from '../core/audit.service.js';

// ── Queue Name ─────────────────────────────────────────────────────

export const QUEUE_RECURRING_JOURNALS = 'recurring-journals';

// ── Safe BIGINT Conversion ─────────────────────────────────────────

function safeParseAmount(value: string): number {
  const big = BigInt(value);
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`Amount ${value} exceeds safe integer range`);
  }
  return Number(big);
}

// ── Date Arithmetic ────────────────────────────────────────────────

function advanceDate(date: Date, frequency: string): Date {
  const next = new Date(date);

  switch (frequency) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'monthly': {
      const targetMonth = next.getUTCMonth() + 1;
      const year = targetMonth > 11 ? next.getUTCFullYear() + 1 : next.getUTCFullYear();
      const month = targetMonth > 11 ? 0 : targetMonth;
      // Clamp to last day of target month
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const day = Math.min(next.getUTCDate(), lastDay);
      next.setUTCFullYear(year, month, day);
      break;
    }
    case 'quarterly': {
      const targetMonth = next.getUTCMonth() + 3;
      const year = next.getUTCFullYear() + Math.floor(targetMonth / 12);
      const month = targetMonth % 12;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const day = Math.min(next.getUTCDate(), lastDay);
      next.setUTCFullYear(year, month, day);
      break;
    }
    case 'annually': {
      const year = next.getUTCFullYear() + 1;
      const month = next.getUTCMonth();
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const day = Math.min(next.getUTCDate(), lastDay);
      next.setUTCFullYear(year, month, day);
      break;
    }
    default:
      next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function firstDayOfNextMonth(date: Date): Date {
  const year = date.getUTCMonth() === 11 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1) % 12;
  return new Date(Date.UTC(year, month, 1));
}

// ── Worker Processor ───────────────────────────────────────────────

interface TemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  frequency: string;
  end_date: Date | null;
  next_run_date: Date;
  auto_post: boolean;
  create_reversal: boolean;
  notification_emails: string[];
  generated_count: number;
}

interface TemplateLineRow {
  id: string;
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
  custom_dimensions: Record<string, unknown> | null;
}

async function processRecurringJournals(systemUserId: string | null): Promise<void> {
  const client = await pool.connect();

  try {
    // Fetch all due active templates
    const { rows: templates } = await client.query<TemplateRow>(
      `SELECT id, tenant_id, name, description, frequency, end_date, next_run_date,
              auto_post, create_reversal, notification_emails, generated_count
       FROM drydock_gl.recurring_journal_templates
       WHERE status = 'active'
         AND next_run_date <= NOW()
         AND (end_date IS NULL OR end_date >= NOW())`,
    );

    for (const template of templates) {
      try {
        await processSingleTemplate(template, systemUserId);
      } catch (error) {
        console.error(`[recurring-worker] Unexpected error for template ${template.id}:`, error);
      }
    }
  } finally {
    client.release();
  }
}

async function processSingleTemplate(
  template: TemplateRow,
  systemUserId: string | null,
): Promise<void> {
  const client = await pool.connect();

  try {
    // Find the accounting period containing next_run_date
    const { rows: periodRows } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM drydock_gl.accounting_periods
       WHERE tenant_id = $1
         AND start_date <= $2::timestamptz
         AND end_date >= $2::timestamptz
       LIMIT 1`,
      [template.tenant_id, template.next_run_date.toISOString()],
    );

    const period = periodRows[0];

    if (!period || period.status !== 'open') {
      const errMsg = period
        ? `Accounting period for ${template.next_run_date.toISOString()} is not open (status: ${period.status})`
        : `No accounting period found for date ${template.next_run_date.toISOString()}`;

      await client.query(
        `UPDATE drydock_gl.recurring_journal_templates
         SET status = 'error', last_error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [errMsg, template.id],
      );

      if (template.notification_emails.length > 0) {
        await sendEmail({
          to: template.notification_emails,
          subject: `Recurring Journal Error: ${template.name}`,
          html: `<p>Recurring journal template <strong>${template.name}</strong> failed to run.</p><p>Error: ${errMsg}</p>`,
        });
      }

      return;
    }

    // Fetch active template lines
    const { rows: lineRows } = await client.query<TemplateLineRow>(
      `SELECT id, account_id, debit_amount, credit_amount, description,
              department_id, location_id, customer_id, vendor_id, project_id,
              cost_center_id, entity_id, custom_dimensions
       FROM drydock_gl.recurring_journal_template_lines
       WHERE template_id = $1 AND is_active = true
       ORDER BY sort_order`,
      [template.id],
    );

    const lines = lineRows.map((l) => ({
      accountId: l.account_id,
      debitAmount: safeParseAmount(l.debit_amount),
      creditAmount: safeParseAmount(l.credit_amount),
      description: l.description ?? null,
      departmentId: l.department_id ?? null,
      locationId: l.location_id ?? null,
      customerId: l.customer_id ?? null,
      vendorId: l.vendor_id ?? null,
      projectId: l.project_id ?? null,
      costCenterId: l.cost_center_id ?? null,
      entityId: l.entity_id ?? null,
      customDimensions: l.custom_dimensions ?? null,
    }));

    const creatorId = systemUserId ?? '00000000-0000-0000-0000-000000000000';

    // Create the journal entry
    const journalResult = await createJournalEntry(
      template.tenant_id,
      {
        journalType: 'automated',
        sourceModule: 'recurring',
        sourceEntityType: 'recurring_journal_template',
        sourceEntityId: template.id,
        periodId: period.id,
        postingDate: template.next_run_date.toISOString(),
        description: template.description ?? undefined,
        lines,
      },
      creatorId,
    );

    if (!journalResult.ok) {
      const errMsg = `Failed to create journal: ${journalResult.error.message}`;
      await client.query(
        `UPDATE drydock_gl.recurring_journal_templates
         SET last_error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [errMsg, template.id],
      );

      if (template.notification_emails.length > 0) {
        await sendEmail({
          to: template.notification_emails,
          subject: `Recurring Journal Error: ${template.name}`,
          html: `<p>Recurring journal template <strong>${template.name}</strong> failed to create a journal entry.</p><p>Error: ${errMsg}</p>`,
        });
      }

      return;
    }

    const journal = journalResult.value;
    let finalJournalId = journal.id;
    let finalJournalNumber = journal.journalNumber;

    // Auto-post if configured and SYSTEM_USER_ID is available
    if (template.auto_post && systemUserId) {
      const postResult = await autoPostJournal(template.tenant_id, journal.id, systemUserId);

      if (!postResult.ok) {
        console.warn(
          `[recurring-worker] Auto-post failed for journal ${journal.id} (template ${template.id}): ${postResult.error.message}`,
        );
      } else {
        finalJournalId = postResult.value.id;
        finalJournalNumber = postResult.value.journalNumber;

        // Create reversal if configured
        if (template.create_reversal) {
          const reversalDate = firstDayOfNextMonth(template.next_run_date);
          const reversalResult = await reverseJournal(
            template.tenant_id,
            journal.id,
            systemUserId,
            reversalDate.toISOString(),
          );

          if (!reversalResult.ok) {
            console.warn(
              `[recurring-worker] Reversal failed for journal ${journal.id} (template ${template.id}): ${reversalResult.error.message}`,
            );
            if (template.notification_emails.length > 0) {
              await sendEmail({
                to: template.notification_emails,
                subject: `Recurring Journal Reversal Warning: ${template.name}`,
                html: `<p>Journal <strong>${finalJournalNumber}</strong> was posted successfully, but reversal creation failed.</p><p>Error: ${reversalResult.error.message}</p>`,
              });
            }
          }
        }
      }
    }

    // Advance next_run_date
    const nextRun = advanceDate(template.next_run_date, template.frequency);
    const newGeneratedCount = template.generated_count + 1;

    const completed =
      template.end_date !== null && nextRun > template.end_date;

    await client.query(
      `UPDATE drydock_gl.recurring_journal_templates
       SET next_run_date = $1,
           generated_count = $2,
           status = $3,
           last_error_message = NULL,
           updated_at = NOW()
       WHERE id = $4`,
      [
        nextRun.toISOString(),
        newGeneratedCount,
        completed ? 'completed' : 'active',
        template.id,
      ],
    );

    // Audit log
    await logAction({
      tenantId: template.tenant_id,
      userId: systemUserId,
      action: 'recurring_journal.created',
      entityType: 'recurring_journal_template',
      entityId: template.id,
      changes: { journalId: finalJournalId, journalNumber: finalJournalNumber },
    });

    // Success notification
    if (template.notification_emails.length > 0) {
      await sendEmail({
        to: template.notification_emails,
        subject: `Recurring Journal Created: ${template.name}`,
        html: `<p>Recurring journal template <strong>${template.name}</strong> created journal <strong>${finalJournalNumber}</strong>.</p>`,
      });
    }
  } finally {
    client.release();
  }
}

// ── Setup ──────────────────────────────────────────────────────────

interface WorkerHandles {
  close(): Promise<void>;
}

export async function setupRecurringWorker(redisUrl: string): Promise<WorkerHandles> {
  const systemUserId = process.env.SYSTEM_USER_ID ?? null;

  if (!systemUserId) {
    console.warn('[recurring-worker] SYSTEM_USER_ID not set — auto-post will be skipped for all templates');
  }

  const connection = { url: redisUrl };

  const recurringQueue = new Queue(QUEUE_RECURRING_JOURNALS, { connection });

  // Register a repeating job that fires every 60 seconds to pick up due templates
  await recurringQueue.add('scheduled-tick', {}, { repeat: { every: 60_000 } });

  const recurringWorker = new Worker(
    QUEUE_RECURRING_JOURNALS,
    async (_job: Job) => {
      await processRecurringJournals(systemUserId);
    },
    { connection, concurrency: 1 },
  );

  return {
    async close() {
      await recurringWorker.close();
      await recurringQueue.close();
    },
  };
}
