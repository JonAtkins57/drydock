import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Queue-based DB mock ──────────────────────────────────────────
// Every terminal DB call (select chain, insert chain, update chain)
// pops the next value from the queue.
const queryQueue: unknown[] = [];
const mockSet = vi.fn();

function enqueue(...values: unknown[]) {
  queryQueue.push(...values);
}

function dequeue(): unknown {
  return queryQueue.shift();
}

// Build a thenable chain so `await db.select().from().where().limit()`
// works regardless of which chain methods are called.
function chainable(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  const methods = ['from', 'where', 'limit', 'orderBy', 'offset', 'returning', 'values'];
  for (const m of methods) {
    self[m] = (..._args: unknown[]) => chainable();
  }
  // Make it thenable — when awaited, dequeue
  self['then'] = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    try {
      resolve(dequeue());
    } catch (e) {
      reject(e);
    }
  };
  return self;
}

function setChainable(): Record<string, unknown> {
  return {
    set: (...args: unknown[]) => {
      mockSet(...args);
      return chainable();
    },
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
  },
  pool: { connect: vi.fn() },
}));

vi.mock('../../src/db/schema/index.js', () => ({
  customFieldDefinitions: {
    id: 'id', tenantId: 'tenant_id', entityType: 'entity_type',
    fieldKey: 'field_key', displayName: 'display_name', dataType: 'data_type',
    isRequired: 'is_required', defaultValue: 'default_value', defaultSource: 'default_source',
    validationRules: 'validation_rules', fieldGroup: 'field_group', sortOrder: 'sort_order',
    helpText: 'help_text', isActive: 'is_active', effectiveFrom: 'effective_from',
    effectiveTo: 'effective_to', securityConfig: 'security_config',
    glPostingBehavior: 'gl_posting_behavior', createdAt: 'created_at',
    updatedAt: 'updated_at', createdBy: 'created_by', updatedBy: 'updated_by',
  },
  customFieldValues: {
    id: 'id', tenantId: 'tenant_id', entityType: 'entity_type',
    entityId: 'entity_id', fieldDefinitionId: 'field_definition_id',
    valueText: 'value_text', valueNumeric: 'value_numeric', valueDate: 'value_date',
    valueBoolean: 'value_boolean', valueJson: 'value_json',
    createdAt: 'created_at', updatedAt: 'updated_at',
    createdBy: 'created_by', updatedBy: 'updated_by',
  },
  picklistDefinitions: {
    id: 'id', tenantId: 'tenant_id', listKey: 'list_key',
    displayName: 'display_name', isActive: 'is_active',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  picklistValues: {
    id: 'id', tenantId: 'tenant_id', picklistId: 'picklist_id',
    valueKey: 'value_key', displayValue: 'display_value',
    sortOrder: 'sort_order', isDefault: 'is_default', isActive: 'is_active',
    createdAt: 'created_at', updatedAt: 'updated_at',
  },
  numberingSequences: {
    tenantId: 'tenant_id', entityType: 'entity_type', currentValue: 'current_value',
  },
}));

import {
  createFieldDefinition,
  getFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  deactivateFieldDefinition,
  getFieldValues,
  setFieldValue,
  setFieldValues,
} from '../../src/core/custom-fields.service.js';

import {
  createPicklist,
  getPicklist,
  listPicklists,
  updatePicklist,
  addPicklistValue,
  updatePicklistValue,
  deactivatePicklistValue,
} from '../../src/core/picklists.service.js';

const TENANT = '550e8400-e29b-41d4-a716-446655440001';
const FIELD_ID = '550e8400-e29b-41d4-a716-446655440010';
const ENTITY_ID = '550e8400-e29b-41d4-a716-446655440020';
const PICKLIST_ID = '550e8400-e29b-41d4-a716-446655440030';
const VALUE_ID = '550e8400-e29b-41d4-a716-446655440040';

describe('Custom Fields Service', () => {
  beforeEach(() => {
    queryQueue.length = 0;
    mockSet.mockClear();
  });

  describe('createFieldDefinition', () => {
    it('creates a valid field definition', async () => {
      // duplicate check — no match
      enqueue([]);
      // insert returning
      const row = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact',
        fieldKey: 'favorite_color', displayName: 'Favorite Color',
        dataType: 'text', isRequired: false, sortOrder: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };
      enqueue([row]);

      const result = await createFieldDefinition(TENANT, {
        entityType: 'contact',
        fieldKey: 'favorite_color',
        displayName: 'Favorite Color',
        dataType: 'text',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fieldKey).toBe('favorite_color');
        expect(result.value.dataType).toBe('text');
      }
    });

    it('rejects invalid fieldKey format', async () => {
      const result = await createFieldDefinition(TENANT, {
        entityType: 'contact',
        fieldKey: 'Invalid-Key!',
        displayName: 'Bad Key',
        dataType: 'text',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });

    it('rejects duplicate fieldKey within tenant+entityType', async () => {
      enqueue([{ id: 'existing' }]);

      const result = await createFieldDefinition(TENANT, {
        entityType: 'contact',
        fieldKey: 'existing_field',
        displayName: 'Duplicate',
        dataType: 'text',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    });

    it('rejects invalid dataType', async () => {
      const result = await createFieldDefinition(TENANT, {
        entityType: 'contact',
        fieldKey: 'test_field',
        displayName: 'Test',
        dataType: 'invalid_type' as 'text',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });
  });

  describe('getFieldDefinition', () => {
    it('returns definition when found', async () => {
      const row = { id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'test', displayName: 'Test', dataType: 'text', isActive: true };
      enqueue([row]);

      const result = await getFieldDefinition(TENANT, FIELD_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.id).toBe(FIELD_ID);
    });

    it('returns NOT_FOUND for missing definition', async () => {
      enqueue([]);

      const result = await getFieldDefinition(TENANT, FIELD_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('listFieldDefinitions', () => {
    it('returns paginated results', async () => {
      // count query
      enqueue([{ count: 3 }]);
      // data query
      enqueue([{ id: '1', fieldKey: 'a' }, { id: '2', fieldKey: 'b' }]);

      const result = await listFieldDefinitions(TENANT, 'contact', { page: 1, pageSize: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.page).toBe(1);
        expect(result.value.pageSize).toBe(2);
        expect(result.value.total).toBe(3);
        expect(result.value.data).toHaveLength(2);
      }
    });
  });

  describe('updateFieldDefinition', () => {
    it('updates display name', async () => {
      const existing = { id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'test', displayName: 'Old', dataType: 'text', isActive: true };
      // getFieldDefinition
      enqueue([existing]);
      // update returning
      enqueue([{ ...existing, displayName: 'New Name' }]);

      const result = await updateFieldDefinition(TENANT, FIELD_ID, { displayName: 'New Name' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.displayName).toBe('New Name');
    });

    it('returns NOT_FOUND for missing definition', async () => {
      enqueue([]);

      const result = await updateFieldDefinition(TENANT, FIELD_ID, { displayName: 'Whatever' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('deactivateFieldDefinition', () => {
    it('sets isActive to false', async () => {
      const existing = { id: FIELD_ID, tenantId: TENANT, isActive: true };
      // getFieldDefinition
      enqueue([existing]);
      // update returning
      enqueue([{ ...existing, isActive: false }]);

      const result = await deactivateFieldDefinition(TENANT, FIELD_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.isActive).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });
});

describe('Custom Field Values', () => {
  beforeEach(() => {
    queryQueue.length = 0;
    mockSet.mockClear();
  });

  describe('setFieldValue — type validation', () => {
    it('accepts string value for text field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'name',
        displayName: 'Name', dataType: 'text', isRequired: false, validationRules: null,
      };
      // getFieldDefinition
      enqueue([def]);
      // upsert check — no existing
      enqueue([]);
      // insert returning
      const val = {
        id: VALUE_ID, tenantId: TENANT, entityType: 'contact', entityId: ENTITY_ID,
        fieldDefinitionId: FIELD_ID, valueText: 'hello', valueNumeric: null,
        valueDate: null, valueBoolean: null, valueJson: null,
      };
      enqueue([val]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'hello');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.valueText).toBe('hello');
    });

    it('rejects string value for numeric field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'age',
        displayName: 'Age', dataType: 'numeric', isRequired: false, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'not-a-number');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('numeric');
      }
    });

    it('rejects non-boolean value for boolean field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'active',
        displayName: 'Active', dataType: 'boolean', isRequired: false, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'yes');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('boolean');
      }
    });

    it('rejects invalid date value for date field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'birthday',
        displayName: 'Birthday', dataType: 'date', isRequired: false, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'not-a-date');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('date');
      }
    });

    it('rejects entity type mismatch', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'invoice', fieldKey: 'notes',
        displayName: 'Notes', dataType: 'text', isRequired: false, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'some text');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('invoice');
      }
    });
  });

  describe('setFieldValue — required field validation', () => {
    it('rejects null value for required field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'email',
        displayName: 'Email', dataType: 'text', isRequired: true, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('required');
      }
    });

    it('rejects empty string for required field', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'email',
        displayName: 'Email', dataType: 'text', isRequired: true, validationRules: null,
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, '');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('required');
      }
    });
  });

  describe('setFieldValue — validation rules', () => {
    it('enforces minLength on text fields', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'code',
        displayName: 'Code', dataType: 'text', isRequired: false,
        validationRules: { minLength: 5 },
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'abc');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('at least 5');
      }
    });

    it('enforces numeric min/max', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'score',
        displayName: 'Score', dataType: 'numeric', isRequired: false,
        validationRules: { min: 0, max: 100 },
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 150);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('<= 100');
      }
    });

    it('enforces pattern on text fields', async () => {
      const def = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'zip',
        displayName: 'ZIP Code', dataType: 'text', isRequired: false,
        validationRules: { pattern: '^\\d{5}$' },
      };
      enqueue([def]);

      const result = await setFieldValue(TENANT, 'contact', ENTITY_ID, FIELD_ID, 'ABCDE');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION');
        expect(result.error.message).toContain('pattern');
      }
    });
  });

  describe('setFieldValues — bulk', () => {
    it('stops on first validation error', async () => {
      // First field: text — succeeds
      const textDef = {
        id: FIELD_ID, tenantId: TENANT, entityType: 'contact', fieldKey: 'name',
        displayName: 'Name', dataType: 'text', isRequired: false, validationRules: null,
      };
      enqueue([textDef]); // getFieldDefinition for first field
      enqueue([]); // upsert check — no existing
      enqueue([{ id: '1', valueText: 'hello' }]); // insert returning

      // Second field: numeric — will fail with non-numeric string
      const numId = '550e8400-e29b-41d4-a716-446655440099';
      const numDef = {
        id: numId, tenantId: TENANT, entityType: 'contact', fieldKey: 'age',
        displayName: 'Age', dataType: 'numeric', isRequired: false, validationRules: null,
      };
      enqueue([numDef]); // getFieldDefinition for second field

      const result = await setFieldValues(TENANT, 'contact', ENTITY_ID, [
        { fieldDefinitionId: FIELD_ID, value: 'hello' },
        { fieldDefinitionId: numId, value: 'not-a-number' },
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });
  });

  describe('getFieldValues', () => {
    it('returns all values for an entity', async () => {
      enqueue([
        { id: '1', fieldDefinitionId: FIELD_ID, valueText: 'hello', valueNumeric: null },
        { id: '2', fieldDefinitionId: '999', valueText: null, valueNumeric: 42 },
      ]);

      const result = await getFieldValues(TENANT, 'contact', ENTITY_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });
  });
});

describe('Picklists Service', () => {
  beforeEach(() => {
    queryQueue.length = 0;
    mockSet.mockClear();
  });

  describe('createPicklist', () => {
    it('creates a valid picklist', async () => {
      enqueue([]); // no duplicate
      const row = {
        id: PICKLIST_ID, tenantId: TENANT, listKey: 'payment_terms',
        displayName: 'Payment Terms', isActive: true, createdAt: new Date(), updatedAt: new Date(),
      };
      enqueue([row]); // insert returning

      const result = await createPicklist(TENANT, { listKey: 'payment_terms', displayName: 'Payment Terms' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.listKey).toBe('payment_terms');
    });

    it('rejects duplicate listKey', async () => {
      enqueue([{ id: 'existing' }]);

      const result = await createPicklist(TENANT, { listKey: 'duplicate_key', displayName: 'Dup' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    });

    it('rejects invalid listKey format', async () => {
      const result = await createPicklist(TENANT, { listKey: 'Invalid-Key', displayName: 'Bad' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });
  });

  describe('getPicklist', () => {
    it('returns picklist with values', async () => {
      const pl = {
        id: PICKLIST_ID, tenantId: TENANT, listKey: 'colors',
        displayName: 'Colors', isActive: true, createdAt: new Date(), updatedAt: new Date(),
      };
      enqueue([pl]); // picklist lookup
      enqueue([ // values query
        { id: '1', valueKey: 'red', displayValue: 'Red', sortOrder: 0 },
        { id: '2', valueKey: 'blue', displayValue: 'Blue', sortOrder: 1 },
      ]);

      const result = await getPicklist(TENANT, PICKLIST_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.listKey).toBe('colors');
        expect(result.value.values).toHaveLength(2);
      }
    });

    it('returns NOT_FOUND for missing picklist', async () => {
      enqueue([]);

      const result = await getPicklist(TENANT, PICKLIST_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('listPicklists', () => {
    it('returns all picklists for tenant', async () => {
      enqueue([
        { id: '1', listKey: 'a', displayName: 'A' },
        { id: '2', listKey: 'b', displayName: 'B' },
      ]);

      const result = await listPicklists(TENANT);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });
  });

  describe('updatePicklist', () => {
    it('updates display name', async () => {
      enqueue([{ id: PICKLIST_ID }]); // exists check
      const updated = {
        id: PICKLIST_ID, tenantId: TENANT, listKey: 'colors',
        displayName: 'Updated Colors', isActive: true,
      };
      enqueue([updated]); // update returning

      const result = await updatePicklist(TENANT, PICKLIST_ID, { displayName: 'Updated Colors' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.displayName).toBe('Updated Colors');
    });

    it('returns NOT_FOUND for missing picklist', async () => {
      enqueue([]); // not found

      const result = await updatePicklist(TENANT, PICKLIST_ID, { displayName: 'Whatever' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('addPicklistValue', () => {
    it('adds value to existing picklist', async () => {
      enqueue([{ id: PICKLIST_ID }]); // picklist exists
      enqueue([]); // no duplicate value
      const val = {
        id: VALUE_ID, tenantId: TENANT, picklistId: PICKLIST_ID,
        valueKey: 'green', displayValue: 'Green', sortOrder: 0, isDefault: false, isActive: true,
      };
      enqueue([val]); // insert returning

      const result = await addPicklistValue(TENANT, PICKLIST_ID, { valueKey: 'green', displayValue: 'Green' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.valueKey).toBe('green');
    });

    it('rejects duplicate valueKey within picklist', async () => {
      enqueue([{ id: PICKLIST_ID }]); // picklist exists
      enqueue([{ id: 'existing-val' }]); // duplicate found

      const result = await addPicklistValue(TENANT, PICKLIST_ID, { valueKey: 'dup', displayValue: 'Dup' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    });

    it('returns NOT_FOUND for missing picklist', async () => {
      enqueue([]); // not found

      const result = await addPicklistValue(TENANT, 'missing-id', { valueKey: 'x', displayValue: 'X' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('updatePicklistValue', () => {
    it('updates display value', async () => {
      enqueue([{ id: VALUE_ID }]); // exists
      const updated = {
        id: VALUE_ID, tenantId: TENANT, picklistId: PICKLIST_ID,
        valueKey: 'green', displayValue: 'Dark Green', sortOrder: 0, isDefault: false, isActive: true,
      };
      enqueue([updated]); // update returning

      const result = await updatePicklistValue(TENANT, VALUE_ID, { displayValue: 'Dark Green' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.displayValue).toBe('Dark Green');
    });
  });

  describe('deactivatePicklistValue', () => {
    it('sets isActive to false', async () => {
      enqueue([{ id: VALUE_ID }]); // exists
      enqueue([{ id: VALUE_ID, isActive: false }]); // update returning

      const result = await deactivatePicklistValue(TENANT, VALUE_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.isActive).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });

    it('returns NOT_FOUND for missing value', async () => {
      enqueue([]); // not found

      const result = await deactivatePicklistValue(TENANT, 'missing');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });
});
