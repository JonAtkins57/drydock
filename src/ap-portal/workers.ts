import { processInboxEmails, createStubImapClient, createImapPoller, type ImapClient, type ImapConfig } from './imap.poller.js';
import { processOcrJob, createTextractClient, type OcrClient } from './ocr.worker.js';
import { createStubS3Client, createS3Client, type S3Client } from './s3.client.js';
import { getDb } from '../db/connection.js';
import { integrationConfigs } from '../db/schema/integration.js';
import { eq, and } from 'drizzle-orm';

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

function isImapConfig(val: unknown): val is ImapConfig {
  if (typeof val !== 'object' || val === null) return false;
  const v = val as Record<string, unknown>;
  return (
    typeof v['host'] === 'string' &&
    typeof v['port'] === 'number' &&
    typeof v['user'] === 'string' &&
    typeof v['password'] === 'string'
  );
}

interface AwsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function isAwsConfig(val: unknown): val is AwsConfig {
  if (typeof val !== 'object' || val === null) return false;
  const v = val as Record<string, unknown>;
  return (
    typeof v['region'] === 'string' &&
    typeof v['accessKeyId'] === 'string' &&
    typeof v['secretAccessKey'] === 'string'
  );
}

export async function setupApWorkers(
  redisUrl: string,
  context?: Partial<ApWorkerContext>,
): Promise<WorkerHandles> {
  // Global fallback clients — used when no per-tenant AWS config is found
  const globalS3Client = context?.s3Client ?? (
    process.env['AWS_ACCESS_KEY_ID']
      ? createS3Client({
          region: process.env['AWS_REGION'] ?? 'us-east-1',
          accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
          secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
        })
      : createStubS3Client()
  );
  const globalOcrClient = context?.ocrClient ?? createTextractClient();

  // Per-tenant S3 and Textract clients (tenantId -> client)
  // Loaded from integration_configs where integration_type = 'aws'
  // Takes precedence over global env fallback for the matched tenant
  const s3Clients = new Map<string, S3Client>();
  const ocrClients = new Map<string, OcrClient>();

  if (!context?.s3Client && !context?.ocrClient) {
    try {
      const db = getDb();
      const awsRows = await db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.integrationType, 'aws'), eq(integrationConfigs.isActive, true)));
      for (const row of awsRows) {
        const cfg = row.config;
        if (!isAwsConfig(cfg)) {
          console.warn(`[ap-workers] AWS config for integration ${row.id} (tenant ${row.tenantId}) missing required fields — skipping`);
          continue;
        }
        s3Clients.set(row.tenantId, createS3Client({
          region: cfg.region,
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        }));
        ocrClients.set(row.tenantId, createTextractClient(cfg.region, {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        }));
      }
      if (s3Clients.size > 0) {
        console.info(`[ap-workers] Loaded per-tenant AWS credentials for ${s3Clients.size} tenant(s)`);
      } else {
        console.warn('[ap-workers] No per-tenant AWS integration configs found — using global env fallback');
      }
    } catch (loadErr) {
      console.warn('[ap-workers] Failed to load AWS integration configs from DB — using global env fallback', loadErr);
    }
  }

  // Populate imapClients from DB unless caller supplied them
  const imapClients = context?.imapClients ?? new Map<string, ImapClient>();
  if (!context?.imapClients) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.integrationType, 'imap'), eq(integrationConfigs.isActive, true)));
      for (const row of rows) {
        const cfg = row.config;
        if (!isImapConfig(cfg)) {
          console.warn(`[ap-workers] IMAP config for integration ${row.id} is missing required fields — skipping`);
          continue;
        }
        const client = createImapPoller({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          password: cfg.password,
          tls: typeof (cfg as unknown as Record<string, unknown>)['tls'] === 'boolean'
            ? (cfg as unknown as Record<string, unknown>)['tls'] as boolean
            : false,
        });
        imapClients.set(row.id, client);
      }
    } catch (err) {
      console.warn('[ap-workers] Failed to load IMAP configs from DB — proceeding without real IMAP clients', err);
    }
  }

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

  // Inbox poll worker — uses per-tenant S3 client if available
  const inboxWorker = new WorkerCtor(
    QUEUE_INBOX_POLL,
    async (job: { data: { tenantId: string; configId?: string } }) => {
      const { tenantId, configId } = job.data;
      const imapClient = imapClients.get(configId ?? 'default') ?? createStubImapClient();
      const s3Client = s3Clients.get(tenantId) ?? globalS3Client;
      const result = await processInboxEmails(tenantId, imapClient, s3Client);
      if (result.errors.length > 0) {
        console.error(`[ap-inbox-poll] Errors for tenant ${tenantId}:`, result.errors);
      }
    },
    { connection, concurrency: 1 },
  );

  // OCR processing worker — uses per-tenant Textract client if available
  const ocrWorker = new WorkerCtor(
    QUEUE_OCR_PROCESS,
    async (job: { data: { invoiceId: string; tenantId: string } }) => {
      const { invoiceId, tenantId } = job.data;
      const ocrClient = ocrClients.get(tenantId) ?? globalOcrClient;
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
