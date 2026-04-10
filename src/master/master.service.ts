import { eq, and, or, like, sql, asc, desc, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/connection.js';
import {
  customers,
  vendors,
  contacts,
  employees,
  items,
  departments,
  locations,
  legalEntities,
  projects,
  costCenters,
  paymentTerms,
  taxCodes,
  currencies,
} from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';
import { logAction } from '../core/audit.service.js';
import { setFieldValues } from '../core/custom-fields.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';
import type { PaginatedResponse } from './master.schemas.js';

// ── Types ───────────────────────────────────────────────────────────

interface ListOptions {
  page: number;
  pageSize: number;
  sort?: string;
  filter?: string;
  search?: string;
}

// Helper to safely access table columns by name
function col(table: PgTable, name: string): PgColumn | undefined {
  const columns = (table as unknown as Record<string, PgColumn>);
  return columns[name];
}

// ── Sort parser ─────────────────────────────────────────────────────

function parseSortParam(
  sortParam: string | undefined,
  table: PgTable,
): SQL | undefined {
  if (!sortParam) return undefined;

  const [field, direction] = sortParam.split(':');
  if (!field) return undefined;

  const column = col(table, field);
  if (!column) return undefined;

  return direction === 'desc' ? desc(column) : asc(column);
}

// ── Filter parser ───────────────────────────────────────────────────

function parseFilterParam(
  filterParam: string | undefined,
  table: PgTable,
): SQL[] {
  if (!filterParam) return [];

  try {
    const filters = JSON.parse(filterParam) as Record<string, unknown>;
    const conditions: SQL[] = [];

    for (const [key, value] of Object.entries(filters)) {
      const column = col(table, key);
      if (!column || value === undefined || value === null) continue;

      if (typeof value === 'string') {
        conditions.push(eq(column, value));
      } else if (typeof value === 'number') {
        conditions.push(eq(column, value));
      } else if (typeof value === 'boolean') {
        conditions.push(eq(column, value));
      }
    }

    return conditions;
  } catch {
    return [];
  }
}

// ── Generic CRUD Factory ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMasterService(
  table: any,
  entityType: string,
  numberField?: string,
) {
  type Row = Record<string, unknown>;

  const idCol = col(table, 'id');
  const tenantIdCol = col(table, 'tenantId');
  const isActiveCol = col(table, 'isActive');
  const nameCol = col(table, 'name');

  async function create(
    tenantId: string,
    data: Record<string, unknown>,
    userId: string,
  ): Promise<Result<Row, AppError>> {
    const insertData: Record<string, unknown> = {
      ...data,
    };

    // Only set tenant-scoped fields if the table has them
    if (tenantIdCol) insertData['tenantId'] = tenantId;
    if (col(table, 'createdBy')) insertData['createdBy'] = userId;
    if (col(table, 'updatedBy')) insertData['updatedBy'] = userId;

    // Generate auto-number if this entity type has a number field
    if (numberField) {
      const numResult = await generateNumber(tenantId, entityType);
      if (!numResult.ok) return numResult;
      insertData[numberField] = numResult.value;
    }

    const rows = await db
      .insert(table)
      .values(insertData)
      .returning() as unknown as Record<string, unknown>[];

    const row = rows[0];
    if (!row) {
      return err({ code: 'INTERNAL', message: `Failed to create ${entityType}` });
    }

    const entityId = row['id'] as string;

    await logAction({
      tenantId,
      userId,
      action: 'create',
      entityType,
      entityId,
      changes: data,
    });

    return ok(row as Row);
  }

  async function getById(
    tenantId: string,
    id: string,
  ): Promise<Result<Row, AppError>> {
    if (!idCol) {
      return err({ code: 'INTERNAL', message: `Table for ${entityType} has no id column` });
    }

    const conditions: SQL[] = [eq(idCol, id)];
    if (tenantIdCol) conditions.push(eq(tenantIdCol, tenantId));

    const rows = await db
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return err({ code: 'NOT_FOUND', message: `${entityType} '${id}' not found` });
    }

    return ok(row as Row);
  }

  async function list(
    tenantId: string,
    options: ListOptions,
  ): Promise<Result<PaginatedResponse<Row>, AppError>> {
    const { page, pageSize, sort, filter, search } = options;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];
    if (tenantIdCol) conditions.push(eq(tenantIdCol, tenantId));

    // Apply filter
    conditions.push(...parseFilterParam(filter, table));

    // Apply search across name field
    if (search && nameCol) {
      conditions.push(like(nameCol, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = parseSortParam(sort, table) ?? (nameCol ? asc(nameCol) : undefined);

    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(table);
    if (whereClause) countQuery.where(whereClause);

    const dataQuery = db.select().from(table);
    if (whereClause) dataQuery.where(whereClause);
    if (orderBy) dataQuery.orderBy(orderBy);
    dataQuery.limit(pageSize).offset(offset);

    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);

    const total = countResult[0]?.count ?? 0;

    return ok({
      data: rows as Row[],
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }

  async function update(
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
    userId: string,
  ): Promise<Result<Row, AppError>> {
    // Get current state for audit
    const existingResult = await getById(tenantId, id);
    if (!existingResult.ok) return existingResult;

    const before = existingResult.value as Record<string, unknown>;

    const updateData: Record<string, unknown> = { ...data };
    if (col(table, 'updatedBy')) updateData['updatedBy'] = userId;
    if (col(table, 'updatedAt')) updateData['updatedAt'] = new Date();

    if (!idCol) {
      return err({ code: 'INTERNAL', message: `Table for ${entityType} has no id column` });
    }

    const conditions: SQL[] = [eq(idCol, id)];
    if (tenantIdCol) conditions.push(eq(tenantIdCol, tenantId));

    const rows = await db
      .update(table)
      .set(updateData)
      .where(and(...conditions))
      .returning() as unknown as Record<string, unknown>[];

    const row = rows[0];
    if (!row) {
      return err({ code: 'INTERNAL', message: `Failed to update ${entityType}` });
    }

    await logAction({
      tenantId,
      userId,
      action: 'update',
      entityType,
      entityId: id,
      changes: { before, after: data },
    });

    return ok(row as Row);
  }

  async function deactivate(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<Result<Row, AppError>> {
    const existingResult = await getById(tenantId, id);
    if (!existingResult.ok) return existingResult;

    if (!idCol || !isActiveCol) {
      return err({ code: 'INTERNAL', message: `Table for ${entityType} does not support deactivation` });
    }

    const deactivateData: Record<string, unknown> = { isActive: false };
    if (col(table, 'updatedBy')) deactivateData['updatedBy'] = userId;
    if (col(table, 'updatedAt')) deactivateData['updatedAt'] = new Date();

    const conditions: SQL[] = [eq(idCol, id)];
    if (tenantIdCol) conditions.push(eq(tenantIdCol, tenantId));

    const rows = await db
      .update(table)
      .set(deactivateData)
      .where(and(...conditions))
      .returning() as unknown as Record<string, unknown>[];

    const row = rows[0];
    if (!row) {
      return err({ code: 'INTERNAL', message: `Failed to deactivate ${entityType}` });
    }

    await logAction({
      tenantId,
      userId,
      action: 'deactivate',
      entityType,
      entityId: id,
    });

    return ok(row as Row);
  }

  return { create, getById, list, update, deactivate };
}

// ── Customer Service ────────────────────────────────────────────────

const baseCustomerService = createMasterService(customers, 'customer', 'customerNumber');

async function duplicateCheckCustomer(
  tenantId: string,
  name: string,
  customerNumber?: string,
): Promise<Result<{ isDuplicate: boolean; matches: Array<{ id: string; name: string; customerNumber: string }> }, AppError>> {
  const conditions: SQL[] = [eq(customers.tenantId, tenantId)];

  const nameOrNumber: SQL[] = [like(customers.name, `%${name}%`)];
  if (customerNumber) {
    nameOrNumber.push(eq(customers.customerNumber, customerNumber));
  }
  conditions.push(or(...nameOrNumber)!);

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      customerNumber: customers.customerNumber,
    })
    .from(customers)
    .where(and(...conditions))
    .limit(10);

  return ok({
    isDuplicate: rows.length > 0,
    matches: rows,
  });
}

async function createCustomer(
  tenantId: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<Result<Record<string, unknown>, AppError>> {
  const { customFields, ...entityData } = data;

  const result = await baseCustomerService.create(tenantId, entityData, userId);
  if (!result.ok) return result;

  // Attach custom field values
  if (customFields && Array.isArray(customFields) && customFields.length > 0) {
    const cfResult = await setFieldValues(
      tenantId,
      'customer',
      result.value.id as string,
      customFields as Array<{ fieldDefinitionId: string; value: unknown }>,
    );
    if (!cfResult.ok) return cfResult;
  }

  return result;
}

async function updateCustomer(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<Result<Record<string, unknown>, AppError>> {
  const { customFields, ...entityData } = data;

  const result = await baseCustomerService.update(tenantId, id, entityData, userId);
  if (!result.ok) return result;

  if (customFields && Array.isArray(customFields) && customFields.length > 0) {
    const cfResult = await setFieldValues(
      tenantId,
      'customer',
      id,
      customFields as Array<{ fieldDefinitionId: string; value: unknown }>,
    );
    if (!cfResult.ok) return cfResult;
  }

  return result;
}

async function listCustomerContacts(
  tenantId: string,
  customerId: string,
): Promise<Result<Array<Record<string, unknown>>, AppError>> {
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.customerId, customerId),
      ),
    )
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName));

  return ok(rows);
}

export const customerService = {
  create: createCustomer,
  getById: baseCustomerService.getById,
  list: baseCustomerService.list,
  update: updateCustomer,
  deactivate: baseCustomerService.deactivate,
  duplicateCheck: duplicateCheckCustomer,
  listContacts: listCustomerContacts,
};

// ── Vendor Service ──────────────────────────────────────────────────

const baseVendorService = createMasterService(vendors, 'vendor', 'vendorNumber');

async function duplicateCheckVendor(
  tenantId: string,
  name: string,
  vendorNumber?: string,
): Promise<Result<{ isDuplicate: boolean; matches: Array<{ id: string; name: string; vendorNumber: string }> }, AppError>> {
  const conditions: SQL[] = [eq(vendors.tenantId, tenantId)];

  const nameOrNumber: SQL[] = [like(vendors.name, `%${name}%`)];
  if (vendorNumber) {
    nameOrNumber.push(eq(vendors.vendorNumber, vendorNumber));
  }
  conditions.push(or(...nameOrNumber)!);

  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      vendorNumber: vendors.vendorNumber,
    })
    .from(vendors)
    .where(and(...conditions))
    .limit(10);

  return ok({
    isDuplicate: rows.length > 0,
    matches: rows,
  });
}

async function createVendor(
  tenantId: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<Result<Record<string, unknown>, AppError>> {
  const { customFields, ...entityData } = data;

  const result = await baseVendorService.create(tenantId, entityData, userId);
  if (!result.ok) return result;

  if (customFields && Array.isArray(customFields) && customFields.length > 0) {
    const cfResult = await setFieldValues(
      tenantId,
      'vendor',
      result.value.id as string,
      customFields as Array<{ fieldDefinitionId: string; value: unknown }>,
    );
    if (!cfResult.ok) return cfResult;
  }

  return result;
}

async function updateVendor(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<Result<Record<string, unknown>, AppError>> {
  const { customFields, ...entityData } = data;

  const result = await baseVendorService.update(tenantId, id, entityData, userId);
  if (!result.ok) return result;

  if (customFields && Array.isArray(customFields) && customFields.length > 0) {
    const cfResult = await setFieldValues(
      tenantId,
      'vendor',
      id,
      customFields as Array<{ fieldDefinitionId: string; value: unknown }>,
    );
    if (!cfResult.ok) return cfResult;
  }

  return result;
}

async function listVendorContacts(
  tenantId: string,
  vendorId: string,
): Promise<Result<Array<Record<string, unknown>>, AppError>> {
  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.vendorId, vendorId),
      ),
    )
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName));

  return ok(rows);
}

export const vendorService = {
  create: createVendor,
  getById: baseVendorService.getById,
  list: baseVendorService.list,
  update: updateVendor,
  deactivate: baseVendorService.deactivate,
  duplicateCheck: duplicateCheckVendor,
  listContacts: listVendorContacts,
};

// ── Contact Service ─────────────────────────────────────────────────

export const contactService = createMasterService(contacts, 'contact');

// ── Simple Entity Services ──────────────────────────────────────────

export const employeeService = createMasterService(employees, 'employee', 'employeeNumber');
export const itemService = createMasterService(items, 'item', 'itemNumber');
export const departmentService = createMasterService(departments, 'department');
export const locationService = createMasterService(locations, 'location');
export const legalEntityService = createMasterService(legalEntities, 'legal_entity');
export const projectService = createMasterService(projects, 'project', 'projectNumber');
export const costCenterService = createMasterService(costCenters, 'cost_center');
export const paymentTermsService = createMasterService(paymentTerms, 'payment_terms');
export const taxCodeService = createMasterService(taxCodes, 'tax_code');
export const currencyService = createMasterService(currencies, 'currency');
