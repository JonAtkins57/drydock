import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Queue-based DB mock (matches existing test pattern) ─────────
const queryQueue: unknown[] = [];
const mockSet = vi.fn();

function enqueue(...values: unknown[]) {
  queryQueue.push(...values);
}

function dequeue(): unknown {
  return queryQueue.shift();
}

function chainable(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  const methods = ['from', 'where', 'limit', 'orderBy', 'offset', 'returning', 'values'];
  for (const m of methods) {
    self[m] = (..._args: unknown[]) => chainable();
  }
  self['then'] = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    try {
      resolve(dequeue());
    } catch (e) {
      reject(e);
    }
  };
  return self;
}

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () => dequeue(),
      }),
    }),
    select: () => ({
      from: () => chainable(),
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mockSet(...args);
        return chainable();
      },
    }),
    execute: () => dequeue(),
  },
  pool: { connect: vi.fn() },
}));

vi.mock('../../src/db/schema/index.js', () => ({}));
vi.mock('../../src/db/schema/integration.js', () => ({
  integrationConfigs: {
    id: 'id', tenantId: 'tenant_id', integrationType: 'integration_type', isActive: 'is_active', config: 'config',
  },
  integrationSyncLogs: {
    id: 'id', integrationConfigId: 'integration_config_id', syncType: 'sync_type',
    status: 'status', startedAt: 'started_at', completedAt: 'completed_at',
    recordsProcessed: 'records_processed', recordsFailed: 'records_failed', errorDetails: 'error_details',
  },
  externalKeyMappings: {
    id: 'id', tenantId: 'tenant_id', integrationType: 'integration_type',
    externalSystem: 'external_system', externalId: 'external_id',
    internalEntityType: 'internal_entity_type', internalEntityId: 'internal_entity_id',
  },
}));

vi.mock('../../src/db/schema/master.js', () => ({
  employees: {
    id: 'id', tenantId: 'tenant_id', employeeNumber: 'employee_number',
    firstName: 'first_name', lastName: 'last_name', email: 'email',
    departmentId: 'department_id', managerId: 'manager_id', bamboohrId: 'bamboohr_id',
    hireDate: 'hire_date', terminationDate: 'termination_date', status: 'status',
    isActive: 'is_active', userId: 'user_id', updatedAt: 'updated_at',
    createdAt: 'created_at', createdBy: 'created_by', updatedBy: 'updated_by',
  },
  departments: {
    id: 'id', tenantId: 'tenant_id', name: 'name', code: 'code',
    isActive: 'is_active', updatedAt: 'updated_at',
  },
}));

vi.mock('../../src/db/schema/core.js', () => ({
  users: {
    id: 'id', tenantId: 'tenant_id', isActive: 'is_active', updatedAt: 'updated_at',
  },
}));

// ── Mock BambooHR client ────────────────────────────────────────
const mockGetEmployees = vi.fn();
const mockGetDepartments = vi.fn();

vi.mock('../../src/integration/bamboohr.client.js', () => ({
  getEmployees: (...args: unknown[]) => mockGetEmployees(...args),
  getDepartments: (...args: unknown[]) => mockGetDepartments(...args),
}));

import {
  syncEmployees,
  syncDepartments,
  syncManagerHierarchy,
  handleTermination,
  createSyncJob,
  completeSyncJob,
} from '../../src/integration/bamboohr.service.js';

const TENANT = '550e8400-e29b-41d4-a716-446655440001';
const CONFIG_ID = '550e8400-e29b-41d4-a716-446655440099';

const VALID_CONFIG_ROW = {
  id: CONFIG_ID,
  tenantId: TENANT,
  integrationType: 'bamboohr',
  name: 'BambooHR Test',
  config: { subdomain: 'testco', apiKey: 'test-api-key' },
  isActive: true,
};

describe('BambooHR Service', () => {
  beforeEach(() => {
    queryQueue.length = 0;
    mockSet.mockClear();
    mockGetEmployees.mockReset();
    mockGetDepartments.mockReset();
  });

  describe('createSyncJob', () => {
    it('creates a sync log and returns ID', async () => {
      enqueue([VALID_CONFIG_ROW]); // getIntegrationConfig
      enqueue([{ id: 'sync-log-1' }]); // insert sync log

      const result = await createSyncJob(TENANT, CONFIG_ID, 'employees');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('sync-log-1');
    });

    it('returns NOT_FOUND when config missing', async () => {
      enqueue([]); // no config found

      const result = await createSyncJob(TENANT, CONFIG_ID, 'employees');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('completeSyncJob', () => {
    it('marks sync job as completed', async () => {
      enqueue([{ id: 'sync-log-1', status: 'completed' }]); // update returning

      const result = await completeSyncJob('sync-log-1', 10, 0);
      expect(result.ok).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          recordsProcessed: 10,
          recordsFailed: 0,
        }),
      );
    });

    it('marks as completed_with_errors when failures exist', async () => {
      enqueue([{ id: 'sync-log-1', status: 'completed_with_errors' }]);

      const result = await completeSyncJob('sync-log-1', 8, 2, ['err1', 'err2']);
      expect(result.ok).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed_with_errors',
          recordsFailed: 2,
        }),
      );
    });
  });

  describe('syncEmployees', () => {
    it('syncs employees from BambooHR, inserts new records', async () => {
      // getIntegrationConfig
      enqueue([VALID_CONFIG_ROW]);
      // createSyncJob -> getIntegrationConfig again
      enqueue([VALID_CONFIG_ROW]);
      // insert sync log
      enqueue([{ id: 'sync-log-emp' }]);

      mockGetEmployees.mockResolvedValue([
        {
          id: '101',
          displayName: 'Jane Doe',
          firstName: 'Jane',
          lastName: 'Doe',
          workEmail: 'jane@test.com',
          department: 'Engineering',
          jobTitle: 'Engineer',
          supervisorId: null,
          hireDate: '2024-01-15',
          terminationDate: null,
          status: 'Active',
          employeeNumber: 'E001',
        },
      ]);

      // For each employee:
      // findInternalId (employee) — no existing
      enqueue([]);
      // findInternalId (department) — no dept mapped
      enqueue([]);
      // insert employee returning
      enqueue([{ id: 'emp-uuid-1' }]);
      // upsertKeyMapping — findInternalId check
      enqueue([]);
      // insert key mapping
      enqueue([{ id: 'km-1' }]);

      // completeSyncJob update
      enqueue([{ id: 'sync-log-emp', status: 'completed' }]);

      const result = await syncEmployees(TENANT, CONFIG_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recordsProcessed).toBe(1);
        expect(result.value.recordsFailed).toBe(0);
      }
      expect(mockGetEmployees).toHaveBeenCalledWith('testco', 'test-api-key');
    });

    it('returns NOT_FOUND when config is missing', async () => {
      enqueue([]); // no config

      const result = await syncEmployees(TENANT, CONFIG_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('syncDepartments', () => {
    it('syncs departments from BambooHR', async () => {
      // getIntegrationConfig
      enqueue([VALID_CONFIG_ROW]);
      // createSyncJob -> getIntegrationConfig
      enqueue([VALID_CONFIG_ROW]);
      // insert sync log
      enqueue([{ id: 'sync-log-dept' }]);

      mockGetDepartments.mockResolvedValue([
        { id: 'Engineering', name: 'Engineering', parentId: null },
        { id: 'Sales', name: 'Sales', parentId: null },
      ]);

      // Dept 1: findInternalId — no existing
      enqueue([]);
      // insert dept
      enqueue([{ id: 'dept-uuid-1' }]);
      // upsertKeyMapping check
      enqueue([]);
      // insert mapping
      enqueue([{ id: 'km-d1' }]);

      // Dept 2: findInternalId — no existing
      enqueue([]);
      // insert dept
      enqueue([{ id: 'dept-uuid-2' }]);
      // upsertKeyMapping check
      enqueue([]);
      // insert mapping
      enqueue([{ id: 'km-d2' }]);

      // completeSyncJob update
      enqueue([{ id: 'sync-log-dept', status: 'completed' }]);

      const result = await syncDepartments(TENANT, CONFIG_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recordsProcessed).toBe(2);
        expect(result.value.recordsFailed).toBe(0);
      }
    });
  });

  describe('syncManagerHierarchy', () => {
    it('updates manager_id relationships', async () => {
      // getIntegrationConfig
      enqueue([VALID_CONFIG_ROW]);
      // createSyncJob -> getIntegrationConfig
      enqueue([VALID_CONFIG_ROW]);
      // insert sync log
      enqueue([{ id: 'sync-log-mgr' }]);

      mockGetEmployees.mockResolvedValue([
        {
          id: '101',
          displayName: 'Jane Doe',
          firstName: 'Jane',
          lastName: 'Doe',
          workEmail: 'jane@test.com',
          department: 'Engineering',
          jobTitle: 'Engineer',
          supervisorId: '100',
          hireDate: '2024-01-15',
          terminationDate: null,
          status: 'Active',
          employeeNumber: 'E001',
        },
      ]);

      // findInternalId for employee 101
      enqueue([{ internalEntityId: 'emp-uuid-101' }]);
      // findInternalId for manager 100
      enqueue([{ internalEntityId: 'emp-uuid-100' }]);
      // update employee set managerId
      enqueue([{ id: 'emp-uuid-101' }]);

      // completeSyncJob
      enqueue([{ id: 'sync-log-mgr', status: 'completed' }]);

      const result = await syncManagerHierarchy(TENANT, CONFIG_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recordsProcessed).toBe(1);
        expect(result.value.recordsFailed).toBe(0);
      }
    });
  });

  describe('handleTermination', () => {
    it('deactivates employee and linked user', async () => {
      const empId = '550e8400-e29b-41d4-a716-446655440050';
      const userId = '550e8400-e29b-41d4-a716-446655440060';

      // update employee returning
      enqueue([{ id: empId, userId, status: 'terminated', isActive: false }]);
      // update user
      enqueue([{ id: userId, isActive: false }]);

      const result = await handleTermination(TENANT, empId);
      expect(result.ok).toBe(true);
    });

    it('returns NOT_FOUND for missing employee', async () => {
      enqueue([]); // no match

      const result = await handleTermination(TENANT, 'missing-id');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});
