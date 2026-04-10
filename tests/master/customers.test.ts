import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockLimit = vi.fn();

  function makeChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['set'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = mockLimit.mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  return {
    mockReturning,
    mockLimit,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    generateNumber: vi.fn().mockResolvedValue({ ok: true, value: 'CUST-000001' }),
    logAction: vi.fn().mockResolvedValue(undefined),
    setFieldValues: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/custom-fields.service.js', () => ({
  setFieldValues: mocks.setFieldValues,
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { customerService, vendorService } from '../../src/master/master.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

describe('Customer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default generateNumber mock
    mocks.generateNumber.mockResolvedValue({ ok: true, value: 'CUST-000001' });
  });

  describe('create', () => {
    it('should create a customer with auto-generated number', async () => {
      const mockCustomer = {
        id: '99999999-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Acme Corp',
        customerNumber: 'CUST-000001',
        status: 'active',
        isActive: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: USER_ID,
      };

      mocks.mockReturning.mockResolvedValueOnce([mockCustomer]);

      const result = await customerService.create(
        TENANT_ID,
        { name: 'Acme Corp', currency: 'USD' },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Acme Corp');
        expect(result.value.customerNumber).toBe('CUST-000001');
      }
      expect(mocks.generateNumber).toHaveBeenCalledWith(TENANT_ID, 'customer');
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          action: 'create',
          entityType: 'customer',
        }),
      );
    });

    it('should attach custom field values on create', async () => {
      const mockCustomer = {
        id: '99999999-0000-0000-0000-000000000002',
        tenantId: TENANT_ID,
        name: 'Custom Fields Inc',
        customerNumber: 'CUST-000001',
      };

      mocks.mockReturning.mockResolvedValueOnce([mockCustomer]);

      const customFields = [
        { fieldDefinitionId: 'ff000000-0000-0000-0000-000000000001', value: 'test' },
      ];

      const result = await customerService.create(
        TENANT_ID,
        { name: 'Custom Fields Inc', currency: 'USD', customFields },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      expect(mocks.setFieldValues).toHaveBeenCalledWith(
        TENANT_ID,
        'customer',
        mockCustomer.id,
        customFields,
      );
    });

    it('should propagate numbering service failure', async () => {
      mocks.generateNumber.mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL', message: 'Numbering sequence not found' },
      });

      const result = await customerService.create(
        TENANT_ID,
        { name: 'Fail Corp' },
        USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
      }
    });
  });

  describe('getById', () => {
    it('should return a customer by id', async () => {
      const mockCustomer = {
        id: '99999999-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Acme Corp',
        customerNumber: 'CUST-000001',
      };

      mocks.mockLimit.mockResolvedValueOnce([mockCustomer]);

      const result = await customerService.getById(TENANT_ID, mockCustomer.id);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Acme Corp');
      }
    });

    it('should return NOT_FOUND for missing customer', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await customerService.getById(TENANT_ID, 'non-existent-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list (pagination)', () => {
    it('should return paginated results with meta', async () => {
      const mockRows = [
        { id: '1', name: 'Alpha', tenantId: TENANT_ID },
        { id: '2', name: 'Beta', tenantId: TENANT_ID },
      ];

      // The service builds queries imperatively:
      //   count: select({count}) -> from(table) -> .where(clause) [then awaited via Promise.all]
      //   data:  select() -> from(table) -> .where(clause) -> .orderBy(col) -> .limit(n) -> .offset(n) [then awaited]
      // Each method is called on the same object returned by from(), so all must be present.
      const countObj = {
        where: vi.fn().mockImplementation(function (this: unknown) { return countObj; }),
        then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve([{ count: 15 }])),
      };
      const countChain = { from: vi.fn().mockReturnValue(countObj) };

      const dataObj = {
        where: vi.fn().mockImplementation(() => dataObj),
        orderBy: vi.fn().mockImplementation(() => dataObj),
        limit: vi.fn().mockImplementation(() => dataObj),
        offset: vi.fn().mockImplementation(() => dataObj),
        then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve(mockRows)),
      };
      const dataChain = { from: vi.fn().mockReturnValue(dataObj) };

      mocks.mockSelect
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const result = await customerService.list(TENANT_ID, {
        page: 2,
        pageSize: 10,
        sort: 'name:asc',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.meta.page).toBe(2);
        expect(result.value.meta.pageSize).toBe(10);
        expect(result.value.meta.total).toBe(15);
        expect(result.value.meta.totalPages).toBe(2);
      }
    });

    it('should apply search filter across name', async () => {
      const countObj2 = {
        where: vi.fn().mockImplementation(() => countObj2),
        then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve([{ count: 1 }])),
      };
      const countChain2 = { from: vi.fn().mockReturnValue(countObj2) };

      const dataObj2 = {
        where: vi.fn().mockImplementation(() => dataObj2),
        orderBy: vi.fn().mockImplementation(() => dataObj2),
        limit: vi.fn().mockImplementation(() => dataObj2),
        offset: vi.fn().mockImplementation(() => dataObj2),
        then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve([{ id: '1', name: 'Searchable' }])),
      };
      const dataChain2 = { from: vi.fn().mockReturnValue(dataObj2) };

      mocks.mockSelect
        .mockReturnValueOnce(countChain2)
        .mockReturnValueOnce(dataChain2);

      const result = await customerService.list(TENANT_ID, {
        page: 1,
        pageSize: 50,
        search: 'Search',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toHaveLength(1);
      }
    });
  });

  describe('update', () => {
    it('should partially update a customer and log audit', async () => {
      const existingCustomer = {
        id: '99999999-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Old Name',
        customerNumber: 'CUST-000001',
      };

      // getById mock (limit returns existing)
      mocks.mockLimit.mockResolvedValueOnce([existingCustomer]);

      // update returning
      mocks.mockReturning.mockResolvedValueOnce([{
        ...existingCustomer,
        name: 'New Name',
        updatedBy: USER_ID,
      }]);

      const result = await customerService.update(
        TENANT_ID,
        existingCustomer.id,
        { name: 'New Name' },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('New Name');
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entityType: 'customer',
          changes: expect.objectContaining({
            before: existingCustomer,
            after: { name: 'New Name' },
          }),
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('should set is_active to false', async () => {
      const existingCustomer = {
        id: '99999999-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Active Corp',
        isActive: true,
      };

      mocks.mockLimit.mockResolvedValueOnce([existingCustomer]);
      mocks.mockReturning.mockResolvedValueOnce([{ ...existingCustomer, isActive: false }]);

      const result = await customerService.deactivate(
        TENANT_ID,
        existingCustomer.id,
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isActive).toBe(false);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deactivate',
          entityType: 'customer',
        }),
      );
    });

    it('should return NOT_FOUND for missing customer', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await customerService.deactivate(TENANT_ID, 'missing-id', USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('duplicateCheck', () => {
    it('should detect duplicate by name', async () => {
      const mockMatches = [
        { id: '1', name: 'Acme Corp', customerNumber: 'CUST-000001' },
      ];

      mocks.mockLimit.mockResolvedValueOnce(mockMatches);

      const result = await customerService.duplicateCheck(TENANT_ID, 'Acme');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isDuplicate).toBe(true);
        expect(result.value.matches).toHaveLength(1);
        expect(result.value.matches[0]!.name).toBe('Acme Corp');
      }
    });

    it('should return no duplicates when none found', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await customerService.duplicateCheck(TENANT_ID, 'Unique Corp');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isDuplicate).toBe(false);
        expect(result.value.matches).toHaveLength(0);
      }
    });

    it('should check by customer number when provided', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await customerService.duplicateCheck(TENANT_ID, 'Corp', 'CUST-999999');

      expect(result.ok).toBe(true);
    });
  });
});

describe('Vendor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateNumber.mockResolvedValue({ ok: true, value: 'VEND-000001' });
  });

  describe('create', () => {
    it('should create a vendor with auto-generated number', async () => {
      const mockVendor = {
        id: '88888888-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Supplier Inc',
        vendorNumber: 'VEND-000001',
        status: 'active',
        isActive: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: USER_ID,
        updatedBy: USER_ID,
      };

      mocks.mockReturning.mockResolvedValueOnce([mockVendor]);

      const result = await vendorService.create(
        TENANT_ID,
        { name: 'Supplier Inc', currency: 'USD' },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Supplier Inc');
        expect(result.value.vendorNumber).toBe('VEND-000001');
      }
      expect(mocks.generateNumber).toHaveBeenCalledWith(TENANT_ID, 'vendor');
    });
  });

  describe('duplicateCheck', () => {
    it('should detect duplicate vendors by name', async () => {
      const mockMatches = [
        { id: '1', name: 'Big Supplier', vendorNumber: 'VEND-000001' },
      ];

      mocks.mockLimit.mockResolvedValueOnce(mockMatches);

      const result = await vendorService.duplicateCheck(TENANT_ID, 'Big Supplier');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isDuplicate).toBe(true);
        expect(result.value.matches).toHaveLength(1);
      }
    });
  });

  describe('deactivate', () => {
    it('should deactivate a vendor', async () => {
      const existingVendor = {
        id: '88888888-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        name: 'Deactivate Me',
        isActive: true,
      };

      mocks.mockLimit.mockResolvedValueOnce([existingVendor]);
      mocks.mockReturning.mockResolvedValueOnce([{ ...existingVendor, isActive: false }]);

      const result = await vendorService.deactivate(
        TENANT_ID,
        existingVendor.id,
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isActive).toBe(false);
      }
    });
  });
});
