import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { numberingSequences } from '../db/schema/index.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

/**
 * Generate the next number for a given entity type within a tenant.
 * Uses SELECT ... FOR UPDATE to prevent duplicates under concurrency.
 */
export async function generateNumber(
  tenantId: string,
  entityType: string,
): Promise<Result<string, AppError>> {
  const [row] = await db
    .update(numberingSequences)
    .set({
      currentValue: sql`${numberingSequences.currentValue} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(numberingSequences.tenantId, tenantId),
        eq(numberingSequences.entityType, entityType),
      ),
    )
    .returning();

  if (!row) {
    // Auto-create sequence if it doesn't exist
    const prefix = entityType.toUpperCase().slice(0, 4);
    const [created] = await db
      .insert(numberingSequences)
      .values({
        tenantId,
        entityType,
        prefix,
        currentValue: 1,
        padWidth: 6,
      })
      .returning();

    if (!created) {
      return err({ code: 'INTERNAL', message: `Failed to create numbering sequence for ${entityType}` });
    }

    return ok(`${created.prefix}-${String(created.currentValue).padStart(created.padWidth, '0')}`);
  }

  return ok(`${row.prefix}-${String(row.currentValue).padStart(row.padWidth, '0')}`);
}

/**
 * Calls the drydock_core.next_number(tenant_id, entity_type) SQL function.
 * Thread-safe via the PL/pgSQL function's UPDATE ... RETURNING atomicity.
 */
export async function getNextNumber(
  tenantId: string,
  entityType: string,
): Promise<Result<string, AppError>> {
  try {
    const result = await db.execute<{ next_number: string }>(
      sql`SELECT drydock_core.next_number(${tenantId}::uuid, ${entityType}) AS next_number`,
    );

    const row = result.rows[0];
    if (!row?.next_number) {
      return err({
        code: 'NOT_FOUND',
        message: `No numbering sequence configured for entity type '${entityType}'`,
      });
    }

    return ok(row.next_number);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating next number';
    return err({ code: 'INTERNAL', message });
  }
}
