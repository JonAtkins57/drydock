/**
 * BambooHR Integration Service
 *
 * Syncs employees, departments, and manager hierarchies from BambooHR
 * into drydock_master tables, tracking via external_key_mappings.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  integrationConfigs,
  integrationSyncLogs,
  externalKeyMappings,
} from '../db/schema/integration.js';
import { employees, departments } from '../db/schema/master.js';
import { users } from '../db/schema/core.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import {
  getEmployees as fetchBambooEmployees,
  getDepartments as fetchBambooDepartments,
  type BambooEmployee,
} from './bamboohr.client.js';

// ── Types ──────────────────────────────────────────────────────────

interface BambooHRConfig {
  subdomain: string;
  apiKey: string;
}

interface SyncResult {
  syncLogId: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────

async function getIntegrationConfig(
  tenantId: string,
  configId: string,
): Promise<Result<{ id: string; config: BambooHRConfig }, AppError>> {
  const rows = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.id, configId),
        eq(integrationConfigs.tenantId, tenantId),
        eq(integrationConfigs.integrationType, 'bamboohr'),
        eq(integrationConfigs.isActive, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return err({ code: 'NOT_FOUND', message: 'BambooHR integration config not found' });
  }

  const config = row.config as BambooHRConfig | null;
  if (!config?.subdomain || !config?.apiKey) {
    return err({ code: 'VALIDATION', message: 'BambooHR config missing subdomain or apiKey' });
  }

  return ok({ id: row.id, config });
}

async function findInternalId(
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
        eq(externalKeyMappings.integrationType, 'bamboohr'),
        eq(externalKeyMappings.externalSystem, 'bamboohr'),
        eq(externalKeyMappings.externalId, externalId),
        eq(externalKeyMappings.internalEntityType, entityType),
      ),
    )
    .limit(1);

  return rows[0]?.internalEntityId ?? null;
}

async function upsertKeyMapping(
  tenantId: string,
  externalId: string,
  entityType: string,
  internalId: string,
): Promise<void> {
  const existing = await findInternalId(tenantId, externalId, entityType);
  if (existing) return; // already mapped

  await db.insert(externalKeyMappings).values({
    tenantId,
    integrationType: 'bamboohr',
    externalSystem: 'bamboohr',
    externalId,
    internalEntityType: entityType,
    internalEntityId: internalId,
  });
}

// ── Sync Job Lifecycle ─────────────────────────────────────────────

export async function createSyncJob(
  tenantId: string,
  configId: string,
  syncType: string,
): Promise<Result<string, AppError>> {
  // Validate config exists
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<string, AppError>;

  const rows = await db
    .insert(integrationSyncLogs)
    .values({
      integrationConfigId: configId,
      syncType,
      status: 'running',
    })
    .returning();

  const row = rows[0];
  if (!row) return err({ code: 'INTERNAL', message: 'Failed to create sync log' });
  return ok(row.id);
}

export async function completeSyncJob(
  logId: string,
  recordsProcessed: number,
  recordsFailed: number,
  errors?: string[],
): Promise<Result<void, AppError>> {
  const rows = await db
    .update(integrationSyncLogs)
    .set({
      completedAt: new Date(),
      status: recordsFailed > 0 ? 'completed_with_errors' : 'completed',
      recordsProcessed,
      recordsFailed,
      errorDetails: errors?.length ? { errors } : null,
    })
    .where(eq(integrationSyncLogs.id, logId))
    .returning();

  if (!rows[0]) return err({ code: 'NOT_FOUND', message: 'Sync log not found' });
  return ok(undefined);
}

// ── syncEmployees ──────────────────────────────────────────────────

export async function syncEmployees(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config } = configResult.value;

  const logResult = await createSyncJob(tenantId, configId, 'employees');
  if (!logResult.ok) return logResult as Result<SyncResult, AppError>;
  const syncLogId = logResult.value;

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const bambooEmployees = await fetchBambooEmployees(config.subdomain, config.apiKey);

    for (const bEmp of bambooEmployees) {
      try {
        await upsertEmployee(tenantId, bEmp);
        processed++;
      } catch (e) {
        failed++;
        errors.push(`Employee ${bEmp.id} (${bEmp.displayName}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    failed++;
    errors.push(`API call failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncJob(syncLogId, processed, failed, errors);
  return ok({ syncLogId, recordsProcessed: processed, recordsFailed: failed, errors });
}

async function upsertEmployee(tenantId: string, bEmp: BambooEmployee): Promise<void> {
  const existingId = await findInternalId(tenantId, bEmp.id, 'employee');

  // Resolve department if present
  let departmentId: string | null = null;
  if (bEmp.department) {
    departmentId = await findInternalId(tenantId, bEmp.department, 'department');
  }

  const data = {
    tenantId,
    firstName: bEmp.firstName,
    lastName: bEmp.lastName,
    email: bEmp.workEmail || `${bEmp.firstName.toLowerCase()}.${bEmp.lastName.toLowerCase()}@unknown.local`,
    employeeNumber: bEmp.employeeNumber || `BHR-${bEmp.id}`,
    departmentId,
    bamboohrId: bEmp.id,
    hireDate: bEmp.hireDate ? new Date(bEmp.hireDate) : null,
    terminationDate: bEmp.terminationDate ? new Date(bEmp.terminationDate) : null,
    status: bEmp.status === 'Active' ? 'active' : 'inactive',
    isActive: bEmp.status === 'Active',
    updatedAt: new Date(),
  };

  if (existingId) {
    await db
      .update(employees)
      .set(data)
      .where(and(eq(employees.id, existingId), eq(employees.tenantId, tenantId)));
  } else {
    const rows = await db
      .insert(employees)
      .values(data)
      .returning();

    const row = rows[0];
    if (row) {
      await upsertKeyMapping(tenantId, bEmp.id, 'employee', row.id);
    }
  }
}

// ── syncDepartments ────────────────────────────────────────────────

export async function syncDepartments(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config } = configResult.value;

  const logResult = await createSyncJob(tenantId, configId, 'departments');
  if (!logResult.ok) return logResult as Result<SyncResult, AppError>;
  const syncLogId = logResult.value;

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const bambooDepts = await fetchBambooDepartments(config.subdomain, config.apiKey);

    for (const bDept of bambooDepts) {
      try {
        const existingId = await findInternalId(tenantId, bDept.id, 'department');

        const data = {
          tenantId,
          name: bDept.name,
          code: bDept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20),
          isActive: true,
          updatedAt: new Date(),
        };

        if (existingId) {
          await db
            .update(departments)
            .set(data)
            .where(and(eq(departments.id, existingId), eq(departments.tenantId, tenantId)));
        } else {
          const rows = await db
            .insert(departments)
            .values(data)
            .returning();
          const row = rows[0];
          if (row) {
            await upsertKeyMapping(tenantId, bDept.id, 'department', row.id);
          }
        }
        processed++;
      } catch (e) {
        failed++;
        errors.push(`Department ${bDept.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    failed++;
    errors.push(`API call failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncJob(syncLogId, processed, failed, errors);
  return ok({ syncLogId, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── syncManagerHierarchy ───────────────────────────────────────────

export async function syncManagerHierarchy(
  tenantId: string,
  configId: string,
): Promise<Result<SyncResult, AppError>> {
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<SyncResult, AppError>;

  const { config } = configResult.value;

  const logResult = await createSyncJob(tenantId, configId, 'manager_hierarchy');
  if (!logResult.ok) return logResult as Result<SyncResult, AppError>;
  const syncLogId = logResult.value;

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    const bambooEmployees = await fetchBambooEmployees(config.subdomain, config.apiKey);

    for (const bEmp of bambooEmployees) {
      if (!bEmp.supervisorId) continue;

      try {
        const empId = await findInternalId(tenantId, bEmp.id, 'employee');
        const managerId = await findInternalId(tenantId, bEmp.supervisorId, 'employee');

        if (empId && managerId) {
          await db
            .update(employees)
            .set({ managerId, updatedAt: new Date() })
            .where(and(eq(employees.id, empId), eq(employees.tenantId, tenantId)));
          processed++;
        } else {
          failed++;
          errors.push(
            `Employee ${bEmp.id}: could not resolve ${!empId ? 'employee' : 'manager'} mapping`,
          );
        }
      } catch (e) {
        failed++;
        errors.push(`Employee ${bEmp.id} hierarchy: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    failed++;
    errors.push(`API call failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  await completeSyncJob(syncLogId, processed, failed, errors);
  return ok({ syncLogId, recordsProcessed: processed, recordsFailed: failed, errors });
}

// ── handleTermination ──────────────────────────────────────────────

export async function handleTermination(
  tenantId: string,
  employeeId: string,
): Promise<Result<void, AppError>> {
  // Deactivate employee record
  const empRows = await db
    .update(employees)
    .set({
      status: 'terminated',
      isActive: false,
      terminationDate: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    .returning();

  if (!empRows[0]) {
    return err({ code: 'NOT_FOUND', message: 'Employee not found' });
  }

  // Deactivate linked user if present
  const emp = empRows[0];
  if (emp.userId) {
    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(users.id, emp.userId), eq(users.tenantId, tenantId)));
  }

  return ok(undefined);
}

// ── Query helpers for routes ───────────────────────────────────────

export async function getLastSyncStatus(
  tenantId: string,
  configId: string,
): Promise<Result<unknown, AppError>> {
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult;

  const rows = await db
    .select()
    .from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.integrationConfigId, configId))
    .orderBy(integrationSyncLogs.startedAt)
    .limit(1);

  const row = rows[0];
  if (!row) {
    return ok({ status: 'never_synced', lastSync: null });
  }

  return ok({
    status: row.status,
    syncType: row.syncType,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    recordsProcessed: row.recordsProcessed,
    recordsFailed: row.recordsFailed,
    errorDetails: row.errorDetails,
  });
}

export async function getSyncLogs(
  tenantId: string,
  configId: string,
  limit = 25,
): Promise<Result<unknown[], AppError>> {
  const configResult = await getIntegrationConfig(tenantId, configId);
  if (!configResult.ok) return configResult as Result<unknown[], AppError>;

  const rows = await db
    .select()
    .from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.integrationConfigId, configId))
    .orderBy(integrationSyncLogs.startedAt)
    .limit(limit);

  return ok(
    rows.map((r) => ({
      id: r.id,
      syncType: r.syncType,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      recordsProcessed: r.recordsProcessed,
      recordsFailed: r.recordsFailed,
      errorDetails: r.errorDetails,
    })),
  );
}
