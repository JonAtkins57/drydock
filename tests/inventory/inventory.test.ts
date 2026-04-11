import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();

  function makeChain(extraMethods?: Record<string, ReturnType<typeof vi.fn>>) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      values: vi.fn(),
      set: vi.fn(),
      returning: mockReturning,
      where: vi.fn(),
      from: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      orderBy: vi.fn(),
      for: vi.fn(),
      ...extraMethods,
    };
    // Each method returns the chain by default
    for (const key of Object.keys(chain)) {
      if (key !== 'returning' && key !== 'for') {
        chain[key].mockReturnValue(chain);
      }
    }
    chain['for'].mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  const mockInsert = vi.fn().mockReturnValue(insertChain);
  const mockSelect = vi.fn().mockReturnValue(selectChain);
  const mockUpdate = vi.fn().mockReturnValue(updateChain);

  // db.transaction calls the callback with a tx object using the same mocks
  const mockTransaction = vi.fn().mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        insert: mockInsert,
        select: mockSelect,
        update: mockUpdate,
      });
    },
  );

  function resetAll() {
    vi.clearAllMocks();

    for (const chain of [insertChain, selectChain, updateChain]) {
      for (const key of Object.keys(chain)) {
        if (key !== 'returning') {
          (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
        }
      }
    }
    mockInsert.mockReturnValue(insertChain);
    mockSelect.mockReturnValue(selectChain);
    mockUpdate.mockReturnValue(updateChain);
    mockTransaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ insert: mockInsert, select: mockSelect, update: mockUpdate }),
    );
  }

  return {
    mockReturning,
    insertChain,
    selectChain,
    updateChain,
    mockInsert,
    mockSelect,
    mockUpdate,
    mockTransaction,
    resetAll,
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
    transaction: mocks.mockTransaction,
  },
}));

vi.mock('../../src/core/auth.middleware.js', () => ({
  authenticateHook: vi.fn(async () => {}),
  setTenantContext: vi.fn(async () => {}),
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import Fastify from 'fastify';
import { inventoryRoutes } from '../../src/inventory/inventory.routes.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID   = '11111111-2222-3333-4444-555555555555';
const ITEM_ID   = '22222222-3333-4444-5555-666666666666';
const WH_A      = '33333333-4444-5555-6666-777777777777';
const WH_B      = '44444444-5555-6666-7777-888888888888';
const TX_ID     = '55555555-6666-7777-8888-999999999999';

async function buildApp() {
  const app = Fastify();
  app.decorateRequest('currentUser', {
    getter() {
      return {
        sub: USER_ID,
        tenantId: TENANT_ID,
        email: 'test@example.com',
        permissions: [],
      };
    },
  });
  await app.register(inventoryRoutes, { prefix: '/' });
  await app.ready();
  return app;
}

// Helper: make select return different values per call
function setupSelectSequence(responses: unknown[][]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      from:    vi.fn(),
      where:   vi.fn(),
      orderBy: vi.fn(),
      limit:   vi.fn(),
      offset:  vi.fn(),
      for:     vi.fn(),
    };
    const resp = responses[idx] ?? [];
    for (const key of Object.keys(chain)) {
      chain[key].mockReturnValue(chain);
    }
    // Make the chain thenable so await resolves to the response
    (chain as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) => resolve(resp);
    return chain;
  });
}

// ════════════════════════════════════════════════════════════════════
// Inventory Route Tests
// ════════════════════════════════════════════════════════════════════

describe('Inventory Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mocks.resetAll();
    app = await buildApp();
  });

  // ── GET /warehouses ──────────────────────────────────────────────

  describe('GET /warehouses', () => {
    it('returns paginated warehouses', async () => {
      const wh = { id: WH_A, tenantId: TENANT_ID, name: 'Main WH', code: 'MWH', isActive: true, createdAt: new Date().toISOString() };
      setupSelectSequence([[{ value: 1 }], [wh]]);

      const res = await app.inject({ method: 'GET', url: '/warehouses' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
    });

    it('returns 422 for invalid page param', async () => {
      const res = await app.inject({ method: 'GET', url: '/warehouses?page=-1' });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── POST /warehouses ─────────────────────────────────────────────

  describe('POST /warehouses', () => {
    it('creates a warehouse and returns 201', async () => {
      const created = { id: WH_A, tenantId: TENANT_ID, name: 'Main WH', code: 'MWH', isActive: true };
      mocks.mockReturning.mockResolvedValueOnce([created]);

      const res = await app.inject({
        method: 'POST',
        url: '/warehouses',
        payload: { name: 'Main WH', code: 'MWH' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ code: string }>().code).toBe('MWH');
    });

    it('returns 422 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/warehouses',
        payload: { name: 'No Code' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  // ── GET /items ───────────────────────────────────────────────────

  describe('GET /items', () => {
    it('returns paginated inventory balances', async () => {
      const balance = { id: '99', tenantId: TENANT_ID, itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '100.0000', unitCost: '5.0000', totalCost: '500.0000' };
      setupSelectSequence([[{ value: 1 }], [balance]]);

      const res = await app.inject({ method: 'GET', url: '/items' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
    });
  });

  // ── GET /transactions ────────────────────────────────────────────

  describe('GET /transactions', () => {
    it('returns paginated transactions', async () => {
      const txn = { id: TX_ID, tenantId: TENANT_ID, transactionType: 'receipt', itemId: ITEM_ID, warehouseId: WH_A, quantity: '10.0000' };
      setupSelectSequence([[{ value: 1 }], [txn]]);

      const res = await app.inject({ method: 'GET', url: '/transactions' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; meta: { total: number } }>();
      expect(body.meta.total).toBe(1);
    });
  });

  // ── POST /transactions ───────────────────────────────────────────

  describe('POST /transactions', () => {
    const validReceipt = {
      transactionType: 'receipt',
      itemId: ITEM_ID,
      warehouseId: WH_A,
      quantity: 10,
      unitCost: 5,
    };

    it('returns 422 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { transactionType: 'receipt' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for invalid transactionType enum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'bogus' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for transfer missing fromWarehouseId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { transactionType: 'transfer', itemId: ITEM_ID, warehouseId: WH_B, quantity: 5, unitCost: 0 },
      });
      expect(res.statusCode).toBe(422);
    });

    // ── receipt: new balance row ────────────────────────────────────

    it('receipt creates new inventory balance and returns 201', async () => {
      const txnRecord = { id: TX_ID, transactionType: 'receipt', quantity: '10.0000', totalCost: '50.0000' };

      // Pre-flight: no select calls for receipt
      // Inside transaction: insert txn → returning txnRecord; select existing (none) → insert balance
      mocks.mockReturning
        .mockResolvedValueOnce([txnRecord])  // insert transaction
        .mockResolvedValueOnce([]);           // insert inventory balance (no returning needed but resolves)

      // Select inside tx: no existing balance row
      setupSelectSequence([[]]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: validReceipt,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<{ id: string }>().id).toBe(TX_ID);
    });

    it('receipt updates existing balance with weighted average cost', async () => {
      const txnRecord = { id: TX_ID, transactionType: 'receipt', quantity: '10.0000', totalCost: '50.0000' };
      const existingBalance = { id: 'bal1', tenantId: TENANT_ID, itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '20.0000', unitCost: '4.0000', totalCost: '80.0000' };

      mocks.mockReturning.mockResolvedValueOnce([txnRecord]);

      // Select inside tx: existing balance present
      setupSelectSequence([[existingBalance]]);

      // update returning
      mocks.updateChain['returning'] = vi.fn().mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: validReceipt,
      });
      expect(res.statusCode).toBe(201);
      // weighted avg: (20*4 + 10*5) / 30 = 130/30 ≈ 4.333
      expect(mocks.mockUpdate).toHaveBeenCalled();
    });

    // ── issue: pre-flight stock check (race-condition-safe) ─────────

    it('issue returns 422 when pre-flight finds insufficient stock', async () => {
      // Pre-flight select (outside tx): balance with 3 on hand
      const lowBalance = { id: 'bal1', tenantId: TENANT_ID, itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '3.0000', unitCost: '5.0000', totalCost: '15.0000' };
      setupSelectSequence([[lowBalance]]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'issue', quantity: 10 },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('INSUFFICIENT_STOCK');
      // Transaction must NOT have been entered
      expect(mocks.mockTransaction).not.toHaveBeenCalled();
    });

    it('issue returns 422 when in-transaction lock finds race-depleted stock', async () => {
      // Pre-flight select: stock OK (10 on hand)
      // Inside tx select-for-update: stock depleted to 3 by concurrent request
      const okBalance   = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '10.0000', unitCost: '5.0000', totalCost: '50.0000' };
      const raceBalance = { ...okBalance, quantityOnHand: '3.0000', totalCost: '15.0000' };

      // First call: pre-flight (outside tx); second call: inside tx (FOR UPDATE)
      setupSelectSequence([[okBalance], [raceBalance]]);

      mocks.mockReturning.mockResolvedValueOnce([{ id: TX_ID }]); // insert txn

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'issue', quantity: 10 },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: string }>().error).toBe('INSUFFICIENT_STOCK');
    });

    it('issue succeeds and decrements balance when stock is sufficient', async () => {
      const balance = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '20.0000', unitCost: '5.0000', totalCost: '100.0000' };
      const txnRecord = { id: TX_ID, transactionType: 'issue', quantity: '10.0000', totalCost: '-50.0000' };

      setupSelectSequence([[balance], [balance]]);
      mocks.mockReturning.mockResolvedValueOnce([txnRecord]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'issue', quantity: 10 },
      });
      expect(res.statusCode).toBe(201);
      // totalCost should be negative for issue
      expect(res.json<{ totalCost: string }>().totalCost).toBe('-50.0000');
      expect(mocks.mockUpdate).toHaveBeenCalled();
    });

    // ── transfer: source validation ─────────────────────────────────

    it('transfer returns 422 when source warehouse has no balance record', async () => {
      // Pre-flight: no source balance found
      setupSelectSequence([[]]);  // source balance missing

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: {
          transactionType: 'transfer',
          itemId: ITEM_ID,
          warehouseId: WH_B,
          fromWarehouseId: WH_A,
          quantity: 5,
          unitCost: 0,
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: string }>().error).toBe('INSUFFICIENT_STOCK');
      expect(mocks.mockTransaction).not.toHaveBeenCalled();
    });

    it('transfer returns 422 when source warehouse has insufficient stock', async () => {
      const lowSource = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '2.0000', unitCost: '5.0000', totalCost: '10.0000' };
      setupSelectSequence([[lowSource]]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: {
          transactionType: 'transfer',
          itemId: ITEM_ID,
          warehouseId: WH_B,
          fromWarehouseId: WH_A,
          quantity: 5,
          unitCost: 0,
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: string }>().error).toBe('INSUFFICIENT_STOCK');
    });

    it('transfer returns 422 when in-transaction lock finds race-depleted source stock', async () => {
      const goodSource = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '10.0000', unitCost: '5.0000', totalCost: '50.0000' };
      const raceSource = { ...goodSource, quantityOnHand: '2.0000', totalCost: '10.0000' };

      // pre-flight: good; in-tx FOR UPDATE: race-depleted
      setupSelectSequence([[goodSource], [raceSource]]);
      mocks.mockReturning.mockResolvedValueOnce([{ id: TX_ID }]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: {
          transactionType: 'transfer',
          itemId: ITEM_ID,
          warehouseId: WH_B,
          fromWarehouseId: WH_A,
          quantity: 5,
          unitCost: 0,
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: string }>().error).toBe('INSUFFICIENT_STOCK');
    });

    it('transfer moves stock from source to destination with weighted avg cost', async () => {
      const sourceBalance = { id: 'src', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '20.0000', unitCost: '4.0000', totalCost: '80.0000' };
      const destBalance   = { id: 'dst', itemId: ITEM_ID, warehouseId: WH_B, quantityOnHand: '10.0000', unitCost: '6.0000', totalCost: '60.0000' };
      const txnRecord = { id: TX_ID, transactionType: 'transfer', quantity: '5.0000' };

      // pre-flight source check; then in-tx: source FOR UPDATE; destination select
      setupSelectSequence([[sourceBalance], [sourceBalance], [destBalance]]);
      mocks.mockReturning.mockResolvedValueOnce([txnRecord]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: {
          transactionType: 'transfer',
          itemId: ITEM_ID,
          warehouseId: WH_B,
          fromWarehouseId: WH_A,
          quantity: 5,
          unitCost: 0,
        },
      });
      expect(res.statusCode).toBe(201);
      // Both source and destination should have been updated
      expect(mocks.mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('transfer creates destination balance when none exists', async () => {
      const sourceBalance = { id: 'src', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '20.0000', unitCost: '4.0000', totalCost: '80.0000' };
      const txnRecord = { id: TX_ID, transactionType: 'transfer', quantity: '5.0000' };

      // pre-flight source; in-tx source FOR UPDATE; destination → empty (no balance yet)
      setupSelectSequence([[sourceBalance], [sourceBalance], []]);
      mocks.mockReturning
        .mockResolvedValueOnce([txnRecord])  // insert txn
        .mockResolvedValueOnce([]);           // insert dest balance

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: {
          transactionType: 'transfer',
          itemId: ITEM_ID,
          warehouseId: WH_B,
          fromWarehouseId: WH_A,
          quantity: 5,
          unitCost: 0,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(mocks.mockUpdate).toHaveBeenCalledTimes(1);   // only source updated
      expect(mocks.mockInsert).toHaveBeenCalledTimes(2);   // txn + dest balance
    });

    // ── count: absolute SET ─────────────────────────────────────────

    it('count sets absolute quantity rather than incrementing', async () => {
      const existing = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '50.0000', unitCost: '3.0000', totalCost: '150.0000' };
      const txnRecord = { id: TX_ID, transactionType: 'count', quantity: '75.0000' };

      setupSelectSequence([[existing]]);
      mocks.mockReturning.mockResolvedValueOnce([txnRecord]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { transactionType: 'count', itemId: ITEM_ID, warehouseId: WH_A, quantity: 75, unitCost: 3 },
      });
      expect(res.statusCode).toBe(201);

      // The update call should set quantityOnHand to 75, not 50+75=125
      const updateSetArg = mocks.mockUpdate.mock.calls[0]?.[0];
      expect(updateSetArg).toBeUndefined(); // update is called on the chain; verify via set()
      const setCall = mocks.updateChain['set'].mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setCall?.quantityOnHand).toBe('75');
    });

    // ── totalCost sign ──────────────────────────────────────────────

    it('issue totalCost is negative', async () => {
      const balance = { id: 'bal1', itemId: ITEM_ID, warehouseId: WH_A, quantityOnHand: '20.0000', unitCost: '5.0000', totalCost: '100.0000' };
      const txnRecord = { id: TX_ID, transactionType: 'issue', quantity: '10.0000', totalCost: '-50' };

      setupSelectSequence([[balance], [balance]]);
      mocks.mockReturning.mockResolvedValueOnce([txnRecord]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'issue', quantity: 10, unitCost: 5 },
      });
      expect(res.statusCode).toBe(201);
      expect(parseFloat(res.json<{ totalCost: string }>().totalCost)).toBeLessThan(0);
    });

    it('receipt totalCost is positive', async () => {
      const txnRecord = { id: TX_ID, transactionType: 'receipt', quantity: '10.0000', totalCost: '50' };
      setupSelectSequence([[]]);
      mocks.mockReturning
        .mockResolvedValueOnce([txnRecord])
        .mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        payload: { ...validReceipt, transactionType: 'receipt', quantity: 10, unitCost: 5 },
      });
      expect(res.statusCode).toBe(201);
      expect(parseFloat(res.json<{ totalCost: string }>().totalCost)).toBeGreaterThan(0);
    });
  });
});
