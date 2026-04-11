import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Queue-based DB mock (matches existing test pattern) ─────────────
const queryQueue: unknown[] = [];
const mockSet = vi.fn();

function enqueue(...values: unknown[]) {
  queryQueue.push(...values);
}

function dequeue(): unknown {
  return queryQueue.shift();
}

function chainable(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  const methods = ['from', 'where', 'limit', 'orderBy', 'offset', 'returning', 'values'];
  for (const m of methods) {
    self[m] = (..._args: unknown[]) => chainable();
  }
  self['then'] = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    try {
      resolve(dequeue());
    } catch (e) {
      reject(e);
    }
  };
  return self;
}

function makeTx() {
  return {
    insert: () => ({
      values: () => ({
        returning: () => dequeue(),
      }),
    }),
    select: () => ({
      from: () => chainable(),
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mockSet(...args);
        return chainable();
      },
    }),
  };
}

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: () => dequeue(),
      }),
    }),
    select: () => ({
      from: () => chainable(),
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mockSet(...args);
        return chainable();
      },
    }),
    execute: () => dequeue(),
    transaction: async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => cb(makeTx()),
  },
  pool: { connect: vi.fn() },
}));

vi.mock('../../src/db/schema/index.js', () => ({}));

vi.mock('../../src/db/schema/integration.js', () => ({
  integrationConfigs: {
    id: 'id',
    tenantId: 'tenant_id',
    integrationType: 'integration_type',
    isActive: 'is_active',
    config: 'config',
  },
}));

vi.mock('../../src/db/schema/usage-billing.js', () => ({
  occRateCards: {
    id: 'id',
    tenantId: 'tenant_id',
    name: 'name',
    meterType: 'meter_type',
    unitPriceCents: 'unit_price_cents',
    currency: 'currency',
    description: 'description',
    isActive: 'is_active',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    createdBy: 'created_by',
  },
  occPullRuns: {
    id: 'id',
    tenantId: 'tenant_id',
    integrationConfigId: 'integration_config_id',
    periodStart: 'period_start',
    periodEnd: 'period_end',
    status: 'status',
    rawUsage: 'raw_usage',
    usageSummary: 'usage_summary',
    totalAmountCents: 'total_amount_cents',
    invoiceId: 'invoice_id',
    errorMessage: 'error_message',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    createdBy: 'created_by',
  },
  occUsageLines: {
    id: 'id',
    tenantId: 'tenant_id',
    pullRunId: 'pull_run_id',
    meterType: 'meter_type',
    rateCardId: 'rate_card_id',
    quantity: 'quantity',
    unitPriceCents: 'unit_price_cents',
    totalAmountCents: 'total_amount_cents',
    description: 'description',
    createdAt: 'created_at',
  },
}));

vi.mock('../../src/db/schema/q2c.js', () => ({
  invoices: {
    id: 'id',
    tenantId: 'tenant_id',
    invoiceNumber: 'invoice_number',
    customerId: 'customer_id',
    status: 'status',
    totalAmount: 'total_amount',
    taxAmount: 'tax_amount',
    dueDate: 'due_date',
    notes: 'notes',
    createdBy: 'created_by',
  },
  invoiceLines: {
    id: 'id',
    tenantId: 'tenant_id',
    invoiceId: 'invoice_id',
    lineNumber: 'line_number',
    description: 'description',
    quantity: 'quantity',
    unitPrice: 'unit_price',
    amount: 'amount',
  },
}));

// ── Mock global fetch ───────────────────────────────────────────────
const mockFetch = vi.fn();

import { listRateCards, listPullRuns, pullAndInvoice } from '../../src/integration/occ.service.js';

// ── Constants ───────────────────────────────────────────────────────
const TENANT = '550e8400-e29b-41d4-a716-446655440001';
const CONFIG_ID = '550e8400-e29b-41d4-a716-446655440099';
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440010';
const USER_ID = '550e8400-e29b-41d4-a716-446655440020';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440030';
const INVOICE_ID = '550e8400-e29b-41d4-a716-446655440040';
const RATE_CARD_ID = '550e8400-e29b-41d4-a716-446655440050';

const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-01-31';

const VALID_CONFIG_ROW = {
  id: CONFIG_ID,
  tenantId: TENANT,
  integrationType: 'occ',
  name: 'OCC Test',
  config: {
    baseUrl: 'https://occ.example.com',
    apiKey: 'test-occ-key',
    accountId: 'acct-001',
    drydockCustomerId: CUSTOMER_ID,
  },
  isActive: true,
};

const RATE_CARD = {
  id: RATE_CARD_ID,
  tenantId: TENANT,
  name: 'API Calls',
  meterType: 'api_calls',
  unitPriceCents: 10,
  currency: 'USD',
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const OCC_USAGE_RESPONSE = {
  accountId: 'acct-001',
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  meters: [
    { meterType: 'api_calls', quantity: 500, unit: 'calls' },
  ],
};

describe('OCC Service', () => {
  beforeEach(() => {
    queryQueue.length = 0;
    mockSet.mockClear();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── listRateCards ────────────────────────────────────────────────

  describe('listRateCards', () => {
    it('returns rate cards for tenant', async () => {
      enqueue([RATE_CARD]);

      const result = await listRateCards(TENANT);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].meterType).toBe('api_calls');
        expect(result.value[0].unitPriceCents).toBe(10);
      }
    });

    it('returns empty array when no rate cards', async () => {
      enqueue([]);

      const result = await listRateCards(TENANT);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  // ── listPullRuns ─────────────────────────────────────────────────

  describe('listPullRuns', () => {
    it('returns pull runs ordered by startedAt desc', async () => {
      const run1 = {
        id: RUN_ID,
        tenantId: TENANT,
        integrationConfigId: CONFIG_ID,
        periodStart: new Date(PERIOD_START),
        periodEnd: new Date(PERIOD_END),
        status: 'complete',
        totalAmountCents: 5000,
        invoiceId: INVOICE_ID,
        startedAt: new Date(),
        completedAt: new Date(),
      };
      enqueue([run1]);

      const result = await listPullRuns(TENANT, CONFIG_ID, 50);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].status).toBe('complete');
        expect(result.value[0].totalAmountCents).toBe(5000);
      }
    });

    it('returns empty array when no runs exist', async () => {
      enqueue([]);

      const result = await listPullRuns(TENANT, CONFIG_ID, 50);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  // ── pullAndInvoice ───────────────────────────────────────────────

  describe('pullAndInvoice', () => {
    it('full happy path: fetches usage, rates it, creates invoice', async () => {
      // getOccConfig
      enqueue([VALID_CONFIG_ROW]);
      // insert occPullRuns
      enqueue([{ id: RUN_ID }]);

      // fetch mock — OCC API success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => OCC_USAGE_RESPONSE,
      });

      // rateUsage: select occRateCards
      enqueue([RATE_CARD]);
      // insert occUsageLines (no .returning() — no dequeue needed)
      // insert invoices
      enqueue([{ id: INVOICE_ID }]);
      // insert invoiceLines (no .returning() — no dequeue needed)
      // update occPullRuns (chainable dequeues undefined — queue empty, fine)

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.runId).toBe(RUN_ID);
        expect(result.value.invoiceId).toBe(INVOICE_ID);
      }

      // Verify final update sets status complete and invoiceId
      expect(mockSet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'complete',
          invoiceId: INVOICE_ID,
          totalAmountCents: 5000, // 500 calls * 10 cents
        }),
      );
    });

    it('returns null invoiceId when totalAmount is zero (no matching rate card)', async () => {
      // getOccConfig
      enqueue([VALID_CONFIG_ROW]);
      // insert occPullRuns
      enqueue([{ id: RUN_ID }]);

      // OCC returns usage for unknown meter type
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accountId: 'acct-001',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          meters: [{ meterType: 'unknown_meter', quantity: 100, unit: 'units' }],
        }),
      });

      // rateUsage: no matching rate card
      enqueue([]);
      // insert occUsageLines
      // update occPullRuns (dequeues undefined)

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.runId).toBe(RUN_ID);
        expect(result.value.invoiceId).toBeNull();
      }

      expect(mockSet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'complete',
          invoiceId: null,
          totalAmountCents: 0,
        }),
      );
    });

    it('returns null invoiceId when config has no drydockCustomerId', async () => {
      const configNoCustomer = {
        ...VALID_CONFIG_ROW,
        config: {
          baseUrl: 'https://occ.example.com',
          apiKey: 'test-occ-key',
          accountId: 'acct-001',
          // no drydockCustomerId
        },
      };
      enqueue([configNoCustomer]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => OCC_USAGE_RESPONSE,
      });

      enqueue([RATE_CARD]); // rateUsage
      // insert occUsageLines (no dequeue)
      // no invoice insert because no customerId
      // update occPullRuns (dequeues undefined)

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceId).toBeNull();
      }
    });

    it('returns NOT_FOUND when integration config missing', async () => {
      enqueue([]); // no config

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND when config is inactive', async () => {
      enqueue([]); // inactive config returns no rows

      const result = await pullAndInvoice(TENANT, 'other-config-id', PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns VALIDATION when config missing required fields', async () => {
      const badConfig = {
        ...VALID_CONFIG_ROW,
        config: { baseUrl: 'https://occ.example.com' }, // missing apiKey and accountId
      };
      enqueue([badConfig]);

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });

    it('marks run failed and returns error when OCC API returns non-200', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      // update occPullRuns to failed (dequeues undefined)

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        expect(result.error.message).toContain('503');
      }

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('marks run failed and returns error when fetch throws', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      // update occPullRuns to failed

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        expect(result.error.message).toContain('ECONNREFUSED');
      }

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('marks run failed when OCC returns non-JSON', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Unexpected token'); },
      });

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INTERNAL');
    });

    it('marks run failed when OCC response missing meters array', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accountId: 'acct-001' }), // no meters
      });

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INTERNAL');
        expect(result.error.message).toContain('meters');
      }
    });

    it('handles multiple meter types with mixed rate card matches', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accountId: 'acct-001',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          meters: [
            { meterType: 'api_calls', quantity: 100, unit: 'calls' },
            { meterType: 'storage_gb', quantity: 50, unit: 'GB' },
            { meterType: 'unknown_meter', quantity: 10, unit: 'units' },
          ],
        }),
      });

      const storageCard = {
        ...RATE_CARD,
        id: '550e8400-e29b-41d4-a716-446655440055',
        meterType: 'storage_gb',
        unitPriceCents: 200, // $2/GB
      };
      // rateUsage: two matching cards
      enqueue([RATE_CARD, storageCard]);
      // insert occUsageLines (3 lines)
      // insert invoices
      enqueue([{ id: INVOICE_ID }]);
      // insert invoiceLines
      // update occPullRuns

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceId).toBe(INVOICE_ID);
      }

      // 100*10 + 50*200 + 10*0 = 1000 + 10000 + 0 = 11000 cents
      expect(mockSet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'complete',
          totalAmountCents: 11000,
        }),
      );
    });

    it('skips invoice creation when meters is empty', async () => {
      enqueue([VALID_CONFIG_ROW]);
      enqueue([{ id: RUN_ID }]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          accountId: 'acct-001',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          meters: [],
        }),
      });

      // rateUsage with empty meters — still queries rate cards
      enqueue([RATE_CARD]);
      // no usage lines insert, no invoice insert
      // update occPullRuns

      const result = await pullAndInvoice(TENANT, CONFIG_ID, PERIOD_START, PERIOD_END, USER_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.invoiceId).toBeNull();
      }
    });
  });
});
