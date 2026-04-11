/**
 * JIRA Cloud Integration Service
 *
 * Handles bi-directional sync: JIRA projects ↔ drydock_project_mgmt.projects_mgmt,
 * JIRA issues ↔ drydock_project.work_orders, JIRA worklogs → drydock_project.work_order_time_logs.
 *
 * Credentials: apiToken is encrypted at rest using AES-256-GCM (ENCRYPTION_KEY env var).
 * webhookSecret is generated on connect and returned once only.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  integrationConfigs,
  integrationSyncLogs,
  integrationFieldMappings,
  integrationErrorQueue,
  externalKeyMappings,
} from '../db/schema/integration.js';
import { workOrders, workOrderTimeLogs } from '../db/schema/work-orders.js';
import { projectsMgmt } from '../db/schema/project-mgmt.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { generateNumber } from '../core/numbering.service.js';
import {
  getMyself,
  searchProjects,
  searchIssues,
  getIssueWorklogs,
  getProjectStatuses,
  JiraApiError,
} from './jira.client.js';

// ── Encryption ─────────────────────────────────────────────────────

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

interface JiraConfig {
  host: string;
  email: string;
  encryptedApiToken: string;
  webhookSecret: string;
  autoCreateProjects: boolean;
  autoCreateWorkOrders: boolean;
}

interface SyncResult {
  syncLogId: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

async function loadJiraConfig(
  tenantId: string,
  configId: string,
): Promise<Result<{ id: string; config: JiraConfig; apiToken: string }, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'jira'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'JIRA integration config not found' });
  }

  const config = row.config as JiraConfig | null;
  if (!config?.host || !config?.email || !config?.encryptedApiToken) {
    return err({ code: 'VALIDATION', message: 'JIRA config is incomplete (missing host, email, or apiToken)' });
  }

  let apiToken: string;
  try {
    apiToken = decrypt(config.encryptedApiToken);
  } catch {
    return err({ code: 'INTERNAL', message: 'Failed to decrypt JIRA API token' });
  }

  return ok({ id: row.id, config, apiToken });
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
  // SELECT-before-INSERT to prevent duplicates (no unique constraint on table)
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

export async function connectJira(
  tenantId: string,
  configName: string,
  host: string,
  email: string,
  apiToken: string,
): Promise<Result<{ ok: true; configId: string; webhookSecret: string }, AppError>> {
  // Validate credentials by calling /myself
  try {
    await getMyself(host, email, apiToken);
  } catch (e) {
    const msg = e instanceof JiraApiError
      ? `JIRA credential validation failed (HTTP ${e.status})`
      : `JIRA credential validation failed: ${e instanceof Error ? e.message : String(e)}`;
    return err({ code: 'VALIDATION', message: msg });
  }

  const webhookSecret = randomBytes(32).toString('hex');
  let encryptedApiToken: string;
  try {
    encryptedApiToken = encrypt(apiToken);
  } catch (e) {
    return err({
      code: 'INTERNAL',
      message: `Failed to encrypt JIRA API token: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const config: JiraConfig = {
    host,
    email,
    encryptedApiToken,
    webhookSecret,
    autoCreateProjects: false,
    autoCreateWorkOrders: false,
  };

  const rows = await db
    .insert(integrationConfigs)
    .values({
      tenantId,
      integrationType: 'jira',
      name: configName,
      config,
      isActive: true,
    })
    .returning();

  const row = rows[0];
  if (!row) {
    return err({ code: 'INTERNAL', message: 'Failed to create JIRA integration config' });
  }

  return ok({ ok: true, configId: row.id, webhookSecret });
}

// ── Test Connection ────────────────────────────────────────────────

export async function testJiraConnection(
  tenantId: string,
  configId: string,
): Promise<Result<{ ok: true; accountId: string; displayName: string }, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<{ ok: true; accountId: string; displayName: string }, AppError>;

  const { config, apiToken } = configResult.value;

  try {
    const myself = await getMyself(config.host, config.email, apiToken);
    return ok({ ok: true, accountId: myself.accountId, displayName: myself.displayName });
  } catch (e) {
    const msg = e instanceof JiraApiError
      ? `JIRA connection test failed (HTTP ${e.status})`
      : `JIRA connection test failed: ${e instanceof Error ? e.message : String(e)}`;
    return err({ code: 'INTERNAL', message: msg });
  }
}

// ── Sync Projects ──────────────────────────────────────────────────

export async function syncJiraProjects(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config, apiToken } = configResult.value;
  let syncLogId: string;

  try {
    syncLogId = await createSyncLog(configId, 'projects');
  } catch (e) {
    return err({ code: 'INTERNAL', message: `Failed to create sync log: ${e instanceof Error ? e.message : String(e)}` });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      const page = await searchProjects(config.host, config.email, apiToken, startAt, maxResults);
      const projects = page.values ?? [];

      for (const jiraProject of projects) {
        try {
          const existingId = await findExternalMapping(
            tenantId, 'jira', 'jira_project', jiraProject.key, 'project',
          );

          if (!existingId && config.autoCreateProjects) {
            const numResult = await generateNumber(tenantId, 'project');
            const projectNumber = numResult.ok ? numResult.value : `JIRA-${jiraProject.key}`;

            const newRows = await db
              .insert(projectsMgmt)
              .values({
                tenantId,
                projectNumber,
                name: jiraProject.name,
                description: jiraProject.description ?? null,
                status: 'planning',
                isActive: true,
              })
              .returning();

            const newProject = newRows[0];
            if (newProject) {
              await insertKeyMapping(tenantId, 'jira', 'jira_project', jiraProject.key, 'project', newProject.id);
            }
          }

          processed++;
        } catch (e) {
          failed++;
          errors.push(`Project ${jiraProject.key}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      isLast = page.isLast || projects.length === 0;
      startAt += projects.length;

      if (projects.length < maxResults) break;
    }
  } catch (e) {
    failed++;
    errors.push(`API call failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncLog(syncLogId!, processed, failed, errors);
  return ok({ syncLogId: syncLogId!, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── Sync Issues ────────────────────────────────────────────────────

export async function syncJiraIssues(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config, apiToken } = configResult.value;
  let syncLogId: string;

  try {
    syncLogId = await createSyncLog(configId, 'issues');
  } catch (e) {
    return err({ code: 'INTERNAL', message: `Failed to create sync log: ${e instanceof Error ? e.message : String(e)}` });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Find all JIRA projects linked via externalKeyMappings
    const projectMappings = await db
      .select()
      .from(externalKeyMappings)
      .where(
        and(
          eq(externalKeyMappings.tenantId, tenantId),
          eq(externalKeyMappings.integrationType, 'jira'),
          eq(externalKeyMappings.externalSystem, 'jira_project'),
          eq(externalKeyMappings.internalEntityType, 'project'),
        ),
      );

    if (projectMappings.length === 0) {
      await completeSyncLog(syncLogId!, 0, 0, ['No JIRA projects mapped — run project sync first']);
      return ok({ syncLogId: syncLogId!, recordsProcessed: 0, recordsFailed: 0, errors: ['No JIRA projects mapped'] });
    }

    // Fetch issues for all linked JIRA projects
    const projectKeys = projectMappings.map((m) => m.externalId);
    const jql = `project in (${projectKeys.map((k) => `"${k}"`).join(',')}) ORDER BY created DESC`;

    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    while (hasMore) {
      const page = await searchIssues(config.host, config.email, apiToken, jql, startAt, maxResults);
      const issues = page.issues ?? [];

      for (const issue of issues) {
        try {
          const existingId = await findExternalMapping(
            tenantId, 'jira', 'jira_issue', issue.id, 'work_order',
          );

          if (!existingId && config.autoCreateWorkOrders) {
            const numResult = await generateNumber(tenantId, 'work_order');
            const workOrderNumber = numResult.ok ? numResult.value : `JIRA-${issue.key}`;

            const newRows = await db
              .insert(workOrders)
              .values({
                tenantId,
                workOrderNumber,
                title: issue.fields.summary,
                type: 'maintenance',
                priority: 'normal',
                status: 'open',
                isActive: true,
              })
              .returning();

            const newWO = newRows[0];
            if (newWO) {
              await insertKeyMapping(tenantId, 'jira', 'jira_issue', issue.id, 'work_order', newWO.id);
            }
          }

          processed++;
        } catch (e) {
          failed++;
          errors.push(`Issue ${issue.key}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      hasMore = issues.length === maxResults && startAt + issues.length < page.total;
      startAt += issues.length;

      if (issues.length === 0) break;
    }
  } catch (e) {
    failed++;
    errors.push(`API call failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncLog(syncLogId!, processed, failed, errors);
  return ok({ syncLogId: syncLogId!, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── Sync Worklogs ──────────────────────────────────────────────────

export async function syncJiraWorklogs(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config, apiToken } = configResult.value;
  let syncLogId: string;

  try {
    syncLogId = await createSyncLog(configId, 'worklogs');
  } catch (e) {
    return err({ code: 'INTERNAL', message: `Failed to create sync log: ${e instanceof Error ? e.message : String(e)}` });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Find all work orders linked via externalKeyMappings
    const workOrderMappings = await db
      .select()
      .from(externalKeyMappings)
      .where(
        and(
          eq(externalKeyMappings.tenantId, tenantId),
          eq(externalKeyMappings.integrationType, 'jira'),
          eq(externalKeyMappings.externalSystem, 'jira_issue'),
          eq(externalKeyMappings.internalEntityType, 'work_order'),
        ),
      );

    for (const mapping of workOrderMappings) {
      try {
        const worklogData = await getIssueWorklogs(config.host, config.email, apiToken, mapping.externalId);

        for (const worklog of worklogData.worklogs) {
          try {
            // Resolve JIRA accountId to DryDock employee via externalKeyMappings
            const employeeId = await findExternalMapping(
              tenantId, 'jira', 'jira_user', worklog.author.accountId, 'employee',
            );

            if (!employeeId) {
              // Write to error queue and continue — do NOT abort sync
              await writeErrorQueue(
                syncLogId!,
                worklog.id,
                'employee_not_found',
                `No DryDock employee mapped to JIRA accountId ${worklog.author.accountId} (${worklog.author.displayName})`,
                { worklog, issueId: mapping.externalId },
              );
              errors.push(`Worklog ${worklog.id}: employee not found for accountId ${worklog.author.accountId}`);
              failed++;
              continue;
            }

            // hoursWorked is stored as minutes (comment: "Stored as minutes, displayed as hours")
            const minutesWorked = Math.round(worklog.timeSpentSeconds / 60);
            const loggedDate = worklog.started.slice(0, 10); // YYYY-MM-DD

            // Upsert: check if this worklog is already recorded by looking for an exact match
            // No unique index on workOrderTimeLogs by jira worklog id, so we insert
            // (idempotency would require a dedicated externalId column — not in schema)
            await db.insert(workOrderTimeLogs).values({
              tenantId,
              workOrderId: mapping.internalEntityId,
              employeeId,
              loggedDate,
              hoursWorked: minutesWorked,
              notes: `JIRA worklog ${worklog.id} — ${worklog.author.displayName}`,
            });

            processed++;
          } catch (e) {
            failed++;
            errors.push(`Worklog ${worklog.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch (e) {
        failed++;
        errors.push(`Issue ${mapping.externalId} worklogs: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    failed++;
    errors.push(`Worklog sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncLog(syncLogId!, processed, failed, errors);
  return ok({ syncLogId: syncLogId!, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── Status Mappings ────────────────────────────────────────────────

const VALID_WORK_ORDER_STATUSES = new Set(['open', 'assigned', 'in_progress', 'completed', 'invoiced']);
const VALID_PROJECT_STATUSES = new Set(['planning', 'active', 'on_hold', 'completed', 'cancelled']);

export async function getStatusMappings(
  tenantId: string,
  configId: string,
): Promise<Result<unknown[], AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<unknown[], AppError>;

  const { config, apiToken } = configResult.value;

  // Fetch JIRA statuses for linked projects
  const projectMappings = await db
    .select()
    .from(externalKeyMappings)
    .where(
      and(
        eq(externalKeyMappings.tenantId, tenantId),
        eq(externalKeyMappings.integrationType, 'jira'),
        eq(externalKeyMappings.externalSystem, 'jira_project'),
        eq(externalKeyMappings.internalEntityType, 'project'),
      ),
    );

  const jiraStatuses: Map<string, { id: string; name: string; projectKey: string }> = new Map();

  for (const mapping of projectMappings.slice(0, 5)) {
    // Limit to 5 projects to avoid excessive API calls; use first project key
    try {
      // We store the JIRA project key as externalId — use it to fetch statuses
      const statuses = await getProjectStatuses(config.host, config.email, apiToken, mapping.externalId);
      for (const s of statuses) {
        if (!jiraStatuses.has(s.name)) {
          jiraStatuses.set(s.name, { id: s.id, name: s.name, projectKey: mapping.externalId });
        }
      }
    } catch {
      // continue on error
    }
  }

  // Fetch existing mappings
  const existingMappings = await db
    .select()
    .from(integrationFieldMappings)
    .where(
      and(
        eq(integrationFieldMappings.integrationConfigId, configId),
        eq(integrationFieldMappings.sourceField, 'jira_status'),
      ),
    );

  const result = Array.from(jiraStatuses.values()).map((jiraStatus) => {
    const woMapping = existingMappings.find(
      (m) => m.transformRule === jiraStatus.name && m.targetEntity === 'work_order',
    );
    const projMapping = existingMappings.find(
      (m) => m.transformRule === jiraStatus.name && m.targetEntity === 'project',
    );
    return {
      jiraStatusId: jiraStatus.id,
      jiraStatusName: jiraStatus.name,
      projectKey: jiraStatus.projectKey,
      workOrderMapping: woMapping ? { id: woMapping.id, drydockStatus: woMapping.targetField } : null,
      projectMapping: projMapping ? { id: projMapping.id, drydockStatus: projMapping.targetField } : null,
    };
  });

  return ok(result);
}

export async function setStatusMappings(
  tenantId: string,
  configId: string,
  mappings: Array<{ jiraStatus: string; drydockStatus: string; entityType: string }>,
): Promise<Result<void, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<void, AppError>;

  // Validate statuses
  for (const m of mappings) {
    if (m.entityType === 'work_order' && !VALID_WORK_ORDER_STATUSES.has(m.drydockStatus)) {
      return err({
        code: 'VALIDATION',
        message: `Invalid work_order status '${m.drydockStatus}'. Valid: ${Array.from(VALID_WORK_ORDER_STATUSES).join(', ')}`,
      });
    }
    if (m.entityType === 'project' && !VALID_PROJECT_STATUSES.has(m.drydockStatus)) {
      return err({
        code: 'VALIDATION',
        message: `Invalid project status '${m.drydockStatus}'. Valid: ${Array.from(VALID_PROJECT_STATUSES).join(', ')}`,
      });
    }
    if (m.entityType !== 'work_order' && m.entityType !== 'project') {
      return err({
        code: 'VALIDATION',
        message: `Unknown entityType '${m.entityType}'. Valid: work_order, project`,
      });
    }
  }

  for (const m of mappings) {
    // SELECT-before-INSERT/UPDATE pattern (no unique index on integrationFieldMappings)
    const existing = await db
      .select()
      .from(integrationFieldMappings)
      .where(
        and(
          eq(integrationFieldMappings.integrationConfigId, configId),
          eq(integrationFieldMappings.sourceField, 'jira_status'),
          eq(integrationFieldMappings.targetEntity, m.entityType),
          eq(integrationFieldMappings.transformRule, m.jiraStatus),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(integrationFieldMappings)
        .set({ targetField: m.drydockStatus })
        .where(eq(integrationFieldMappings.id, existing[0].id));
    } else {
      await db.insert(integrationFieldMappings).values({
        integrationConfigId: configId,
        sourceField: 'jira_status',
        targetEntity: m.entityType,
        targetField: m.drydockStatus,
        transformRule: m.jiraStatus,
        isActive: true,
      });
    }
  }

  return ok(undefined);
}

// ── Field Mappings ─────────────────────────────────────────────────

export async function getFieldMappings(
  tenantId: string,
  configId: string,
): Promise<Result<unknown[], AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<unknown[], AppError>;

  const rows = await db
    .select()
    .from(integrationFieldMappings)
    .where(eq(integrationFieldMappings.integrationConfigId, configId));

  return ok(
    rows.map((r) => ({
      id: r.id,
      sourceField: r.sourceField,
      targetEntity: r.targetEntity,
      targetField: r.targetField,
      transformRule: r.transformRule,
      isActive: r.isActive,
    })),
  );
}

export async function setFieldMappings(
  tenantId: string,
  configId: string,
  mappings: Array<{ sourceField: string; targetEntity: string; targetField: string; transformRule?: string }>,
): Promise<Result<void, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<void, AppError>;

  for (const m of mappings) {
    const existing = await db
      .select()
      .from(integrationFieldMappings)
      .where(
        and(
          eq(integrationFieldMappings.integrationConfigId, configId),
          eq(integrationFieldMappings.sourceField, m.sourceField),
          eq(integrationFieldMappings.targetEntity, m.targetEntity),
          eq(integrationFieldMappings.targetField, m.targetField),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(integrationFieldMappings)
        .set({ transformRule: m.transformRule ?? null })
        .where(eq(integrationFieldMappings.id, existing[0].id));
    } else {
      await db.insert(integrationFieldMappings).values({
        integrationConfigId: configId,
        sourceField: m.sourceField,
        targetEntity: m.targetEntity,
        targetField: m.targetField,
        transformRule: m.transformRule ?? null,
        isActive: true,
      });
    }
  }

  return ok(undefined);
}

// ── Webhook Processing ─────────────────────────────────────────────

export async function loadWebhookConfig(configId: string): Promise<Result<JiraConfig, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.integrationType, 'jira'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'JIRA integration config not found' });
  }

  const config = row.config as JiraConfig | null;
  if (!config?.webhookSecret) {
    return err({ code: 'VALIDATION', message: 'JIRA config missing webhookSecret' });
  }

  return ok(config);
}

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: {
    id: string;
    key: string;
    fields?: {
      status?: { name: string };
      summary?: string;
    };
  };
  worklog?: {
    id: string;
    issueId: string;
    author: { accountId: string; displayName: string };
    started: string;
    timeSpentSeconds: number;
    comment?: unknown;
  };
}

export async function processJiraWebhook(
  configId: string,
  payload: JiraWebhookPayload,
): Promise<Result<void, AppError>> {
  const configResult = await loadWebhookConfig(configId);
  if (!configResult.ok) return configResult as Result<void, AppError>;

  const tenantId = await getTenantIdForConfig(configId);
  if (!tenantId) {
    return err({ code: 'NOT_FOUND', message: 'Tenant not found for config' });
  }

  const event = payload.webhookEvent;

  try {
    if (event === 'jira:issue_created' || event === 'jira:issue_updated') {
      await handleIssueEvent(configId, tenantId, payload);
    } else if (event === 'worklog_updated') {
      await handleWorklogEvent(configId, tenantId, payload);
    }
    // Unknown events are silently ignored — return 200 per spec
  } catch (e) {
    // Write to error queue rather than returning 5xx
    const logRows = await db
      .insert(integrationSyncLogs)
      .values({ integrationConfigId: configId, syncType: 'webhook', status: 'running' })
      .returning();
    const logId = logRows[0]?.id;
    if (logId) {
      await writeErrorQueue(logId, event ?? 'unknown', 'webhook_error',
        e instanceof Error ? e.message : String(e), payload);
      await completeSyncLog(logId, 0, 1, [e instanceof Error ? e.message : String(e)]);
    }
  }

  return ok(undefined);
}

async function getTenantIdForConfig(configId: string): Promise<string | null> {
  const rows = await db
    .select({ tenantId: integrationConfigs.tenantId })
    .from(integrationConfigs)
    .where(eq(integrationConfigs.id, configId))
    .limit(1);
  return rows[0]?.tenantId ?? null;
}

async function handleIssueEvent(
  configId: string,
  tenantId: string,
  payload: JiraWebhookPayload,
): Promise<void> {
  const issue = payload.issue;
  if (!issue?.id || !issue?.fields?.status?.name) return;

  const workOrderId = await findExternalMapping(
    tenantId, 'jira', 'jira_issue', issue.id, 'work_order',
  );
  if (!workOrderId) return; // Not a tracked issue

  // Look up status mapping
  const jiraStatusName = issue.fields.status.name;
  const mappingRows = await db
    .select()
    .from(integrationFieldMappings)
    .where(
      and(
        eq(integrationFieldMappings.integrationConfigId, configId),
        eq(integrationFieldMappings.sourceField, 'jira_status'),
        eq(integrationFieldMappings.targetEntity, 'work_order'),
        eq(integrationFieldMappings.transformRule, jiraStatusName),
      ),
    )
    .limit(1);

  const mapping = mappingRows[0];
  if (!mapping) return; // No mapping configured

  const newStatus = mapping.targetField as 'open' | 'assigned' | 'in_progress' | 'completed' | 'invoiced';
  if (!VALID_WORK_ORDER_STATUSES.has(newStatus)) return;

  await db
    .update(workOrders)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)));
}

async function handleWorklogEvent(
  configId: string,
  tenantId: string,
  payload: JiraWebhookPayload,
): Promise<void> {
  const worklog = payload.worklog;
  if (!worklog?.id || !worklog?.issueId) return;

  const workOrderId = await findExternalMapping(
    tenantId, 'jira', 'jira_issue', worklog.issueId, 'work_order',
  );
  if (!workOrderId) return;

  const employeeId = await findExternalMapping(
    tenantId, 'jira', 'jira_user', worklog.author.accountId, 'employee',
  );

  if (!employeeId) {
    // No employee mapping — log and skip
    const logRows = await db
      .insert(integrationSyncLogs)
      .values({ integrationConfigId: configId, syncType: 'webhook', status: 'running' })
      .returning();
    const logId = logRows[0]?.id;
    if (logId) {
      await writeErrorQueue(logId, worklog.id, 'employee_not_found',
        `No DryDock employee mapped to JIRA accountId ${worklog.author.accountId}`, { worklog });
      await completeSyncLog(logId, 0, 1, [`Employee not found for ${worklog.author.accountId}`]);
    }
    return;
  }

  const minutesWorked = Math.round(worklog.timeSpentSeconds / 60);
  const loggedDate = worklog.started.slice(0, 10);

  await db.insert(workOrderTimeLogs).values({
    tenantId,
    workOrderId,
    employeeId,
    loggedDate,
    hoursWorked: minutesWorked,
    notes: `JIRA worklog ${worklog.id} (webhook) — ${worklog.author.displayName}`,
  });
}

// ── Sync Logs ──────────────────────────────────────────────────────

export async function getJiraSyncLogs(
  tenantId: string,
  configId: string,
  page: number,
  pageSize: number,
): Promise<Result<{ data: unknown[]; total: number }, AppError>> {
  const configResult = await loadJiraConfig(tenantId, configId);
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
