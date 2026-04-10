import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ── Mock chain builder ──────────────────────────────────────────────
// Each call to db.select/insert/update returns a fresh chain.
// Tests push return values into queues that the chain consumes.
const selectResults: unknown[][] = [];
const insertResults: unknown[][] = [];
const insertValuesSpy = vi.fn();

function makeThenableWithLimit(rows: unknown[]) {
  // Object that is both thenable (so `await` returns rows) and has .limit()
  const obj = {
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(rows).then(resolve, reject);
    },
    limit: () => {
      // .limit() returns a thenable that resolves to the same rows
      return {
        then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
    },
  };
  return obj;
}

function makeSelectChain(results: unknown[][]): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.from = () => chain;
  chain.where = () => makeThenableWithLimit(results.shift() ?? []);
  chain.limit = () => ({
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(results.shift() ?? []).then(resolve, reject);
    },
  });
  return chain as Record<string, unknown>;
}

function makeInsertChain(results: unknown[][]): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.values = (...args: unknown[]) => {
    insertValuesSpy(...args);
    return chain;
  };
  chain.returning = () => {
    const rows = results.shift() ?? [];
    return {
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) => {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
  };
  return chain as Record<string, unknown>;
}

function makeUpdateChain(): Record<string, unknown> {
  const thenable = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(undefined).then(resolve, reject);
    },
  };
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.set = () => chain;
  chain.where = () => thenable;
  return chain as Record<string, unknown>;
}

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: () => makeSelectChain(selectResults),
    insert: () => makeInsertChain(insertResults),
    update: () => makeUpdateChain(),
  },
  pool: { connect: vi.fn() },
}));

vi.mock('../../src/db/schema/index.js', () => ({
  users: { id: 'id', tenantId: 'tenant_id', email: 'email', passwordHash: 'password_hash', firstName: 'first_name', lastName: 'last_name', isActive: 'is_active', lastLogin: 'last_login', createdAt: 'created_at' },
  roles: { id: 'id', permissions: 'permissions' },
  userRoles: { userId: 'user_id', roleId: 'role_id' },
}));

vi.mock('../../src/db/schema/audit.js', () => ({
  auditLog: { userId: 'user_id', entityType: 'entity_type', entityId: 'entity_id', action: 'action' },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: vi.fn(),
}));

// Set env before imports
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars-long';

import bcrypt from 'bcrypt';
import {
  register,
  login,
  refreshToken,
  checkPermission,
  getUserPermissions,
  checkSegregationOfDuties,
} from '../../src/core/auth.service.js';
import type { JwtPayload } from '../../src/core/auth.service.js';

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    insertResults.length = 0;
    insertValuesSpy.mockClear();
  });

  describe('register', () => {
    it('creates user with hashed password', async () => {
      const fakeUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
      };

      // 1st select: check existing user — none found
      selectResults.push([]);
      // insert returning
      insertResults.push([fakeUser]);
      // audit insert returning (logAction does insert too)
      insertResults.push([]);

      const result = await register(
        fakeUser.tenantId,
        fakeUser.email,
        'SecurePass123!',
        fakeUser.firstName,
        fakeUser.lastName,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email).toBe('test@example.com');
        expect(result.value.firstName).toBe('Test');
      }

      // Verify password was hashed
      const insertedValues = insertValuesSpy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      if (insertedValues) {
        expect(insertedValues.passwordHash).not.toBe('SecurePass123!');
        const isHashed = await bcrypt.compare('SecurePass123!', insertedValues.passwordHash as string);
        expect(isHashed).toBe(true);
      }
    });

    it('rejects duplicate email within same tenant', async () => {
      // select finds existing user
      selectResults.push([{ id: 'existing-id' }]);

      const result = await register(
        '550e8400-e29b-41d4-a716-446655440001',
        'dupe@example.com',
        'SecurePass123!',
        'Dupe',
        'User',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('login', () => {
    it('returns valid JWT on correct credentials', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword1!', 10);

      // select user by email
      selectResults.push([{
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        email: 'login@example.com',
        passwordHash,
        firstName: 'Login',
        lastName: 'User',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
      }]);

      const result = await login('login@example.com', 'CorrectPassword1!');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBeDefined();
        expect(result.value.refreshToken).toBeDefined();
        expect(result.value.expiresIn).toBe(900);

        const decoded = jwt.verify(result.value.accessToken, process.env.JWT_SECRET!) as JwtPayload;
        expect(decoded.sub).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(decoded.tenantId).toBe('550e8400-e29b-41d4-a716-446655440001');
        expect(decoded.email).toBe('login@example.com');
      }
    });

    it('rejects invalid credentials', async () => {
      selectResults.push([]);

      const result = await login('nobody@example.com', 'WrongPass1!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects deactivated users', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword1!', 10);

      selectResults.push([{
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        email: 'inactive@example.com',
        passwordHash,
        firstName: 'Inactive',
        lastName: 'User',
        isActive: false,
        lastLogin: null,
        createdAt: new Date(),
      }]);

      const result = await login('inactive@example.com', 'CorrectPassword1!');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('refreshToken', () => {
    it('issues new access token from valid refresh token', async () => {
      const token = jwt.sign(
        { sub: '550e8400-e29b-41d4-a716-446655440000', type: 'refresh' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '7d' },
      );

      selectResults.push([{
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: '550e8400-e29b-41d4-a716-446655440001',
        email: 'refresh@example.com',
        passwordHash: 'hashed',
        firstName: 'Refresh',
        lastName: 'User',
        isActive: true,
        lastLogin: null,
        createdAt: new Date(),
      }]);

      const result = await refreshToken(token);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBeDefined();
        expect(result.value.refreshToken).toBeDefined();
      }
    });

    it('rejects expired refresh token', async () => {
      const token = jwt.sign(
        { sub: '550e8400-e29b-41d4-a716-446655440000', type: 'refresh' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await refreshToken(token);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('permission checking', () => {
    it('returns permissions from user roles', async () => {
      // getUserPermissions: select userRoles where userId = ...
      selectResults.push([
        { roleId: 'role-1' },
        { roleId: 'role-2' },
      ]);

      // Then queries each role for permissions (each goes through where().limit())
      selectResults.push([{ permissions: ['gl.journal.create', 'gl.journal.read'] }]);
      selectResults.push([{ permissions: ['gl.journal.approve', 'gl.journal.read'] }]);

      const result = await getUserPermissions('user-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('gl.journal.create');
        expect(result.value).toContain('gl.journal.approve');
        expect(result.value).toContain('gl.journal.read');
        // Deduplication
        expect(result.value.filter((p) => p === 'gl.journal.read').length).toBe(1);
      }
    });

    it('checkPermission returns true for held permission', async () => {
      selectResults.push([{ roleId: 'role-1' }]);
      selectResults.push([{ permissions: ['gl.journal.create'] }]);

      const result = await checkPermission('user-1', 'gl.journal.create');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('checkPermission returns false for missing permission', async () => {
      selectResults.push([{ roleId: 'role-1' }]);
      selectResults.push([{ permissions: ['gl.journal.read'] }]);

      const result = await checkPermission('user-1', 'gl.journal.approve');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('wildcard permission grants access to everything', async () => {
      selectResults.push([{ roleId: 'role-admin' }]);
      selectResults.push([{ permissions: ['*'] }]);

      const result = await checkPermission('admin-user', 'any.permission.here');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe('segregation of duties', () => {
    it('blocks user from approving their own creation', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';

      // select from auditLog where entityType + entityId + action
      selectResults.push([{ userId }]);

      const result = await checkSegregationOfDuties(
        userId,
        'journal_entry',
        'entity-123',
        'approve',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('allows different user to approve', async () => {
      selectResults.push([{ userId: 'creator-user-id' }]);

      const result = await checkSegregationOfDuties(
        'approver-user-id',
        'journal_entry',
        'entity-123',
        'approve',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('allows action when no creation audit record exists', async () => {
      selectResults.push([]);

      const result = await checkSegregationOfDuties(
        'any-user',
        'journal_entry',
        'entity-123',
        'approve',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });
});
