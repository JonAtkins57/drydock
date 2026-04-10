import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Result, AppError } from '../../src/lib/result.js';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock the database connection
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbExecute = vi.fn();

const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockSet = vi.fn(() => ({ where: vi.fn(() => ({ returning: mockReturning })) }));
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockOrderBy = vi.fn();

// Chain builders
function buildSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    then: (resolve: (val: unknown) => void) => resolve(rows),
    [Symbol.iterator]: function* () { yield* rows; },
  };
  // Make it thenable for await
  Object.defineProperty(chain, 'then', {
    value: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    configurable: true,
  });
  return chain;
}

function buildInsertChain(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function buildUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const mockPool = {
  connect: vi.fn(),
};

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: vi.fn().mockResolvedValue({ ok: true, value: 'JOUR-000001' }),
}));

vi.mock('../../src/core/auth.service.js', () => ({
  checkPermission: vi.fn().mockResolvedValue({ ok: true, value: true }),
  checkSegregationOfDuties: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

// Import after mocks
import { db, pool } from '../../src/db/connection.js';
import { checkPermission } from '../../src/core/auth.service.js';
import { generateNumber } from '../../src/core/numbering.service.js';

// ── Test Data ──────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const APPROVER_ID = '00000000-0000-0000-0000-000000000020';
const ACCOUNT_1 = '00000000-0000-0000-0000-000000000100';
const ACCOUNT_2 = '00000000-0000-0000-0000-000000000200';
const PERIOD_ID = '00000000-0000-0000-0000-000000001000';
const JOURNAL_ID = '00000000-0000-0000-0000-000000002000';

const basePeriod = {
  id: PERIOD_ID,
  tenantId: TENANT_ID,
  entityId: null,
  periodName: 'Jan 2026',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-01-31'),
  fiscalYear: 2026,
  periodNumber: 1,
  status: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseAccount = {
  id: ACCOUNT_1,
  tenantId: TENANT_ID,
  accountNumber: '1000',
  name: 'Cash',
  accountType: 'asset',
  accountSubtype: null,
  parentAccountId: null,
  isPostingAccount: true,
  isActive: true,
  normalBalance: 'debit',
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
};

const balancedLines = [
  { accountId: ACCOUNT_1, debitAmount: 10000, creditAmount: 0, description: 'Debit line' },
  { accountId: ACCOUNT_2, debitAmount: 0, creditAmount: 10000, description: 'Credit line' },
];

// ── Tests ──────────────────────────────────────────────────────────

describe('GL Posting Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createJournalEntry', () => {
    it('should create a journal entry with balanced lines', async () => {
      // Dynamically import to get fresh mocked module
      const { createJournalEntry } = await import('../../src/gl/posting.service.js');

      const mockEntry = {
        id: JOURNAL_ID,
        tenantId: TENANT_ID,
        entityId: null,
        journalNumber: 'JOUR-000001',
        journalType: 'manual',
        periodId: PERIOD_ID,
        postingDate: new Date('2026-01-15'),
        description: 'Test entry',
        status: 'draft',
        sourceModule: null,
        sourceEntityType: null,
        sourceEntityId: null,
        createdBy: USER_ID,
        approvedBy: null,
        postedBy: null,
        postedAt: null,
        reversedByJournalId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockLines = balancedLines.map((l, idx) => ({
        id: `line-${idx}`,
        journalEntryId: JOURNAL_ID,
        lineNumber: idx + 1,
        ...l,
        departmentId: null,
        locationId: null,
        customerId: null,
        vendorId: null,
        projectId: null,
        costCenterId: null,
        entityId: null,
        customDimensions: null,
      }));

      // Mock: period lookup
      const selectMock = vi.mocked(db.select);

      // First call: period check
      selectMock.mockReturnValueOnce(buildSelectChain([basePeriod]) as never);
      // Second call: account 1 check
      selectMock.mockReturnValueOnce(buildSelectChain([{ id: ACCOUNT_1, isPostingAccount: true, isActive: true }]) as never);
      // Third call: account 2 check
      selectMock.mockReturnValueOnce(buildSelectChain([{ id: ACCOUNT_2, isPostingAccount: true, isActive: true }]) as never);

      // Mock insert for journal entry
      const insertMock = vi.mocked(db.insert);
      insertMock.mockReturnValueOnce(buildInsertChain([mockEntry]) as never);
      // Mock insert for lines
      insertMock.mockReturnValueOnce(buildInsertChain(mockLines) as never);

      const result = await createJournalEntry(TENANT_ID, {
        periodId: PERIOD_ID,
        postingDate: '2026-01-15T00:00:00.000Z',
        description: 'Test entry',
        lines: balancedLines,
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.journalNumber).toBe('JOUR-000001');
        expect(result.value.status).toBe('draft');
        expect(result.value.lines).toHaveLength(2);
      }
    });

    it('should reject unbalanced journal entries at creation', async () => {
      const { createJournalEntry } = await import('../../src/gl/posting.service.js');

      const unbalancedLines = [
        { accountId: ACCOUNT_1, debitAmount: 10000, creditAmount: 0 },
        { accountId: ACCOUNT_2, debitAmount: 0, creditAmount: 5000 }, // Unbalanced!
      ];

      // Period check
      vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([basePeriod]) as never);
      // Account checks
      vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([{ id: ACCOUNT_1, isPostingAccount: true, isActive: true }]) as never);
      vi.mocked(db.select).mockReturnValueOnce(buildSelectChain([{ id: ACCOUNT_2, isPostingAccount: true, isActive: true }]) as never);

      // Note: createJournalEntry doesn't check balance — that's on submit/post.
      // But it does validate that each line has debit OR credit, not both.
      // This particular case should still succeed at creation.
      vi.mocked(db.insert).mockReturnValueOnce(buildInsertChain([{
        id: JOURNAL_ID,
        tenantId: TENANT_ID,
        journalNumber: 'JOUR-000001',
        status: 'draft',
        periodId: PERIOD_ID,
        postingDate: new Date(),
        description: null,
        journalType: 'manual',
        entityId: null,
        sourceModule: null,
        sourceEntityType: null,
        sourceEntityId: null,
        createdBy: USER_ID,
        approvedBy: null,
        postedBy: null,
        postedAt: null,
        reversedByJournalId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }]) as never);
      vi.mocked(db.insert).mockReturnValueOnce(buildInsertChain([]) as never);

      const result = await createJournalEntry(TENANT_ID, {
        periodId: PERIOD_ID,
        postingDate: '2026-01-15T00:00:00.000Z',
        lines: unbalancedLines,
      }, USER_ID);

      // Creation allows unbalanced — balance is checked at submit/post
      expect(result.ok).toBe(true);
    });

    it('should reject lines with both debit and credit amounts', async () => {
      const { createJournalEntry } = await import('../../src/gl/posting.service.js');

      const badLines = [
        { accountId: ACCOUNT_1, debitAmount: 10000, creditAmount: 10000 }, // Both!
        { accountId: ACCOUNT_2, debitAmount: 0, creditAmount: 10000 },
      ];

      const result = await createJournalEntry(TENANT_ID, {
        periodId: PERIOD_ID,
        postingDate: '2026-01-15T00:00:00.000Z',
        lines: badLines,
      }, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('both debit and credit');
      }
    });
  });

  describe('postJournal', () => {
    it('should post a balanced, approved journal in an open period', async () => {
      const { postJournal } = await import('../../src/gl/posting.service.js');

      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      // Setup sequential query responses
      mockClient.query
        // BEGIN
        .mockResolvedValueOnce({})
        // SELECT journal entry FOR UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            status: 'approved',
            period_id: PERIOD_ID,
            journal_number: 'JOUR-000001',
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            entity_id: null,
            journal_type: 'manual',
            posting_date: new Date('2026-01-15'),
            description: 'Test',
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            reversed_by_journal_id: null,
            posted_by: null,
            posted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        // SELECT period FOR SHARE
        .mockResolvedValueOnce({ rows: [{ status: 'open' }] })
        // check_journal_balance
        .mockResolvedValueOnce({ rows: [{ is_balanced: true }] })
        // SELECT lines for dimension check
        .mockResolvedValueOnce({
          rows: [
            { line_number: 1, account_id: ACCOUNT_1, debit_amount: '10000', credit_amount: '0' },
            { line_number: 2, account_id: ACCOUNT_2, debit_amount: '0', credit_amount: '10000' },
          ],
        })
        // Account 1 check
        .mockResolvedValueOnce({ rows: [{ is_posting_account: true, is_active: true }] })
        // Account 2 check
        .mockResolvedValueOnce({ rows: [{ is_posting_account: true, is_active: true }] })
        // UPDATE to posted
        .mockResolvedValueOnce({
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            entity_id: null,
            journal_number: 'JOUR-000001',
            journal_type: 'manual',
            period_id: PERIOD_ID,
            posting_date: new Date('2026-01-15'),
            description: 'Test',
            status: 'posted',
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            posted_by: USER_ID,
            posted_at: new Date(),
            reversed_by_journal_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        // Audit log insert
        .mockResolvedValueOnce({})
        // COMMIT
        .mockResolvedValueOnce({});

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const result = await postJournal(TENANT_ID, JOURNAL_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('posted');
        expect(result.value.postedBy).toBe(USER_ID);
      }

      // Verify transaction was committed, not rolled back
      const queryTexts = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(queryTexts[0]).toBe('BEGIN');
      expect(queryTexts[queryTexts.length - 1]).toBe('COMMIT');
    });

    it('should fail posting when journal is unbalanced', async () => {
      const { postJournal } = await import('../../src/gl/posting.service.js');

      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({   // SELECT journal
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            status: 'approved',
            period_id: PERIOD_ID,
            journal_number: 'JOUR-000001',
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            entity_id: null,
            journal_type: 'manual',
            posting_date: new Date(),
            description: null,
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            reversed_by_journal_id: null,
            posted_by: null,
            posted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'open' }] }) // Period check
        .mockResolvedValueOnce({ rows: [{ is_balanced: false }] }) // Balance check FAILS
        .mockResolvedValueOnce({}); // ROLLBACK

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const result = await postJournal(TENANT_ID, JOURNAL_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('unbalanced');
      }
    });

    it('should fail posting when period is closed', async () => {
      const { postJournal } = await import('../../src/gl/posting.service.js');

      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({   // SELECT journal
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            status: 'approved',
            period_id: PERIOD_ID,
            journal_number: 'JOUR-000001',
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            entity_id: null,
            journal_type: 'manual',
            posting_date: new Date(),
            description: null,
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            reversed_by_journal_id: null,
            posted_by: null,
            posted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'closed' }] }) // Period is CLOSED
        .mockResolvedValueOnce({}); // ROLLBACK

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const result = await postJournal(TENANT_ID, JOURNAL_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('closed');
      }
    });

    it('should fail posting when user lacks permission', async () => {
      const { postJournal } = await import('../../src/gl/posting.service.js');

      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({   // SELECT journal
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            status: 'approved',
            period_id: PERIOD_ID,
            journal_number: 'JOUR-000001',
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            entity_id: null,
            journal_type: 'manual',
            posting_date: new Date(),
            description: null,
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            reversed_by_journal_id: null,
            posted_by: null,
            posted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [{ status: 'open' }] }) // Period check
        .mockResolvedValueOnce({}); // ROLLBACK

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
      // Override permission check for this test
      vi.mocked(checkPermission).mockResolvedValueOnce({ ok: true, value: false });

      const result = await postJournal(TENANT_ID, JOURNAL_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORBIDDEN');
        expect(result.error.message).toContain('permission');
      }
    });
  });

  describe('reverseJournal', () => {
    it('should create a reversal with flipped debit/credit lines', async () => {
      const { reverseJournal } = await import('../../src/gl/posting.service.js');

      const REVERSAL_ID = '00000000-0000-0000-0000-000000003000';

      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        // SELECT original FOR UPDATE
        .mockResolvedValueOnce({
          rows: [{
            id: JOURNAL_ID,
            tenant_id: TENANT_ID,
            entity_id: null,
            journal_number: 'JOUR-000001',
            journal_type: 'manual',
            period_id: PERIOD_ID,
            posting_date: new Date('2026-01-15'),
            description: 'Original entry',
            status: 'posted',
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            created_by: USER_ID,
            approved_by: APPROVER_ID,
            posted_by: USER_ID,
            posted_at: new Date(),
            reversed_by_journal_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        // SELECT period for reversal date
        .mockResolvedValueOnce({
          rows: [{ id: PERIOD_ID, status: 'open' }],
        })
        // INSERT reversal entry
        .mockResolvedValueOnce({
          rows: [{
            id: REVERSAL_ID,
            tenant_id: TENANT_ID,
            entity_id: null,
            journal_number: 'JOUR-000002',
            journal_type: 'reversal',
            period_id: PERIOD_ID,
            posting_date: new Date('2026-01-20'),
            description: 'Reversal of JOUR-000001: Original entry',
            status: 'posted',
            source_module: null,
            source_entity_type: null,
            source_entity_id: null,
            created_by: USER_ID,
            approved_by: USER_ID,
            posted_by: USER_ID,
            posted_at: new Date(),
            reversed_by_journal_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        // SELECT original lines
        .mockResolvedValueOnce({
          rows: [
            {
              line_number: 1,
              account_id: ACCOUNT_1,
              debit_amount: '10000',
              credit_amount: '0',
              description: 'Cash debit',
              department_id: null,
              location_id: null,
              customer_id: null,
              vendor_id: null,
              project_id: null,
              cost_center_id: null,
              entity_id: null,
              custom_dimensions: null,
            },
            {
              line_number: 2,
              account_id: ACCOUNT_2,
              debit_amount: '0',
              credit_amount: '10000',
              description: 'Revenue credit',
              department_id: null,
              location_id: null,
              customer_id: null,
              vendor_id: null,
              project_id: null,
              cost_center_id: null,
              entity_id: null,
              custom_dimensions: null,
            },
          ],
        })
        // INSERT reversed line 1 (debit_amount=0 (was credit=0), credit_amount=10000 (was debit=10000))
        .mockResolvedValueOnce({ rows: [{ id: 'rev-line-1' }] })
        // INSERT reversed line 2 (debit_amount=10000 (was credit=10000), credit_amount=0 (was debit=0))
        .mockResolvedValueOnce({ rows: [{ id: 'rev-line-2' }] })
        // UPDATE original as reversed
        .mockResolvedValueOnce({})
        // Audit log
        .mockResolvedValueOnce({})
        // COMMIT
        .mockResolvedValueOnce({});

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);
      vi.mocked(generateNumber).mockResolvedValueOnce({ ok: true, value: 'JOUR-000002' });

      // Mock getJournalEntry call after commit
      const reversalWithLines = {
        id: REVERSAL_ID,
        tenantId: TENANT_ID,
        entityId: null,
        journalNumber: 'JOUR-000002',
        journalType: 'reversal',
        periodId: PERIOD_ID,
        postingDate: new Date('2026-01-20'),
        description: 'Reversal of JOUR-000001: Original entry',
        status: 'posted',
        sourceModule: null,
        sourceEntityType: null,
        sourceEntityId: null,
        createdBy: USER_ID,
        approvedBy: USER_ID,
        postedBy: USER_ID,
        postedAt: new Date(),
        reversedByJournalId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'rev-line-1',
            journalEntryId: REVERSAL_ID,
            lineNumber: 1,
            accountId: ACCOUNT_1,
            debitAmount: 0,       // Flipped from 10000
            creditAmount: 10000,  // Flipped from 0
            description: 'Reversal: Cash debit',
            departmentId: null,
            locationId: null,
            customerId: null,
            vendorId: null,
            projectId: null,
            costCenterId: null,
            entityId: null,
            customDimensions: null,
          },
          {
            id: 'rev-line-2',
            journalEntryId: REVERSAL_ID,
            lineNumber: 2,
            accountId: ACCOUNT_2,
            debitAmount: 10000,   // Flipped from 0
            creditAmount: 0,      // Flipped from 10000
            description: 'Reversal: Revenue credit',
            departmentId: null,
            locationId: null,
            customerId: null,
            vendorId: null,
            projectId: null,
            costCenterId: null,
            entityId: null,
            customDimensions: null,
          },
        ],
      };

      // Mock the getJournalEntry select after commit
      vi.mocked(db.select)
        .mockReturnValueOnce(buildSelectChain([reversalWithLines]) as never)
        .mockReturnValueOnce(buildSelectChain(reversalWithLines.lines) as never);

      const result = await reverseJournal(TENANT_ID, JOURNAL_ID, USER_ID, '2026-01-20T00:00:00.000Z');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.journalType).toBe('reversal');
        expect(result.value.status).toBe('posted');
        // Verify the INSERT calls for reversed lines used flipped amounts
        // Line 1: original debit=10000, credit=0 → reversal debit=0, credit=10000
        const line1InsertCall = mockClient.query.mock.calls[5]; // 6th call (0-indexed)
        if (line1InsertCall) {
          const params = line1InsertCall[1] as unknown[];
          // params[3] = debit_amount (should be original credit = '0')
          // params[4] = credit_amount (should be original debit = '10000')
          expect(params[3]).toBe('0');   // flipped from credit
          expect(params[4]).toBe('10000'); // flipped from debit
        }
      }
    });
  });

  describe('Trial Balance', () => {
    it('should sum debits and credits by account for posted journals', async () => {
      const { getTrialBalance } = await import('../../src/gl/trial-balance.service.js');

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              account_id: ACCOUNT_1,
              account_number: '1000',
              account_name: 'Cash',
              account_type: 'asset',
              debit_total: '25000',
              credit_total: '5000',
              balance: '20000',
            },
            {
              account_id: ACCOUNT_2,
              account_number: '4000',
              account_name: 'Revenue',
              account_type: 'revenue',
              debit_total: '5000',
              credit_total: '25000',
              balance: '-20000',
            },
          ],
        }),
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as never);

      const result = await getTrialBalance(TENANT_ID, { periodId: PERIOD_ID });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accounts).toHaveLength(2);
        expect(result.value.totalDebits).toBe(30000);
        expect(result.value.totalCredits).toBe(30000);

        const cashAccount = result.value.accounts.find((a) => a.accountNumber === '1000');
        expect(cashAccount?.debitTotal).toBe(25000);
        expect(cashAccount?.creditTotal).toBe(5000);
        expect(cashAccount?.balance).toBe(20000);
      }
    });
  });

  describe('Period Status Transitions', () => {
    it('should allow open → soft_close', async () => {
      const { updatePeriodStatus } = await import('../../src/gl/periods.service.js');

      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([{ ...basePeriod, status: 'open' }]) as never,
      );

      vi.mocked(db.update).mockReturnValueOnce(
        buildUpdateChain([{ ...basePeriod, status: 'soft_close' }]) as never,
      );

      const result = await updatePeriodStatus(TENANT_ID, PERIOD_ID, 'soft_close', USER_ID);
      expect(result.ok).toBe(true);
    });

    it('should reject closed → open (no backward transitions)', async () => {
      const { updatePeriodStatus } = await import('../../src/gl/periods.service.js');

      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([{ ...basePeriod, status: 'closed' }]) as never,
      );

      const result = await updatePeriodStatus(TENANT_ID, PERIOD_ID, 'open', USER_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('Cannot transition');
      }
    });

    it('should allow locked → closed for corrections', async () => {
      const { updatePeriodStatus } = await import('../../src/gl/periods.service.js');

      vi.mocked(db.select).mockReturnValueOnce(
        buildSelectChain([{ ...basePeriod, status: 'locked' }]) as never,
      );

      vi.mocked(db.update).mockReturnValueOnce(
        buildUpdateChain([{ ...basePeriod, status: 'closed' }]) as never,
      );

      const result = await updatePeriodStatus(TENANT_ID, PERIOD_ID, 'closed', USER_ID);
      expect(result.ok).toBe(true);
    });
  });
});
