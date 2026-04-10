import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

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
    chain['groupBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain]) {
      (chain['values'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['set'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['where'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['from'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['offset'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['orderBy'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['groupBy'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
    mockLimit.mockReturnValue(selectChain);
  }

  return {
    mockReturning,
    mockLimit,
    insertChain,
    selectChain,
    updateChain,
    resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
    logAction: vi.fn().mockResolvedValue(undefined),
    generateNumber: vi.fn(),
    executeQuote: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../../src/core/numbering.service.js', () => ({
  generateNumber: mocks.generateNumber,
}));

vi.mock('../../src/q2c/quotes.service.js', () => ({
  quoteService: {
    executeQuote: mocks.executeQuote,
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { processWebhookEvent, isTerminalEnvelopeStatus } from '../../src/q2c/docusign.service.js';
import { validateDocuSignHmac } from '../../src/integration/docusign.js';

// ── Constants ──────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const QUOTE_ID = '33333333-4444-5555-6666-777777777777';
const ENVELOPE_ID = 'env-11111111-2222-3333-4444-555555555555';

const mockQuote = {
  id: QUOTE_ID,
  tenantId: TENANT_ID,
  quoteNumber: 'QUOT-000001',
  customerId: '22222222-3333-4444-5555-666666666666',
  status: 'sent',
  docusignEnvelopeId: ENVELOPE_ID,
  docusignStatus: 'sent',
  totalAmount: 10000,
  notes: null,
  version: 1,
  lines: [],
};

// ════════════════════════════════════════════════════════════════════
// validateDocuSignHmac
// ════════════════════════════════════════════════════════════════════

describe('validateDocuSignHmac', () => {
  const hmacKey = 'test-secret-key';

  it('returns true for a valid HMAC signature', () => {
    const body = Buffer.from('{"event":"envelope-completed"}');
    const signature = createHmac('sha256', hmacKey).update(body).digest('base64');
    expect(validateDocuSignHmac(body, signature, hmacKey)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const body = Buffer.from('{"event":"envelope-completed"}');
    const tampered = Buffer.from('{"event":"envelope-voided"}');
    const signature = createHmac('sha256', hmacKey).update(body).digest('base64');
    expect(validateDocuSignHmac(tampered, signature, hmacKey)).toBe(false);
  });

  it('returns false for a wrong key', () => {
    const body = Buffer.from('{"event":"envelope-completed"}');
    const signature = createHmac('sha256', hmacKey).update(body).digest('base64');
    expect(validateDocuSignHmac(body, signature, 'wrong-key')).toBe(false);
  });

  it('returns false for an empty signature', () => {
    const body = Buffer.from('{"event":"envelope-completed"}');
    expect(validateDocuSignHmac(body, '', hmacKey)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// isTerminalEnvelopeStatus
// ════════════════════════════════════════════════════════════════════

describe('isTerminalEnvelopeStatus', () => {
  it.each(['completed', 'declined', 'voided'])('returns true for %s', (status) => {
    expect(isTerminalEnvelopeStatus(status)).toBe(true);
  });

  it.each(['sent', 'delivered', 'created', ''])('returns false for %s', (status) => {
    expect(isTerminalEnvelopeStatus(status)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// processWebhookEvent
// ════════════════════════════════════════════════════════════════════

describe('processWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  it('returns VALIDATION error when envelopeId is missing', async () => {
    const result = await processWebhookEvent({
      event: 'envelope-completed',
      data: { envelopeId: '' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('returns NOT_FOUND when no quote matches the envelopeId', async () => {
    mocks.mockLimit.mockResolvedValueOnce([]);

    const result = await processWebhookEvent({
      event: 'envelope-delivered',
      data: { envelopeId: ENVELOPE_ID },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('updates docusignStatus and logs action for non-completed events', async () => {
    mocks.mockLimit.mockResolvedValueOnce([{ ...mockQuote, status: 'sent' }]);
    mocks.mockReturning.mockResolvedValueOnce([]);

    const result = await processWebhookEvent({
      event: 'envelope-delivered',
      data: { envelopeId: ENVELOPE_ID, envelopeSummary: { status: 'delivered' } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.docusignStatus).toBe('delivered');
      expect(result.value.quoteId).toBe(QUOTE_ID);
    }
    expect(mocks.mockUpdate).toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'docusign_webhook', entityId: QUOTE_ID }),
    );
    expect(mocks.executeQuote).not.toHaveBeenCalled();
  });

  it('calls quoteService.executeQuote (not raw update) when envelope completes', async () => {
    mocks.mockLimit.mockResolvedValueOnce([{ ...mockQuote, status: 'sent' }]);
    mocks.mockReturning.mockResolvedValueOnce([]);
    mocks.executeQuote.mockResolvedValueOnce({
      ok: true,
      value: { quote: { ...mockQuote, status: 'executed' }, salesOrder: { id: 'so-1' } },
    });

    const result = await processWebhookEvent({
      event: 'envelope-completed',
      data: { envelopeId: ENVELOPE_ID, envelopeSummary: { status: 'completed' } },
    });

    expect(result.ok).toBe(true);
    expect(mocks.executeQuote).toHaveBeenCalledWith(TENANT_ID, QUOTE_ID, 'system');
    // logAction should NOT be called directly — executeQuote handles audit
    expect(mocks.logAction).not.toHaveBeenCalled();
  });

  it('skips executeQuote for already-executed quotes (idempotent webhook retry)', async () => {
    mocks.mockLimit.mockResolvedValueOnce([{ ...mockQuote, status: 'executed' }]);
    mocks.mockReturning.mockResolvedValueOnce([]);

    const result = await processWebhookEvent({
      event: 'envelope-completed',
      data: { envelopeId: ENVELOPE_ID, envelopeSummary: { status: 'completed' } },
    });

    expect(result.ok).toBe(true);
    // Already executed — executeQuote should NOT be called again
    expect(mocks.executeQuote).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalled();
  });

  it('propagates error from executeQuote if it fails', async () => {
    mocks.mockLimit.mockResolvedValueOnce([{ ...mockQuote, status: 'sent' }]);
    mocks.mockReturning.mockResolvedValueOnce([]);
    mocks.executeQuote.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: 'Failed to create sales order' },
    });

    const result = await processWebhookEvent({
      event: 'envelope-completed',
      data: { envelopeId: ENVELOPE_ID, envelopeSummary: { status: 'completed' } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
  });

  it('handles voided envelope and logs without calling executeQuote', async () => {
    mocks.mockLimit.mockResolvedValueOnce([{ ...mockQuote, status: 'sent' }]);
    mocks.mockReturning.mockResolvedValueOnce([]);

    const result = await processWebhookEvent({
      event: 'envelope-voided',
      data: { envelopeId: ENVELOPE_ID, envelopeSummary: { status: 'voided' } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.docusignStatus).toBe('voided');
    }
    expect(mocks.executeQuote).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalled();
  });
});
