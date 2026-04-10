import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export type DrydockDb = NodePgDatabase<typeof schema>;

export async function withTenant<T>(tenantId: string, fn: (db: DrydockDb) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_tenant = '${tenantId}'`);
    const tenantDb = drizzle(client, { schema }) as DrydockDb;
    const result = await fn(tenantDb);
    return result;
  } finally {
    await client.query(`RESET app.current_tenant`);
    client.release();
  }
}

export { pool };
