import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();

  function makeChain() {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['values'] = vi.fn().mockReturnValue(chain);
    chain['set'] = vi.fn().mockReturnValue(chain);
    chain['returning'] = mockReturning;
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  function resetChains() {
    for (const chain of [insertChain, selectChain, updateChain]) {
      for (const key of ['values', 'set', 'where', 'from', 'offset', 'orderBy', 'limit']) {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    }
  }

  return {
    mockReturning,
    insertChain, selectChain, updateChain, resetChains,
    mockInsert: vi.fn().mockReturnValue(insertChain),
    mockSelect: vi.fn().mockReturnValue(selectChain),
    mockUpdate: vi.fn().mockReturnValue(updateChain),
  };
});

vi.mock('../../src/db/connection.js', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import {
  listDocumentTemplates,
  getDocumentTemplate,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  renderTemplate,
} from '../../src/core/document-templates.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const TEMPLATE_ID = '22222222-3333-4444-5555-666666666666';

const mockTemplate = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  templateType: 'invoice',
  name: 'Default Invoice',
  description: 'Standard invoice template',
  htmlContent: '<h1>Invoice {{invoiceNumber}}</h1><p>Total: {{totalAmount}}</p>',
  variables: { invoiceNumber: '', totalAmount: '' },
  isDefault: true,
  isActive: true,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
  updatedBy: USER_ID,
};

describe('listDocumentTemplates', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns all active templates for tenant', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTemplate]);
    const result = await listDocumentTemplates(TENANT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('filters by templateType when provided', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTemplate]);
    const result = await listDocumentTemplates(TENANT_ID, 'invoice');
    expect(result.ok).toBe(true);
  });

  it('returns INTERNAL on DB failure', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB fail'));
    const result = await listDocumentTemplates(TENANT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('getDocumentTemplate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockSelect.mockReturnValue(mocks.selectChain); });

  it('returns template by id', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTemplate]);
    const result = await getDocumentTemplate(TENANT_ID, TEMPLATE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe(TEMPLATE_ID);
  });

  it('returns NOT_FOUND when template does not exist', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await getDocumentTemplate(TENANT_ID, TEMPLATE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('createDocumentTemplate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockInsert.mockReturnValue(mocks.insertChain); });

  it('creates template with all fields', async () => {
    mocks.mockReturning.mockResolvedValueOnce([mockTemplate]);
    const result = await createDocumentTemplate(TENANT_ID, USER_ID, {
      templateType: 'invoice',
      name: 'Default Invoice',
      htmlContent: '<h1>Invoice</h1>',
      isDefault: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.templateType).toBe('invoice');
  });

  it('returns INTERNAL when insert returns no row', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await createDocumentTemplate(TENANT_ID, USER_ID, {
      templateType: 'invoice',
      name: 'x',
      htmlContent: '<p></p>',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('updateDocumentTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
  });

  it('increments version on update', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTemplate]);
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockTemplate, name: 'Updated', version: 2 }]);
    const result = await updateDocumentTemplate(TENANT_ID, USER_ID, TEMPLATE_ID, { name: 'Updated' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.version).toBe(2);
  });

  it('returns NOT_FOUND when template does not exist', async () => {
    (mocks.selectChain['where'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await updateDocumentTemplate(TENANT_ID, USER_ID, TEMPLATE_ID, { name: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('deleteDocumentTemplate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.resetChains(); mocks.mockUpdate.mockReturnValue(mocks.updateChain); });

  it('soft-deletes by setting isActive=false', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{ ...mockTemplate, isActive: false }]);
    const result = await deleteDocumentTemplate(TENANT_ID, TEMPLATE_ID);
    expect(result.ok).toBe(true);
    expect(mocks.mockUpdate).toHaveBeenCalled();
  });

  it('returns NOT_FOUND when template does not exist', async () => {
    mocks.mockReturning.mockResolvedValueOnce([]);
    const result = await deleteDocumentTemplate(TENANT_ID, TEMPLATE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ════════════════════════════════════════════════════════════════════
// renderTemplate — pure function, no DB
// ════════════════════════════════════════════════════════════════════

describe('renderTemplate', () => {
  it('substitutes simple variables', () => {
    const result = renderTemplate(
      '<h1>Invoice {{invoiceNumber}}</h1><p>Total: {{totalAmount}}</p>',
      { invoiceNumber: 'INV-001', totalAmount: '5000' },
    );
    expect(result).toBe('<h1>Invoice INV-001</h1><p>Total: 5000</p>');
  });

  it('substitutes nested dot-path variables', () => {
    const result = renderTemplate('Hello {{customer.name}}', { customer: { name: 'Acme Corp' } });
    expect(result).toBe('Hello Acme Corp');
  });

  it('leaves unknown variables as empty string', () => {
    const result = renderTemplate('Total: {{unknownVar}}', {});
    expect(result).toBe('Total: ');
  });

  it('handles multiple occurrences of same variable', () => {
    const result = renderTemplate('{{name}} — {{name}}', { name: 'DryDock' });
    expect(result).toBe('DryDock — DryDock');
  });
});
