/**
 * Harvest Integration Service
 *
 * Syncs Harvest users, projects, and time entries into DryDock.
 * - Users   → external_key_mappings (harvest → drydock_master.employees)
 * - Projects → external_key_mappings (harvest → drydock_master.projects)
 * - Time entries → drydock_integration.harvest_time_entries (upsert by harvest_entry_id)
 *
 * Credentials: accessToken encrypted at rest using AES-256-GCM (ENCRYPTION_KEY env var).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  integrationConfigs,
  integrationSyncLogs,
  externalKeyMappings,
  harvestTimeEntries,
} from '../db/schema/integration.js';
import { employees } from '../db/schema/master.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import {
  fetchUsers,
  fetchProjects,
  fetchTimeEntries,
  HarvestApiError,
} from './harvest.client.js';

// ── Encryption (same pattern as jira.service.ts) ───────────────────

const ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
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
  const encData = Buffer.from(encHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encData), decipher.final()]).toString('utf8');
}

// ── Config types ───────────────────────────────────────────────────

interface HarvestConfig {
  encryptedAccessToken: string;
  accountId: string;
  /** ISO date YYYY-MM-DD — earliest date to pull time entries from */
  syncFromDate?: string;
}

interface SyncResult {
  syncLogId: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
}

// ── Config loader ──────────────────────────────────────────────────

async function loadHarvestConfig(
  tenantId: string,
  configId: string,
): Promise<Result<{ id: string; config: HarvestConfig; accessToken: string }, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'harvest'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'Harvest integration config not found' });
  }

  const config = row.config as HarvestConfig | null;
  if (!config?.encryptedAccessToken || !config?.accountId) {
    return err({ code: 'VALIDATION', message: 'Harvest config missing encryptedAccessToken or accountId' });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.encryptedAccessToken);
  } catch {
    return err({ code: 'INTERNAL', message: 'Failed to decrypt Harvest access token' });
  }

  return ok({ id: row.id, config, accessToken });
}

// ── Helpers ────────────────────────────────────────────────────────

async function findExternalMapping(
  tenantId: string,
  externalId: string,
  entityType: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(externalKeyMappings)
    .where(
      and(
        eq(externalKeyMappings.tenantId, tenantId),
        eq(externalKeyMappings.integrationType, 'harvest'),
        eq(externalKeyMappings.externalSystem, 'harvest'),
        eq(externalKeyMappings.externalId, externalId),
        eq(externalKeyMappings.internalEntityType, entityType),
      ),
    )
    .limit(1);

  return rows[0]?.internalEntityId ?? null;
}

async function upsertExternalMapping(
  tenantId: string,
  externalId: string,
  entityType: string,
  internalId: string,
): Promise<void> {
  const existing = await findExternalMapping(tenantId, externalId, entityType);
  if (existing) return;
  await db.insert(externalKeyMappings).values({
    tenantId,
    integrationType: 'harvest',
    externalSystem: 'harvest',
    externalId,
    internalEntityType: entityType,
    internalEntityId: internalId,
  });
}

// ── Sync: Users ────────────────────────────────────────────────────

export async function syncHarvestUsers(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadHarvestConfig(tenantId, configId);
  if (!configResult.ok) return err(configResult.error);
  const { accessToken } = configResult.value;

  const [syncLog] = await db
    .insert(integrationSyncLogs)
    .values({
      integrationConfigId: configId,
      syncType: 'users',
      status: 'running',
    })
    .returning();

  if (!syncLog) return err({ code: 'INTERNAL', message: 'Failed to create sync log' });

  const syncLogId = syncLog.id;
  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors: string[] = [];

  try {
    const users = await fetchUsers(accessToken, configResult.value.config.accountId);

    for (const user of users) {
      try {
        // Try to find matching employee by email
        const empRows = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.tenantId, tenantId),
              eq(employees.email, user.email.toLowerCase()),
            ),
          )
          .limit(1);

        if (empRows[0]) {
          await upsertExternalMapping(
            tenantId,
            String(user.id),
            'employee',
            empRows[0].id,
          );
        }

        recordsProcessed++;
      } catch (e) {
        recordsFailed++;
        errors.push(`User ${user.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await db
      .update(integrationSyncLogs)
      .set({
        status: recordsFailed > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        recordsProcessed,
        recordsFailed,
        errorDetails: errors.length > 0 ? { errors: errors.slice(0, 50) } : null,
      })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return ok({ syncLogId, recordsProcessed, recordsFailed, errors });
  } catch (e) {
    const message = e instanceof HarvestApiError
      ? `Harvest API error ${e.status}: ${e.message}`
      : String(e);

    await db
      .update(integrationSyncLogs)
      .set({ status: 'failed', completedAt: new Date(), errorDetails: { error: message } })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return err({ code: 'INTERNAL', message });
  }
}

// ── Sync: Projects ─────────────────────────────────────────────────

export async function syncHarvestProjects(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadHarvestConfig(tenantId, configId);
  if (!configResult.ok) return err(configResult.error);
  const { accessToken } = configResult.value;

  const [syncLog] = await db
    .insert(integrationSyncLogs)
    .values({
      integrationConfigId: configId,
      syncType: 'projects',
      status: 'running',
    })
    .returning();

  if (!syncLog) return err({ code: 'INTERNAL', message: 'Failed to create sync log' });

  const syncLogId = syncLog.id;
  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors: string[] = [];

  try {
    const projects = await fetchProjects(accessToken, configResult.value.config.accountId);

    // Build a lookup of internal projects by project_number (Harvest project code)
    // via external_key_mappings already set, or try to match on name/code
    for (const project of projects) {
      try {
        // Check if already mapped
        const existing = await findExternalMapping(tenantId, String(project.id), 'project');
        if (!existing) {
          // Try to match on project_number = project.code in drydock_master.projects
          if (project.code) {
            const internalRows = await db.execute(
              sql`SELECT id FROM drydock_master.projects
                  WHERE tenant_id = ${tenantId}::uuid
                    AND project_number = ${project.code}
                    AND is_active = true
                  LIMIT 1`,
            ).catch(() => ({ rows: [] as Array<{ id: string }> }));
            const rows = (internalRows as unknown as { rows: Array<{ id: string }> }).rows;
            if (rows[0]) {
              await upsertExternalMapping(tenantId, String(project.id), 'project', rows[0].id);
            }
          }
        }

        recordsProcessed++;
      } catch (e) {
        recordsFailed++;
        errors.push(`Project ${project.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await db
      .update(integrationSyncLogs)
      .set({
        status: recordsFailed > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        recordsProcessed,
        recordsFailed,
        errorDetails: errors.length > 0 ? { errors: errors.slice(0, 50) } : null,
      })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return ok({ syncLogId, recordsProcessed, recordsFailed, errors });
  } catch (e) {
    const message = e instanceof HarvestApiError
      ? `Harvest API error ${e.status}: ${e.message}`
      : String(e);

    await db
      .update(integrationSyncLogs)
      .set({ status: 'failed', completedAt: new Date(), errorDetails: { error: message } })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return err({ code: 'INTERNAL', message });
  }
}

// ── Sync: Time Entries ─────────────────────────────────────────────

export async function syncHarvestTimeEntries(
  tenantId: string,
  configId: string,
  options?: { since?: string; until?: string },
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadHarvestConfig(tenantId, configId);
  if (!configResult.ok) return err(configResult.error);
  const { accessToken, config } = configResult.value;

  const since = options?.since ?? config.syncFromDate ?? '2020-01-01';
  const until = options?.until ?? new Date().toISOString().slice(0, 10);

  const [syncLog] = await db
    .insert(integrationSyncLogs)
    .values({
      integrationConfigId: configId,
      syncType: 'time_entries',
      status: 'running',
    })
    .returning();

  if (!syncLog) return err({ code: 'INTERNAL', message: 'Failed to create sync log' });

  const syncLogId = syncLog.id;
  let recordsProcessed = 0;
  let recordsFailed = 0;
  const errors: string[] = [];

  try {
    // Pre-populate user email cache
    const users = await fetchUsers(accessToken, config.accountId);
    const userEmailCache = new Map<number, string>(
      users.map((u) => [u.id, u.email]),
    );

    const entryStream = fetchTimeEntries(accessToken, config.accountId, since, until, userEmailCache);

    for await (const batch of entryStream) {
      const toInsert = [];

      for (const entry of batch) {
        try {
          // Resolve internal IDs from existing external_key_mappings
          const internalProjectId = await findExternalMapping(
            tenantId,
            String(entry.projectId),
            'project',
          );
          const internalEmployeeId = await findExternalMapping(
            tenantId,
            String(entry.userId),
            'employee',
          );

          toInsert.push({
            tenantId,
            harvestEntryId: entry.id,
            harvestUserId: entry.userId,
            harvestProjectId: entry.projectId,
            harvestTaskId: entry.taskId,
            harvestClientId: entry.clientId,
            userName: entry.userName,
            userEmail: entry.userEmail,
            projectName: entry.projectName,
            projectCode: entry.projectCode,
            taskName: entry.taskName,
            clientName: entry.clientName,
            spentDate: entry.spentDate,
            hours: String(entry.hours),
            roundedHours: String(entry.roundedHours),
            billable: entry.billable,
            billableRateCents: Math.round(entry.billableRate * 100),
            costRateCents: Math.round(entry.costRate * 100),
            isBilled: entry.isBilled,
            isLocked: entry.isLocked,
            notes: entry.notes || null,
            externalRefId: entry.externalRefId,
            externalRefUrl: entry.externalRefUrl,
            startedTime: entry.startedTime,
            endedTime: entry.endedTime,
            internalProjectId: internalProjectId ?? null,
            internalEmployeeId: internalEmployeeId ?? null,
          });
        } catch (e) {
          recordsFailed++;
          errors.push(`Entry ${entry.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (toInsert.length > 0) {
        // Upsert by (tenant_id, harvest_entry_id) — update mutable fields on conflict
        await db
          .insert(harvestTimeEntries)
          .values(toInsert)
          .onConflictDoUpdate({
            target: [harvestTimeEntries.tenantId, harvestTimeEntries.harvestEntryId],
            set: {
              hours: sql`excluded.hours`,
              roundedHours: sql`excluded.rounded_hours`,
              userName: sql`excluded.user_name`,
              userEmail: sql`excluded.user_email`,
              projectName: sql`excluded.project_name`,
              taskName: sql`excluded.task_name`,
              clientName: sql`excluded.client_name`,
              billable: sql`excluded.billable`,
              billableRateCents: sql`excluded.billable_rate_cents`,
              costRateCents: sql`excluded.cost_rate_cents`,
              isBilled: sql`excluded.is_billed`,
              isLocked: sql`excluded.is_locked`,
              notes: sql`excluded.notes`,
              internalProjectId: sql`excluded.internal_project_id`,
              internalEmployeeId: sql`excluded.internal_employee_id`,
              updatedAt: new Date(),
            },
          });

        recordsProcessed += toInsert.length;
      }
    }

    await db
      .update(integrationSyncLogs)
      .set({
        status: recordsFailed > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        recordsProcessed,
        recordsFailed,
        errorDetails: errors.length > 0 ? { errors: errors.slice(0, 50) } : null,
      })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return ok({ syncLogId, recordsProcessed, recordsFailed, errors });
  } catch (e) {
    const message = e instanceof HarvestApiError
      ? `Harvest API error ${e.status}: ${e.message}`
      : String(e);

    await db
      .update(integrationSyncLogs)
      .set({ status: 'failed', completedAt: new Date(), errorDetails: { error: message } })
      .where(eq(integrationSyncLogs.id, syncLogId));

    return err({ code: 'INTERNAL', message });
  }
}

// ── Connect (create/update config) ────────────────────────────────

export async function connectHarvest(
  tenantId: string,
  accessToken: string,
  accountId: string,
  name: string,
  syncFromDate?: string,
): Promise<Result<{ configId: string }, AppError>> {
  let encryptedAccessToken: string;
  try {
    encryptedAccessToken = encrypt(accessToken);
  } catch (e) {
    return err({
      code: 'INTERNAL',
      message: `Failed to encrypt Harvest access token: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const config: HarvestConfig = {
    encryptedAccessToken,
    accountId,
    ...(syncFromDate ? { syncFromDate } : {}),
  };

  const existing = await db
    .select({ id: integrationConfigs.id })
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'harvest'),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(integrationConfigs)
      .set({ name, config, isActive: true, updatedAt: new Date() })
      .where(eq(integrationConfigs.id, existing[0].id));

    return ok({ configId: existing[0].id });
  }

  const [newConfig] = await db
    .insert(integrationConfigs)
    .values({ tenantId, integrationType: 'harvest', name, config })
    .returning({ id: integrationConfigs.id });

  if (!newConfig) return err({ code: 'INTERNAL', message: 'Failed to create integration config' });

  return ok({ configId: newConfig.id });
}

// ── Sync logs ──────────────────────────────────────────────────────

export async function getHarvestSyncLogs(
  tenantId: string,
  configId: string,
  limit = 25,
): Promise<Result<unknown[], AppError>> {
  // Verify config belongs to tenant
  const config = await db
    .select({ id: integrationConfigs.id })
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'harvest'),
      ),
    )
    .limit(1);

  if (!config[0]) {
    return err({ code: 'NOT_FOUND', message: 'Harvest integration config not found' });
  }

  const logs = await db
    .select()
    .from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.integrationConfigId, configId))
    .orderBy(integrationSyncLogs.startedAt)
    .limit(limit);

  return ok(logs);
}
