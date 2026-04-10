import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { quotes } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

// DocuSign envelope statuses that map to quote state changes
const TERMINAL_STATUSES = new Set(['completed', 'declined', 'voided']);

export interface WebhookEventPayload {
  event: string;
  data: {
    envelopeId: string;
    envelopeSummary?: {
      status?: string;
    };
  };
}

/**
 * Processes a DocuSign Connect webhook event.
 * Looks up the quote by envelopeId, updates docusignStatus,
 * and transitions quote status to 'executed' on completion.
 */
export async function processWebhookEvent(
  payload: WebhookEventPayload,
): Promise<Result<{ quoteId: string; docusignStatus: string }, AppError>> {
  const envelopeId = payload.data.envelopeId;
  const envelopeStatus = payload.data.envelopeSummary?.status ?? payload.event.replace('envelope-', '');

  if (!envelopeId) {
    return err({ code: 'VALIDATION', message: 'Missing envelopeId in webhook payload' });
  }

  // Look up quote by envelope ID (cross-tenant — webhooks don't have tenant context)
  const rows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.docusignEnvelopeId, envelopeId))
    .limit(1);

  const quote = rows[0];
  if (!quote) {
    return err({ code: 'NOT_FOUND', message: `No quote found for envelope ${envelopeId}` });
  }

  const updateData: Record<string, unknown> = {
    docusignStatus: envelopeStatus,
    updatedAt: new Date(),
  };

  // Auto-execute quote on DocuSign completion
  if (envelopeStatus === 'completed') {
    updateData['status'] = 'executed';
  }

  await db
    .update(quotes)
    .set(updateData)
    .where(eq(quotes.id, quote.id));

  await logAction({
    tenantId: quote.tenantId,
    userId: null,
    action: 'docusign_webhook',
    entityType: 'quote',
    entityId: quote.id,
    changes: { event: payload.event, envelopeId, envelopeStatus },
  });

  return ok({ quoteId: quote.id, docusignStatus: envelopeStatus });
}

/**
 * Checks whether this envelope status represents a terminal state
 * (completed, declined, or voided).
 */
export function isTerminalEnvelopeStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
