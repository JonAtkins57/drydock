import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { quotes, docusignEnvelopes } from '../db/schema/index.js';
import { logAction } from '../core/audit.service.js';
import { getDocuSignConfig, downloadEnvelopeDocument } from '../integration/docusign.js';
import { uploadFile } from '../core/s3.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { quoteService } from './quotes.service.js';

// DocuSign envelope statuses that map to quote state changes
const TERMINAL_STATUSES = new Set(['completed', 'declined', 'voided']);

// Valid values for the docusign_envelopes.status enum column
const VALID_ENVELOPE_STATUSES = new Set(['sent', 'delivered', 'completed', 'voided', 'declined']);

export interface WebhookEventPayload {
  event: string;
  data: {
    envelopeId: string;
    envelopeSummary?: {
      status?: string;
    };
  };
}

// Maps DocuSign Connect event names to granular audit action labels
function auditActionForEvent(event: string): string {
  switch (event) {
    case 'envelope-viewed':
    case 'envelope-delivered': return 'docusign_viewed';
    case 'recipient-viewed': return 'docusign_signer_viewed';
    case 'recipient-completed': return 'docusign_signer_completed';
    case 'envelope-completed': return 'docusign_completed';
    case 'envelope-declined': return 'docusign_declined';
    case 'envelope-voided': return 'docusign_voided';
    default: return 'docusign_webhook';
  }
}

/**
 * Processes a DocuSign Connect webhook event.
 * Looks up the quote by envelopeId, updates docusignStatus on quotes,
 * keeps the docusign_envelopes record in sync, downloads and stores the
 * signed PDF to S3 on completion (best-effort), and transitions quote
 * status to 'executed' (with auto-created sales order) on completion.
 */
export async function processWebhookEvent(
  payload: WebhookEventPayload,
): Promise<Result<{ quoteId: string; docusignStatus: string; s3Key?: string }, AppError>> {
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

  // Update docusign status on the quote
  await db
    .update(quotes)
    .set({ docusignStatus: envelopeStatus, updatedAt: new Date() })
    .where(eq(quotes.id, quote.id));

  // Keep docusign_envelopes record in sync (single source of truth for envelope detail)
  const envelopeRows = await db
    .select()
    .from(docusignEnvelopes)
    .where(eq(docusignEnvelopes.envelopeId, envelopeId))
    .limit(1);
  const envelopeRecord = envelopeRows[0];

  if (envelopeRecord && VALID_ENVELOPE_STATUSES.has(envelopeStatus)) {
    await db
      .update(docusignEnvelopes)
      .set({
        status: envelopeStatus as 'sent' | 'delivered' | 'completed' | 'voided' | 'declined',
        updatedAt: new Date(),
      })
      .where(eq(docusignEnvelopes.id, envelopeRecord.id));
  }

  // On completion: download signed PDF and store to S3 (best-effort — don't fail the webhook)
  let s3Key: string | undefined;
  if (envelopeStatus === 'completed') {
    try {
      const config = getDocuSignConfig();
      if (config) {
        const pdfBuffer = await downloadEnvelopeDocument(config, envelopeId);
        s3Key = await uploadFile(
          quote.tenantId,
          'quote',
          quote.id,
          `signed-${envelopeId}.pdf`,
          pdfBuffer,
          'application/pdf',
        );
        if (envelopeRecord) {
          await db
            .update(docusignEnvelopes)
            .set({ s3KeySignedDoc: s3Key, updatedAt: new Date() })
            .where(eq(docusignEnvelopes.id, envelopeRecord.id));
        }
      }
    } catch {
      // Signed doc storage is best-effort — don't fail webhook processing
    }
  }

  // Auto-execute quote on DocuSign completion — goes through quoteService
  // so that the sales order is created and audit is logged consistently.
  const wasExecuted = envelopeStatus === 'completed' && quote.status === 'sent';
  if (wasExecuted) {
    const execResult = await quoteService.executeQuote(quote.tenantId, quote.id, 'system');
    if (!execResult.ok) {
      return err(execResult.error);
    }
    // executeQuote logs its own audit entry — skip duplicate logAction below
    return ok({ quoteId: quote.id, docusignStatus: envelopeStatus, s3Key });
  }

  await logAction({
    tenantId: quote.tenantId,
    userId: null,
    action: auditActionForEvent(payload.event),
    entityType: 'quote',
    entityId: quote.id,
    changes: { event: payload.event, envelopeId, envelopeStatus, ...(s3Key ? { s3Key } : {}) },
  });

  return ok({ quoteId: quote.id, docusignStatus: envelopeStatus, s3Key });
}

/**
 * Checks whether this envelope status represents a terminal state
 * (completed, declined, or voided).
 */
export function isTerminalEnvelopeStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}
