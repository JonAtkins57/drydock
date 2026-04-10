import { processInboxEmails, createStubImapClient, type ImapClient } from './imap.poller.js';
import { processOcrJob, createTextractClient, type OcrClient } from './ocr.worker.js';
import { createStubS3Client, type S3Client } from './s3.client.js';

// ── Types ───────────────────────────────────────────────────────────

interface ApWorkerContext {
  s3Client: S3Client;
  ocrClient: OcrClient;
  imapClients: Map<string, ImapClient>; // configId -> client
}

interface WorkerHandles {
  close(): Promise<void>;
}

// ── BullMQ Setup ────────────────────────────────────────────────────

let Queue: unknown;
let Worker: unknown;

try {
  const bullmq = await import('bullmq');
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
} catch {
  console.warn('[ap-workers] BullMQ not available — queue functionality disabled. Install bullmq and ensure Redis is running.');
}

// ── Queue Names ─────────────────────────────────────────────────────

export const QUEUE_INBOX_POLL = 'ap-inbox-poll';
export const QUEUE_OCR_PROCESS = 'ap-ocr-process';

// ── Queue Job Enqueue Functions ─────────────────────────────────────

let inboxQueue: InstanceType<any> | null = null;
let ocrQueue: InstanceType<any> | null = null;

export async function queueInboxPoll(
  tenantId: string,
  configId: string,
): Promise<void> {
  if (!inboxQueue) {
    console.warn('[ap-workers] Inbox poll queue not initialized — skipping job');
    return;
  }
  await inboxQueue.add('poll', { tenantId, configId }, {
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function queueOcrJob(
  invoiceId: string,
  tenantId: string,
): Promise<void> {
  if (!ocrQueue) {
    console.warn('[ap-workers] OCR queue not initialized — skipping job');
    return;
  }
  await ocrQueue.add('process', { invoiceId, tenantId }, {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

// ── Worker Setup ────────────────────────────────────────────────────

export async function setupApWorkers(
  redisUrl: string,
  context?: Partial<ApWorkerContext>,
): Promise<WorkerHandles> {
  const s3Client = context?.s3Client ?? createStubS3Client();
  const ocrClient = context?.ocrClient ?? createTextractClient();
  const imapClients = context?.imapClients ?? new Map<string, ImapClient>();

  if (!Queue || !Worker) {
    console.warn('[ap-workers] BullMQ not available — workers not started');
    return { async close() { /* no-op */ } };
  }

  const QueueCtor = Queue as new (name: string, opts: Record<string, unknown>) => InstanceType<any>;
  const WorkerCtor = Worker as new (name: string, processor: (job: any) => Promise<void>, opts: Record<string, unknown>) => InstanceType<any>;

  const connection = { url: redisUrl };

  // Initialize queues
  inboxQueue = new QueueCtor(QUEUE_INBOX_POLL, { connection });
  ocrQueue = new QueueCtor(QUEUE_OCR_PROCESS, { connection });

  // Set up recurring inbox poll (every 5 minutes)
  await inboxQueue.upsertJobScheduler(
    'inbox-poll-scheduler',
    { every: 5 * 60 * 1000 },
    { name: 'scheduled-poll' },
  );

  // Inbox poll worker
  const inboxWorker = new WorkerCtor(
    QUEUE_INBOX_POLL,
    async (job: { data: { tenantId: string; configId?: string } }) => {
      const { tenantId, configId } = job.data;
      const client = imapClients.get(configId ?? 'default') ?? createStubImapClient();
      const result = await processInboxEmails(tenantId, client, s3Client);
      if (result.errors.length > 0) {
        console.error(`[ap-inbox-poll] Errors for tenant ${tenantId}:`, result.errors);
      }
    },
    { connection, concurrency: 1 },
  );

  // OCR processing worker
  const ocrWorker = new WorkerCtor(
    QUEUE_OCR_PROCESS,
    async (job: { data: { invoiceId: string; tenantId: string } }) => {
      const { invoiceId, tenantId } = job.data;
      const result = await processOcrJob(tenantId, invoiceId, ocrClient);
      if (!result.ok) {
        throw new Error(`OCR processing failed: ${result.error.message}`);
      }
    },
    { connection, concurrency: 3 },
  );

  return {
    async close() {
      await Promise.all([
        inboxWorker.close(),
        ocrWorker.close(),
        inboxQueue?.close(),
        ocrQueue?.close(),
      ]);
      inboxQueue = null;
      ocrQueue = null;
    },
  };
}
