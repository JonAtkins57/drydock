/**
 * SAP Concur Expense Integration Service
 *
 * Ingests approved Concur expense reports as draft GL journal entries.
 * Provides expense-type-to-GL-account mapping CRUD.
 *
 * Credentials: clientId and clientSecret encrypted at rest using AES-256-GCM
 * (ENCRYPTION_KEY env var) — same pattern as jira.service.ts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq, and, lte, gte } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  integrationConfigs,
  integrationSyncLogs,
  integrationErrorQueue,
  externalKeyMappings,
} from '../db/schema/integration.js';
import { accountingPeriods } from '../db/schema/index.js';
import { concurExpenseMappings } from '../db/schema/concur.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { createJournalEntry } from '../gl/posting.service.js';
import {
  fetchToken,
  fetchExpenseReports,
  fetchExpenseEntries,
  ConcurApiError,
} from './concur.client.js';

// ── Encryption (verbatim from jira.service.ts) ─────────────────────

const ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32',
    );
  }
  return Buffer.from(key, 'hex');
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, encHex, tagHex] = parts as [string, string, string];
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ── Config types ───────────────────────────────────────────────────

interface ConcurConfig {
  encryptedClientId: string;
  encryptedClientSecret: string;
  baseUrl: string;
  clearingAccountId: string;
}

interface SyncResult {
  syncLogId: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

async function loadConcurConfig(
  tenantId: string,
  configId: string,
): Promise<Result<{ id: string; config: ConcurConfig; clientId: string; clientSecret: string }, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'concur'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'Concur integration config not found' });
  }

  const config = row.config as ConcurConfig | null;
  if (!config?.encryptedClientId || !config?.encryptedClientSecret || !config?.baseUrl || !config?.clearingAccountId) {
    return err({ code: 'VALIDATION', message: 'Concur config is incomplete' });
  }

  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decrypt(config.encryptedClientId);
    clientSecret = decrypt(config.encryptedClientSecret);
  } catch {
    return err({ code: 'INTERNAL', message: 'Failed to decrypt Concur credentials' });
  }

  return ok({ id: row.id, config, clientId, clientSecret });
}

async function findExternalMapping(
  tenantId: string,
  integrationType: string,
  externalSystem: string,
  externalId: string,
  entityType: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(externalKeyMappings)
    .where(
      and(
        eq(externalKeyMappings.tenantId, tenantId),
        eq(externalKeyMappings.integrationType, integrationType),
        eq(externalKeyMappings.externalSystem, externalSystem),
        eq(externalKeyMappings.externalId, externalId),
        eq(externalKeyMappings.internalEntityType, entityType),
      ),
    )
    .limit(1);

  return rows[0]?.internalEntityId ?? null;
}

async function insertKeyMapping(
  tenantId: string,
  integrationType: string,
  externalSystem: string,
  externalId: string,
  entityType: string,
  internalEntityId: string,
): Promise<void> {
  const existing = await findExternalMapping(tenantId, integrationType, externalSystem, externalId, entityType);
  if (existing) return;

  await db.insert(externalKeyMappings).values({
    tenantId,
    integrationType,
    externalSystem,
    externalId,
    internalEntityType: entityType,
    internalEntityId,
  });
}

async function createSyncLog(configId: string, syncType: string): Promise<string> {
  const rows = await db
    .insert(integrationSyncLogs)
    .values({ integrationConfigId: configId, syncType, status: 'running' })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create sync log');
  return row.id;
}

async function completeSyncLog(
  logId: string,
  processed: number,
  failed: number,
  errors: string[],
): Promise<void> {
  await db
    .update(integrationSyncLogs)
    .set({
      completedAt: new Date(),
      status: failed > 0 ? 'completed_with_errors' : 'completed',
      recordsProcessed: processed,
      recordsFailed: failed,
      errorDetails: errors.length ? { errors } : null,
    })
    .where(eq(integrationSyncLogs.id, logId));
}

async function writeErrorQueue(
  syncLogId: string,
  sourceRecordId: string,
  errorType: string,
  errorMessage: string,
  payload: unknown,
): Promise<void> {
  await db.insert(integrationErrorQueue).values({
    syncLogId,
    sourceRecordId,
    errorType,
    errorMessage,
    payload: payload as Record<string, unknown>,
    status: 'pending',
  });
}

// ── Connect ────────────────────────────────────────────────────────

export async function connectConcur(
  tenantId: string,
  configName: string,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
  clearingAccountId: string,
): Promise<Result<{ ok: true; configId: string }, AppError>> {
  if (!baseUrl.startsWith('https://')) {
    return err({ code: 'VALIDATION', message: 'baseUrl must start with https://' });
  }

  let encryptedClientId: string;
  let encryptedClientSecret: string;
  try {
    encryptedClientId = encrypt(clientId);
    encryptedClientSecret = encrypt(clientSecret);
  } catch (e) {
    return err({
      code: 'INTERNAL',
      message: `Failed to encrypt Concur credentials: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const config: ConcurConfig = {
    encryptedClientId,
    encryptedClientSecret,
    baseUrl,
    clearingAccountId,
  };

  const rows = await db
    .insert(integrationConfigs)
    .values({
      tenantId,
      integrationType: 'concur',
      name: configName,
      config,
      isActive: true,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create Concur integration config' });
  }

  return ok({ ok: true, configId: row.id });
}

// ── Test Connection ────────────────────────────────────────────────

export async function testConcurConnection(
  tenantId: string,
  configId: string,
): Promise<Result<{ ok: true; accessToken: string }, AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<{ ok: true; accessToken: string }, AppError>;

  const { config, clientId, clientSecret } = configResult.value;

  try {
    await fetchToken(config.baseUrl, clientId, clientSecret);
    return ok({ ok: true, accessToken: '[REDACTED]' });
  } catch (e) {
    const msg = e instanceof ConcurApiError
      ? `Concur connection test failed (HTTP ${e.status})`
      : `Concur connection test failed: ${e instanceof Error ? e.message : String(e)}`;
    return err({ code: 'INTERNAL', message: msg });
  }
}

// ── Sync Expenses ──────────────────────────────────────────────────

export async function syncConcurExpenses(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config, clientId, clientSecret } = configResult.value;
  let syncLogId: string;

  try {
    syncLogId = await createSyncLog(configId, 'incremental');
  } catch (e) {
    return err({ code: 'INTERNAL', message: `Failed to create sync log: ${e instanceof Error ? e.message : String(e)}` });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Fetch token once for the sync run
    let token: string;
    try {
      token = await fetchToken(config.baseUrl, clientId, clientSecret);
    } catch (e) {
      const msg = e instanceof ConcurApiError
        ? `Concur token fetch failed (HTTP ${e.status})`
        : `Concur token fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      await completeSyncLog(syncLogId!, 0, 1, [msg]);
      return ok({ syncLogId: syncLogId!, recordsProcessed: 0, recordsFailed: 1, errors: [msg] });
    }

    // Paginated fetch of approved expense reports
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await fetchExpenseReports(config.baseUrl, token, offset);
      const reports = page.items;

      for (const report of reports) {
        try {
          // Skip already-synced reports
          const existing = await findExternalMapping(
            tenantId, 'concur', 'concur', report.ID, 'journal_entry',
          );
          if (existing) continue;

          // Find open accounting period covering report.SubmitDate
          const reportDate = new Date(report.SubmitDate);
          const periodRows = await db
            .select()
            .from(accountingPeriods)
            .where(
              and(
                eq(accountingPeriods.tenantId, tenantId),
                lte(accountingPeriods.startDate, reportDate),
                gte(accountingPeriods.endDate, reportDate),
                eq(accountingPeriods.status, 'open'),
              ),
            )
            .limit(1);

          const period = periodRows[0];
          if (!period) {
            const errMsg = `No open accounting period found for report ${report.ID} (SubmitDate: ${report.SubmitDate})`;
            await writeErrorQueue(syncLogId!, report.ID, 'no_open_period', errMsg, { report });
            errors.push(errMsg);
            failed++;
            continue;
          }

          // Fetch expense entries (line items) for this report
          const entries = await fetchExpenseEntries(config.baseUrl, token, report.ID);

          if (entries.length === 0) {
            // No entries — skip
            continue;
          }

          // Load concur_expense_mappings for this config
          const mappingRows = await db
            .select()
            .from(concurExpenseMappings)
            .where(
              and(
                eq(concurExpenseMappings.integrationConfigId, configId),
                eq(concurExpenseMappings.isActive, true),
              ),
            );

          const mappingByCode = new Map(mappingRows.map((m) => [m.expenseTypeCode, m]));

          // Build debit lines for mapped entries
          const debitLines: Array<{
            accountId: string;
            debitAmount: number;
            creditAmount: number;
            description: string | null;
          }> = [];

          for (const entry of entries) {
            const mapping = mappingByCode.get(entry.ExpenseTypeCode);
            if (!mapping) {
              const errMsg = `No expense mapping for type '${entry.ExpenseTypeCode}' in report ${report.ID}`;
              await writeErrorQueue(syncLogId!, entry.ID, 'no_expense_mapping', errMsg, { entry, reportId: report.ID });
              errors.push(errMsg);
              failed++;
              continue;
            }

            const amountCents = Math.round(entry.TransactionAmount * 100);
            if (amountCents <= 0) continue;

            debitLines.push({
              accountId: mapping.debitAccountId,
              debitAmount: amountCents,
              creditAmount: 0,
              description: entry.Description ?? entry.ExpenseTypeName ?? null,
            });
          }

          if (debitLines.length === 0) {
            // No successfully mapped lines — skip report
            const errMsg = `Report ${report.ID} has no mappable expense lines — skipping`;
            errors.push(errMsg);
            failed++;
            continue;
          }

          const totalCents = debitLines.reduce((sum, l) => sum + l.debitAmount, 0);

          // Single credit line totaling all debits
          const creditLine = {
            accountId: config.clearingAccountId,
            debitAmount: 0,
            creditAmount: totalCents,
            description: `Concur expense report ${report.ID}`,
          };

          const journalData = {
            journalType: 'automated' as const,
            periodId: period.id,
            postingDate: report.SubmitDate.endsWith('Z') ? report.SubmitDate : `${report.SubmitDate}Z`,
            description: `Concur expense report: ${report.Name ?? report.ID}`,
            sourceModule: 'concur',
            sourceEntityType: 'expense_report',
            sourceEntityId: null,
            lines: [...debitLines, creditLine],
          };

          const jeResult = await createJournalEntry(tenantId, journalData, 'system');
          if (!jeResult.ok) {
            const errMsg = `Failed to create journal entry for report ${report.ID}: ${jeResult.error.message}`;
            await writeErrorQueue(syncLogId!, report.ID, 'journal_entry_failed', errMsg, { report });
            errors.push(errMsg);
            failed++;
            continue;
          }

          await insertKeyMapping(tenantId, 'concur', 'concur', report.ID, 'journal_entry', jeResult.value.id);
          processed++;
        } catch (e) {
          const errMsg = `Report ${report.ID}: ${e instanceof Error ? e.message : String(e)}`;
          errors.push(errMsg);
          failed++;
        }
      }

      hasMore = page.nextPage !== null && reports.length > 0;
      offset += reports.length;

      if (reports.length === 0) break;
    }
  } catch (e) {
    failed++;
    errors.push(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncLog(syncLogId!, processed, failed, errors);
  return ok({ syncLogId: syncLogId!, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── Expense Mappings ───────────────────────────────────────────────

export async function getExpenseMappings(
  tenantId: string,
  configId: string,
): Promise<Result<unknown[], AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<unknown[], AppError>;

  const rows = await db
    .select()
    .from(concurExpenseMappings)
    .where(
      and(
        eq(concurExpenseMappings.integrationConfigId, configId),
        eq(concurExpenseMappings.tenantId, tenantId),
      ),
    );

  return ok(
    rows.map((r) => ({
      id: r.id,
      expenseTypeCode: r.expenseTypeCode,
      expenseTypeName: r.expenseTypeName,
      debitAccountId: r.debitAccountId,
      creditAccountId: r.creditAccountId,
      isActive: r.isActive,
    })),
  );
}

export async function setExpenseMappings(
  tenantId: string,
  configId: string,
  mappings: Array<{
    expenseTypeCode: string;
    expenseTypeName?: string;
    debitAccountId: string;
    creditAccountId?: string;
  }>,
): Promise<Result<{ ok: true; count: number }, AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<{ ok: true; count: number }, AppError>;

  await db.transaction(async (tx) => {
    await tx
      .delete(concurExpenseMappings)
      .where(
        and(
          eq(concurExpenseMappings.integrationConfigId, configId),
          eq(concurExpenseMappings.tenantId, tenantId),
        ),
      );

    if (mappings.length > 0) {
      await tx.insert(concurExpenseMappings).values(
        mappings.map((m) => ({
          tenantId,
          integrationConfigId: configId,
          expenseTypeCode: m.expenseTypeCode,
          expenseTypeName: m.expenseTypeName ?? null,
          debitAccountId: m.debitAccountId,
          creditAccountId: m.creditAccountId ?? null,
          isActive: true,
        })),
      );
    }
  });

  return ok({ ok: true, count: mappings.length });
}

export async function deleteExpenseMapping(
  tenantId: string,
  configId: string,
  mappingId: string,
): Promise<Result<{ ok: true }, AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<{ ok: true }, AppError>;

  const rows = await db
    .update(concurExpenseMappings)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(concurExpenseMappings.id, mappingId),
        eq(concurExpenseMappings.integrationConfigId, configId),
        eq(concurExpenseMappings.tenantId, tenantId),
      ),
    )
    .returning();

  if (rows.length === 0) {
    return err({ code: 'NOT_FOUND', message: 'Expense mapping not found' });
  }

  return ok({ ok: true });
}

// ── Sync Logs ──────────────────────────────────────────────────────

export async function getConcurSyncLogs(
  tenantId: string,
  configId: string,
  page: number,
  pageSize: number,
): Promise<Result<{ data: unknown[]; total: number }, AppError>> {
  const configResult = await loadConcurConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<{ data: unknown[]; total: number }, AppError>;

  const rows = await db
    .select()
    .from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.integrationConfigId, configId))
    .orderBy(integrationSyncLogs.startedAt)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      syncType: r.syncType,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      recordsProcessed: r.recordsProcessed,
      recordsFailed: r.recordsFailed,
      errorDetails: r.errorDetails,
    })),
    total: rows.length,
  });
}

// ── Disconnect ─────────────────────────────────────────────────────

export async function disconnectConcur(
  tenantId: string,
  configId: string,
): Promise<Result<{ ok: true }, AppError>> {
  const rows = await db
    .update(integrationConfigs)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'concur'),
      ),
    )
    .returning();

  if (rows.length === 0) {
    return err({ code: 'NOT_FOUND', message: 'Concur integration config not found' });
  }

  return ok({ ok: true });
}
