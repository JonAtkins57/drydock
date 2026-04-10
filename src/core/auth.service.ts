import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, roles, userRoles } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';
import { logAction } from './audit.service.js';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
  return secret;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
}

// ── Register ────────────────────────────────────────────────────────
export async function register(
  tenantId: string,
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<Result<UserRecord, AppError>> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, email)))
    .limit(1);

  if (existing.length > 0) {
    return err({ code: 'CONFLICT', message: 'Email already registered for this tenant' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [inserted] = await db
    .insert(users)
    .values({
      tenantId,
      email,
      passwordHash,
      firstName,
      lastName,
    })
    .returning({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    });

  if (!inserted) {
    return err({ code: 'INTERNAL', message: 'Failed to create user' });
  }

  await logAction({
    tenantId,
    userId: inserted.id,
    action: 'user.register',
    entityType: 'user',
    entityId: inserted.id,
  });

  return ok(inserted);
}

// ── Login ───────────────────────────────────────────────────────────
export async function login(
  email: string,
  password: string,
): Promise<Result<AuthTokens, AppError>> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return err({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return err({ code: 'FORBIDDEN', message: 'Account is deactivated' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return err({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
  }

  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
  };

  const accessToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.id, user.id));

  await logAction({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'user.login',
    entityType: 'user',
    entityId: user.id,
  });

  return ok({
    accessToken,
    refreshToken,
    expiresIn: 900, // 15 minutes in seconds
  });
}

// ── Refresh Token ───────────────────────────────────────────────────
export async function refreshToken(
  token: string,
): Promise<Result<AuthTokens, AppError>> {
  let decoded: { sub: string; type: string };
  try {
    decoded = jwt.verify(token, getRefreshSecret()) as { sub: string; type: string };
  } catch {
    return err({ code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' });
  }

  if (decoded.type !== 'refresh') {
    return err({ code: 'UNAUTHORIZED', message: 'Invalid token type' });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, decoded.sub))
    .limit(1);

  if (!user || !user.isActive) {
    return err({ code: 'UNAUTHORIZED', message: 'User not found or inactive' });
  }

  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
  };

  const accessToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const newRefreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, getRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  return ok({
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900,
  });
}

// ── Permissions ─────────────────────────────────────────────────────
export async function getUserPermissions(userId: string): Promise<Result<string[], AppError>> {
  const userRoleRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  if (userRoleRows.length === 0) {
    return ok([]);
  }

  const roleIds = userRoleRows.map((ur) => ur.roleId);
  const allPermissions = new Set<string>();

  for (const roleId of roleIds) {
    const [role] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    if (role?.permissions && Array.isArray(role.permissions)) {
      for (const perm of role.permissions) {
        if (typeof perm === 'string') {
          allPermissions.add(perm);
        }
      }
    }
  }

  return ok([...allPermissions]);
}

export async function checkPermission(
  userId: string,
  permission: string,
): Promise<Result<boolean, AppError>> {
  const permissionsResult = await getUserPermissions(userId);
  if (!permissionsResult.ok) {
    return permissionsResult;
  }

  const has = permissionsResult.value.includes(permission) ||
    permissionsResult.value.includes('*');

  return ok(has);
}

// ── Segregation of Duties ───────────────────────────────────────────
export async function checkSegregationOfDuties(
  userId: string,
  entityType: string,
  entityId: string,
  action: string,
): Promise<Result<boolean, AppError>> {
  // Segregation rule: user cannot approve an entity they created.
  // Check if the user is the creator of the entity by looking at audit log.
  const { auditLog } = await import('../db/schema/audit.js');

  const createActions = await db
    .select({ userId: auditLog.userId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
        eq(auditLog.action, `${entityType}.create`),
      ),
    )
    .limit(1);

  const creator = createActions[0];
  if (!creator) {
    // No creation record found — allow the action
    return ok(true);
  }

  if (creator.userId === userId && action === 'approve') {
    return ok(false); // Cannot approve own creation
  }

  return ok(true);
}
