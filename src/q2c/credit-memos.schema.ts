// Canonical definitions live in src/db/schema/q2c.ts — re-export from there.
// Do NOT redefine tables here; Drizzle would register duplicate table names.
export { creditMemos, creditMemoLines, creditMemoApplications } from '../db/schema/q2c.js';
