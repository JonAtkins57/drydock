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
    chain['groupBy'] = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const insertChain = makeChain();
  const selectChain = makeChain();
  const updateChain = makeChain();

  function resetChains() {
    // Re-wire chains after clearAllMocks resets implementations
    for (const chain of [insertChain, selectChain, updateChain]) {
      (chain['values'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['set'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['returning'] as ReturnType<typeof vi.fn>); // shared ref, handled below
      (chain['where'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['from'] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain['limit'] as ReturnType<typeof vi.fn>); // shared ref, handled below
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

// ── Imports (after mocks) ──────────────────────────────────────────

import { leadService } from '../../src/crm/leads.service.js';
import { opportunityService } from '../../src/crm/opportunities.service.js';
import { activityService } from '../../src/crm/activities.service.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const LEAD_ID = '22222222-3333-4444-5555-666666666666';
const OPP_ID = '33333333-4444-5555-6666-777777777777';
const ACTIVITY_ID = '44444444-5555-6666-7777-888888888888';

// ── Helper: setup select for count + data pattern (Promise.all) ────

function setupListMock(countValue: number, dataRows: Record<string, unknown>[]) {
  let callIdx = 0;
  mocks.mockSelect.mockImplementation(() => {
    const idx = callIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain['from'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['orderBy'] = vi.fn().mockReturnValue(chain);
    chain['groupBy'] = vi.fn().mockReturnValue(chain);
    chain['limit'] = vi.fn().mockReturnValue(chain);
    chain['offset'] = vi.fn().mockReturnValue(chain);

    if (idx === 0) {
      chain['then'] = (resolve: (val: unknown) => void) => resolve([{ count: countValue }]);
    } else {
      chain['then'] = (resolve: (val: unknown) => void) => resolve(dataRows);
    }
    return chain;
  });
}

// ════════════════════════════════════════════════════════════════════
// Lead Tests
// ════════════════════════════════════════════════════════════════════

describe('Lead Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createLead', () => {
    it('should create a lead with status new', async () => {
      const mockLead = {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        name: 'Jane Doe',
        email: 'jane@example.com',
        status: 'new',
        createdBy: USER_ID,
      };

      mocks.mockReturning.mockResolvedValueOnce([mockLead]);

      const result = await leadService.createLead(TENANT_ID, {
        name: 'Jane Doe',
        email: 'jane@example.com',
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Jane Doe');
        expect(result.value.status).toBe('new');
      }
      expect(mocks.mockInsert).toHaveBeenCalled();
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          action: 'create',
          entityType: 'lead',
        }),
      );
    });
  });

  describe('getLead', () => {
    it('should return a lead by id', async () => {
      const mockLead = { id: LEAD_ID, tenantId: TENANT_ID, name: 'Jane Doe', status: 'new' };
      mocks.mockLimit.mockResolvedValueOnce([mockLead]);

      const result = await leadService.getLead(TENANT_ID, LEAD_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(LEAD_ID);
      }
    });

    it('should return NOT_FOUND for missing lead', async () => {
      mocks.mockLimit.mockResolvedValueOnce([]);

      const result = await leadService.getLead(TENANT_ID, LEAD_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('updateLead', () => {
    it('should update lead status', async () => {
      const existingLead = { id: LEAD_ID, tenantId: TENANT_ID, name: 'Jane Doe', status: 'new' };
      const updatedLead = { ...existingLead, status: 'contacted' };

      // getLead -> limit
      mocks.mockLimit.mockResolvedValueOnce([existingLead]);
      // update -> returning
      mocks.mockReturning.mockResolvedValueOnce([updatedLead]);

      const result = await leadService.updateLead(TENANT_ID, LEAD_ID, { status: 'contacted' }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('contacted');
      }
    });
  });

  describe('listLeads', () => {
    it('should return paginated leads filtered by status', async () => {
      const mockLeads = [
        { id: LEAD_ID, name: 'Jane Doe', status: 'new' },
      ];
      setupListMock(1, mockLeads);

      const result = await leadService.listLeads(TENANT_ID, {
        page: 1,
        pageSize: 50,
        status: 'new',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.meta.total).toBe(1);
        expect(result.value.meta.page).toBe(1);
      }
    });
  });

  describe('convertToOpportunity', () => {
    it('should convert lead to opportunity', async () => {
      const existingLead = {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        name: 'Jane Doe',
        status: 'qualified',
        convertedOpportunityId: null,
      };

      const mockOpp = {
        id: OPP_ID,
        tenantId: TENANT_ID,
        name: 'Acme Deal',
        leadId: LEAD_ID,
        stage: 'prospecting',
      };

      // getLead -> limit
      mocks.mockLimit.mockResolvedValueOnce([existingLead]);
      // insert opportunity -> returning
      mocks.mockReturning.mockResolvedValueOnce([mockOpp]);

      const result = await leadService.convertToOpportunity(
        TENANT_ID,
        LEAD_ID,
        { name: 'Acme Deal' },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(OPP_ID);
        expect(result.value.leadId).toBe(LEAD_ID);
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'convert',
          entityType: 'lead',
          entityId: LEAD_ID,
        }),
      );
    });

    it('should reject conversion of already-converted lead', async () => {
      const convertedLead = {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        name: 'Jane Doe',
        status: 'converted',
        convertedOpportunityId: OPP_ID,
      };

      // getLead -> limit
      mocks.mockLimit.mockResolvedValueOnce([convertedLead]);

      const result = await leadService.convertToOpportunity(
        TENANT_ID,
        LEAD_ID,
        { name: 'Another Deal' },
        USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Opportunity Tests
// ════════════════════════════════════════════════════════════════════

describe('Opportunity Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createOpportunity', () => {
    it('should create an opportunity', async () => {
      const mockOpp = {
        id: OPP_ID,
        tenantId: TENANT_ID,
        name: 'Big Deal',
        stage: 'prospecting',
        probability: 25,
        expectedAmount: 500000,
      };

      mocks.mockReturning.mockResolvedValueOnce([mockOpp]);

      const result = await opportunityService.createOpportunity(TENANT_ID, {
        name: 'Big Deal',
        probability: 25,
        expectedAmount: 500000,
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Big Deal');
        expect(result.value.expectedAmount).toBe(500000);
      }
    });
  });

  describe('updateOpportunity (stage change)', () => {
    it('should update opportunity stage', async () => {
      const existing = {
        id: OPP_ID,
        tenantId: TENANT_ID,
        name: 'Big Deal',
        stage: 'prospecting',
      };
      const updated = { ...existing, stage: 'qualification' };

      // getOpportunity -> limit
      mocks.mockLimit.mockResolvedValueOnce([existing]);
      // update -> returning
      mocks.mockReturning.mockResolvedValueOnce([updated]);

      const result = await opportunityService.updateOpportunity(
        TENANT_ID,
        OPP_ID,
        { stage: 'qualification' },
        USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stage).toBe('qualification');
      }
    });
  });

  describe('getPipeline', () => {
    it('should group opportunities by stage', async () => {
      const pipelineData = [
        { stage: 'prospecting', count: 3, totalExpectedAmount: 150000 },
        { stage: 'proposal', count: 2, totalExpectedAmount: 400000 },
        { stage: 'closed_won', count: 1, totalExpectedAmount: 200000 },
      ];

      // getPipeline: select().from().where().groupBy() resolves as thenable
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['from'] = vi.fn().mockReturnValue(chain);
      chain['where'] = vi.fn().mockReturnValue(chain);
      chain['groupBy'] = vi.fn().mockReturnValue(chain);
      chain['then'] = (resolve: (val: unknown) => void) => resolve(pipelineData);
      mocks.mockSelect.mockReturnValueOnce(chain);

      const result = await opportunityService.getPipeline(TENANT_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]?.stage).toBe('prospecting');
        expect(result.value[0]?.count).toBe(3);
        expect(result.value[1]?.totalExpectedAmount).toBe(400000);
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// Activity Tests
// ════════════════════════════════════════════════════════════════════

describe('Activity Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetChains();
    mocks.mockInsert.mockReturnValue(mocks.insertChain);
    mocks.mockSelect.mockReturnValue(mocks.selectChain);
    mocks.mockUpdate.mockReturnValue(mocks.updateChain);
    mocks.logAction.mockResolvedValue(undefined);
  });

  describe('createActivity', () => {
    it('should create an activity linked to an entity', async () => {
      const mockActivity = {
        id: ACTIVITY_ID,
        tenantId: TENANT_ID,
        activityType: 'call',
        subject: 'Follow-up call',
        entityType: 'lead',
        entityId: LEAD_ID,
        isCompleted: false,
      };

      mocks.mockReturning.mockResolvedValueOnce([mockActivity]);

      const result = await activityService.createActivity(TENANT_ID, {
        activityType: 'call',
        subject: 'Follow-up call',
        entityType: 'lead',
        entityId: LEAD_ID,
      }, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.activityType).toBe('call');
        expect(result.value.entityType).toBe('lead');
        expect(result.value.entityId).toBe(LEAD_ID);
        expect(result.value.isCompleted).toBe(false);
      }
    });
  });

  describe('completeActivity', () => {
    it('should mark an activity as completed', async () => {
      const existing = {
        id: ACTIVITY_ID,
        tenantId: TENANT_ID,
        activityType: 'task',
        subject: 'Send proposal',
        isCompleted: false,
        completedAt: null,
      };

      const completed = {
        ...existing,
        isCompleted: true,
        completedAt: new Date(),
      };

      // select existing -> limit
      mocks.mockLimit.mockResolvedValueOnce([existing]);
      // update -> returning
      mocks.mockReturning.mockResolvedValueOnce([completed]);

      const result = await activityService.completeActivity(TENANT_ID, ACTIVITY_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isCompleted).toBe(true);
        expect(result.value.completedAt).toBeTruthy();
      }
      expect(mocks.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'complete',
          entityType: 'activity',
          entityId: ACTIVITY_ID,
        }),
      );
    });

    it('should reject completing an already-completed activity', async () => {
      const existing = {
        id: ACTIVITY_ID,
        tenantId: TENANT_ID,
        isCompleted: true,
        completedAt: new Date(),
      };

      // select existing -> limit
      mocks.mockLimit.mockResolvedValueOnce([existing]);

      const result = await activityService.completeActivity(TENANT_ID, ACTIVITY_ID, USER_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });
  });

  describe('listMyActivities', () => {
    it('should return paginated activities for current user', async () => {
      const mockActivities = [
        { id: ACTIVITY_ID, subject: 'Call client', activityType: 'call', isCompleted: false },
      ];
      setupListMock(1, mockActivities);

      const result = await activityService.listMyActivities(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 50,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.data).toHaveLength(1);
        expect(result.value.meta.total).toBe(1);
      }
    });
  });
});
