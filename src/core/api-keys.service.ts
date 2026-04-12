import { createHash, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { apiKeys } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface CreateApiKeyInput {
  name: string;
  tenantIds: string[];
  createdBy?: string;
  expiresAt?: Date;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  rawKey: string;     // returned once — never stored
  tenantIds: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ValidatedApiKey {
  id: string;
  tenantIds: string[];
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
  // drydock_<32 random hex bytes>
  return `drydock_${randomBytes(32).toString('hex')}`;
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<Result<ApiKeyCreated, AppError>> {
  if (!input.tenantIds.length) {
    return err({ code: 'VALIDATION', message: 'tenantIds must not be empty' });
  }

  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);

  try {
    const [row] = await db.insert(apiKeys).values({
      name: input.name,
      keyHash,
      tenantIds: input.tenantIds,
      createdBy: input.createdBy ?? null,
      expiresAt: input.expiresAt ?? null,
    }).returning();

    if (!row) return err({ code: 'INTERNAL', message: 'Insert returned no row' });

    return ok({
      id: row.id,
      name: row.name,
      rawKey,
      tenantIds: row.tenantIds as string[],
      expiresAt: row.expiresAt ?? null,
      createdAt: row.createdAt,
    });
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to create API key', details: { error: e } });
  }
}

export async function listApiKeys(): Promise<Result<(typeof apiKeys.$inferSelect)[], AppError>> {
  try {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.isActive, true));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list API keys', details: { error: e } });
  }
}

export async function revokeApiKey(id: string): Promise<Result<void, AppError>> {
  try {
    const [row] = await db.update(apiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'API key not found' });
    return ok(undefined);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to revoke API key', details: { error: e } });
  }
}

export async function validateApiKey(raw: string): Promise<ValidatedApiKey | null> {
  const hash = hashKey(raw);

  let row: typeof apiKeys.$inferSelect | undefined;
  try {
    [row] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)));
  } catch {
    return null;
  }

  if (!row) return null;

  // Check expiry
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  // Fire-and-forget last_used_at update
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => undefined);

  return { id: row.id, tenantIds: row.tenantIds as string[] };
}
