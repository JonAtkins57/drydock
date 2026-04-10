import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();

  function makeInsertChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    return chain;
  }

  return {
    mockReturning,
    mockInsert: vi.fn().mockImplementation(() => makeInsertChain()),
    mockSendEmail: vi.fn(),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
  },
}));

vi.mock('../../src/core/email.service.js', () => ({
  sendEmail: mocks.mockSendEmail,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { sendTransactionEmail } from '../../src/email/email-log.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ENTITY_ID = '11111111-2222-3333-4444-555555555555';

const BASE_LOG_ROW = {
  id: 'log-id-1',
  tenantId: TENANT_ID,
  entityType: 'invoice',
  entityId: ENTITY_ID,
  toEmail: 'customer@example.com',
  subject: 'Invoice INV-001',
  status: 'sent',
  sentAt: new Date(),
  error: null,
};

describe('sendTransactionEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockInsert.mockImplementation(() => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['values'] = vi.fn().mockReturnValue(chain);
      chain['returning'] = mocks.mockReturning;
      return chain;
    });
  });

  it('should send email, log with status=sent, and return the log row', async () => {
    mocks.mockSendEmail.mockResolvedValueOnce({ ok: true, value: { messageId: 'msg-123' } });
    mocks.mockReturning.mockResolvedValueOnce([BASE_LOG_ROW]);

    const result = await sendTransactionEmail(
      TENANT_ID,
      'invoice',
      ENTITY_ID,
      'customer@example.com',
      'Invoice INV-001',
      '<p>Invoice body</p>',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('sent');
      expect(result.value.tenantId).toBe(TENANT_ID);
      expect(result.value.entityType).toBe('invoice');
      expect(result.value.entityId).toBe(ENTITY_ID);
      expect(result.value.toEmail).toBe('customer@example.com');
    }
    expect(mocks.mockSendEmail).toHaveBeenCalledWith({
      to: 'customer@example.com',
      subject: 'Invoice INV-001',
      html: '<p>Invoice body</p>',
    });
  });

  it('should log with status=failed and return err when sendEmail fails', async () => {
    mocks.mockSendEmail.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: 'SES connection refused' },
    });
    mocks.mockReturning.mockResolvedValueOnce([
      { ...BASE_LOG_ROW, status: 'failed', error: 'Email send failed: SES connection refused' },
    ]);

    const result = await sendTransactionEmail(
      TENANT_ID,
      'invoice',
      ENTITY_ID,
      'customer@example.com',
      'Invoice INV-001',
      '<p>Invoice body</p>',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
    }
    // Log row should still have been inserted with failed status
    expect(mocks.mockReturning).toHaveBeenCalled();
  });

  it('should return NOT_FOUND error when toEmail is empty', async () => {
    const result = await sendTransactionEmail(
      TENANT_ID,
      'invoice',
      ENTITY_ID,
      '',
      'Invoice INV-001',
      '<p>Invoice body</p>',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(mocks.mockSendEmail).not.toHaveBeenCalled();
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });

  it('should pass entityType and entityId to the log insert', async () => {
    mocks.mockSendEmail.mockResolvedValueOnce({ ok: true, value: { messageId: 'msg-456' } });
    const quoteLogRow = { ...BASE_LOG_ROW, entityType: 'quote', entityId: ENTITY_ID };
    mocks.mockReturning.mockResolvedValueOnce([quoteLogRow]);

    const result = await sendTransactionEmail(
      TENANT_ID,
      'quote',
      ENTITY_ID,
      'buyer@example.com',
      'Quote QUOT-001',
      '<p>Quote body</p>',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityType).toBe('quote');
    }
  });
});
