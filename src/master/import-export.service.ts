import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { customers, vendors, items } from '../db/schema/index.js';
import { accounts } from '../db/schema/gl.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import { customerService, vendorService, itemService } from './master.service.js';
import * as accountsSvc from '../gl/accounts.service.js';

// ── CSV primitives ──────────────────────────────────────────────────

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function serializeToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    result.push(cur);
    return result;
  };

  const headers = parseRow(lines[0] ?? '');
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const vals = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }

  return { headers, rows };
}

interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

// ── Customers ───────────────────────────────────────────────────────

const CUSTOMER_HEADERS = ['name', 'status', 'currency', 'creditLimit', 'externalId'];

export async function exportCustomersCsv(tenantId: string): Promise<string> {
  const rows = await db
    .select({
      name: customers.name,
      status: customers.status,
      currency: customers.currency,
      creditLimit: customers.creditLimit,
      externalId: customers.externalId,
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(customers.customerNumber);

  return serializeToCsv(CUSTOMER_HEADERS, rows as Record<string, unknown>[]);
}

export async function importCustomersCsv(
  tenantId: string,
  csvText: string,
  userId: string,
): Promise<Result<ImportResult, AppError>> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2; // 1-based + header

    if (!row['name']?.trim()) {
      result.errors.push({ row: rowNum, message: 'name is required' });
      continue;
    }

    const data: Record<string, unknown> = {
      name: row['name'].trim(),
      status: row['status']?.trim() || 'active',
      currency: row['currency']?.trim() || 'USD',
    };
    if (row['creditLimit']) {
      const n = parseInt(row['creditLimit'], 10);
      if (!isNaN(n)) data['creditLimit'] = n;
    }
    if (row['externalId']?.trim()) data['externalId'] = row['externalId'].trim();

    // Match by externalId first, then by name
    let existing: { id: string } | null = null;
    if (data['externalId']) {
      const found = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.externalId, data['externalId'] as string)))
        .limit(1);
      existing = found[0] ?? null;
    }
    if (!existing) {
      const found = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.name, data['name'] as string)))
        .limit(1);
      existing = found[0] ?? null;
    }

    if (existing) {
      const upd = await customerService.update(tenantId, existing.id, data, userId);
      if (!upd.ok) {
        result.errors.push({ row: rowNum, message: upd.error.message });
      } else {
        result.updated++;
      }
    } else {
      const cre = await customerService.create(tenantId, data, userId);
      if (!cre.ok) {
        result.errors.push({ row: rowNum, message: cre.error.message });
      } else {
        result.created++;
      }
    }
  }

  return ok(result);
}

// ── Vendors ─────────────────────────────────────────────────────────

const VENDOR_HEADERS = ['name', 'status', 'currency', 'taxId', 'externalId'];

export async function exportVendorsCsv(tenantId: string): Promise<string> {
  const rows = await db
    .select({
      name: vendors.name,
      status: vendors.status,
      currency: vendors.currency,
      taxId: vendors.taxId,
      externalId: vendors.externalId,
    })
    .from(vendors)
    .where(eq(vendors.tenantId, tenantId))
    .orderBy(vendors.vendorNumber);

  return serializeToCsv(VENDOR_HEADERS, rows as Record<string, unknown>[]);
}

export async function importVendorsCsv(
  tenantId: string,
  csvText: string,
  userId: string,
): Promise<Result<ImportResult, AppError>> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    if (!row['name']?.trim()) {
      result.errors.push({ row: rowNum, message: 'name is required' });
      continue;
    }

    const data: Record<string, unknown> = {
      name: row['name'].trim(),
      status: row['status']?.trim() || 'active',
      currency: row['currency']?.trim() || 'USD',
    };
    if (row['taxId']?.trim()) data['taxId'] = row['taxId'].trim();
    if (row['externalId']?.trim()) data['externalId'] = row['externalId'].trim();

    let existing: { id: string } | null = null;
    if (data['externalId']) {
      const found = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.tenantId, tenantId), eq(vendors.externalId, data['externalId'] as string)))
        .limit(1);
      existing = found[0] ?? null;
    }
    if (!existing) {
      const found = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.tenantId, tenantId), eq(vendors.name, data['name'] as string)))
        .limit(1);
      existing = found[0] ?? null;
    }

    if (existing) {
      const upd = await vendorService.update(tenantId, existing.id, data, userId);
      if (!upd.ok) {
        result.errors.push({ row: rowNum, message: upd.error.message });
      } else {
        result.updated++;
      }
    } else {
      const cre = await vendorService.create(tenantId, data, userId);
      if (!cre.ok) {
        result.errors.push({ row: rowNum, message: cre.error.message });
      } else {
        result.created++;
      }
    }
  }

  return ok(result);
}

// ── Items ────────────────────────────────────────────────────────────

const ITEM_HEADERS = [
  'itemNumber', 'name', 'description', 'itemType',
  'unitOfMeasure', 'standardCost', 'listPrice',
];

export async function exportItemsCsv(tenantId: string): Promise<string> {
  const rows = await db
    .select({
      itemNumber: items.itemNumber,
      name: items.name,
      description: items.description,
      itemType: items.itemType,
      unitOfMeasure: items.unitOfMeasure,
      standardCost: items.standardCost,
      listPrice: items.listPrice,
    })
    .from(items)
    .where(eq(items.tenantId, tenantId))
    .orderBy(items.itemNumber);

  return serializeToCsv(ITEM_HEADERS, rows as Record<string, unknown>[]);
}

export async function importItemsCsv(
  tenantId: string,
  csvText: string,
  userId: string,
): Promise<Result<ImportResult, AppError>> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    if (!row['name']?.trim()) {
      result.errors.push({ row: rowNum, message: 'name is required' });
      continue;
    }

    const data: Record<string, unknown> = {
      name: row['name'].trim(),
      itemType: row['itemType']?.trim() || 'service',
    };
    if (row['itemNumber']?.trim()) data['itemNumber'] = row['itemNumber'].trim();
    if (row['description']?.trim()) data['description'] = row['description'].trim();
    if (row['unitOfMeasure']?.trim()) data['unitOfMeasure'] = row['unitOfMeasure'].trim();
    if (row['standardCost']) {
      const n = parseInt(row['standardCost'], 10);
      if (!isNaN(n)) data['standardCost'] = n;
    }
    if (row['listPrice']) {
      const n = parseInt(row['listPrice'], 10);
      if (!isNaN(n)) data['listPrice'] = n;
    }

    // Match by itemNumber
    let existing: { id: string } | null = null;
    if (data['itemNumber']) {
      const found = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.tenantId, tenantId), eq(items.itemNumber, data['itemNumber'] as string)))
        .limit(1);
      existing = found[0] ?? null;
    }

    if (existing) {
      const upd = await itemService.update(tenantId, existing.id, data, userId);
      if (!upd.ok) {
        result.errors.push({ row: rowNum, message: upd.error.message });
      } else {
        result.updated++;
      }
    } else {
      const cre = await itemService.create(tenantId, data, userId);
      if (!cre.ok) {
        result.errors.push({ row: rowNum, message: cre.error.message });
      } else {
        result.created++;
      }
    }
  }

  return ok(result);
}

// ── GL Accounts (Chart of Accounts) ─────────────────────────────────

const ACCOUNT_HEADERS = [
  'accountNumber', 'name', 'accountType', 'accountSubtype',
  'normalBalance', 'isPostingAccount', 'description',
];

export async function exportAccountsCsv(tenantId: string): Promise<string> {
  const rows = await db
    .select({
      accountNumber: accounts.accountNumber,
      name: accounts.name,
      accountType: accounts.accountType,
      accountSubtype: accounts.accountSubtype,
      normalBalance: accounts.normalBalance,
      isPostingAccount: accounts.isPostingAccount,
      description: accounts.description,
    })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId))
    .orderBy(accounts.accountNumber);

  return serializeToCsv(ACCOUNT_HEADERS, rows as Record<string, unknown>[]);
}

export async function importAccountsCsv(
  tenantId: string,
  csvText: string,
  userId: string,
): Promise<Result<ImportResult, AppError>> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  const VALID_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);
  const VALID_NORMAL_BALANCE = new Set(['debit', 'credit']);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    const accountNumber = row['accountNumber']?.trim();
    const name = row['name']?.trim();
    const accountType = row['accountType']?.trim()?.toLowerCase();

    if (!accountNumber) {
      result.errors.push({ row: rowNum, message: 'accountNumber is required' });
      continue;
    }
    if (!name) {
      result.errors.push({ row: rowNum, message: 'name is required' });
      continue;
    }
    if (!accountType || !VALID_TYPES.has(accountType)) {
      result.errors.push({
        row: rowNum,
        message: `accountType must be one of: ${[...VALID_TYPES].join(', ')}`,
      });
      continue;
    }

    const normalBalance = row['normalBalance']?.trim()?.toLowerCase() || 'debit';
    if (!VALID_NORMAL_BALANCE.has(normalBalance)) {
      result.errors.push({ row: rowNum, message: 'normalBalance must be debit or credit' });
      continue;
    }

    const isPostingRaw = row['isPostingAccount']?.trim()?.toLowerCase();
    const isPostingAccount = isPostingRaw === 'false' || isPostingRaw === '0' ? false : true;

    const accountData = {
      accountNumber,
      name,
      accountType: accountType as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
      normalBalance: normalBalance as 'debit' | 'credit',
      isPostingAccount,
      ...(row['accountSubtype']?.trim() ? { accountSubtype: row['accountSubtype'].trim() } : {}),
      ...(row['description']?.trim() ? { description: row['description'].trim() } : {}),
    };

    // Match by accountNumber
    const found = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.accountNumber, accountNumber)))
      .limit(1);
    const existing = found[0] ?? null;

    if (existing) {
      const upd = await accountsSvc.updateAccount(tenantId, existing.id, accountData, userId);
      if (!upd.ok) {
        result.errors.push({ row: rowNum, message: upd.error.message });
      } else {
        result.updated++;
      }
    } else {
      const cre = await accountsSvc.createAccount(tenantId, accountData, userId);
      if (!cre.ok) {
        result.errors.push({ row: rowNum, message: cre.error.message });
      } else {
        result.created++;
      }
    }
  }

  return ok(result);
}
