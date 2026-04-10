import { createHash } from 'node:crypto';
import { checkDuplicate, createFromUpload } from './intake.service.js';
import type { S3Client } from './s3.client.js';

// ── IMAP Types ──────────────────────────────────────────────────────

export interface ImapAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface ImapMessage {
  uid: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
  attachments: ImapAttachment[];
}

export interface ImapClient {
  connect(): Promise<void>;
  fetchUnread(): Promise<ImapMessage[]>;
  markRead(uid: string): Promise<void>;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

// ── Stub Implementation ─────────────────────────────────────────────

export function createStubImapClient(): ImapClient {
  return {
    async connect() { /* no-op */ },
    async fetchUnread() { return []; },
    async markRead(_uid: string) { /* no-op */ },
  };
}

// ── Factory (real IMAP client — swap in imap-simple or similar) ─────

export function createImapPoller(_config: ImapConfig): ImapClient {
  // TODO: Wire up real IMAP library
  return createStubImapClient();
}

// ── Email Processing Pipeline ───────────────────────────────────────

const PROCESSABLE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
]);

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function processInboxEmails(
  tenantId: string,
  imapClient: ImapClient,
  s3Client: S3Client,
  bucket = 'drydock-ap-attachments',
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  await imapClient.connect();
  const messages = await imapClient.fetchUnread();

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const msg of messages) {
    try {
      const attachments = msg.attachments.filter((a) =>
        PROCESSABLE_TYPES.has(a.contentType),
      );

      if (attachments.length === 0) {
        skipped++;
        await imapClient.markRead(msg.uid);
        continue;
      }

      for (const attachment of attachments) {
        const hash = createHash('sha256').update(attachment.content).digest('hex');

        // Check duplicate by hash — use hash as a pseudo invoice number for dedup
        const dupResult = await checkDuplicate(
          tenantId,
          '00000000-0000-0000-0000-000000000000', // placeholder vendor until OCR
          `HASH:${hash}`,
          null,
        );
        if (dupResult.ok && dupResult.value) {
          skipped++;
          continue;
        }

        // Upload to S3
        const key = `${tenantId}/${Date.now()}-${attachment.filename}`;
        const attachmentUrl = await s3Client.upload(bucket, key, attachment.content);

        // Create AP invoice in ocr_pending status
        const createResult = await createFromUpload(
          tenantId,
          {
            attachmentUrl,
            attachmentHash: hash,
            source: 'email',
            sourceEmail: msg.from,
          },
          SYSTEM_USER_ID,
        );

        if (!createResult.ok) {
          errors.push(`Failed to create invoice from ${msg.from}: ${createResult.error.message}`);
          continue;
        }

        processed++;
      }

      await imapClient.markRead(msg.uid);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`Error processing email uid=${msg.uid}: ${message}`);
    }
  }

  return { processed, skipped, errors };
}
