import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Test data ──────────────────────────────────────────────────────
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ENTITY_ID = '550e8400-e29b-41d4-a716-446655440003';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440010';
const STATE_DRAFT_ID = '550e8400-e29b-41d4-a716-446655440020';
const STATE_REVIEW_ID = '550e8400-e29b-41d4-a716-446655440021';
const STATE_APPROVED_ID = '550e8400-e29b-41d4-a716-446655440022';
const TRANSITION_SUBMIT_ID = '550e8400-e29b-41d4-a716-446655440030';
const TRANSITION_APPROVE_ID = '550e8400-e29b-41d4-a716-446655440031';
const INSTANCE_ID = '550e8400-e29b-41d4-a716-446655440040';
const STEP_1_ID = '550e8400-e29b-41d4-a716-446655440050';
const STEP_2_ID = '550e8400-e29b-41d4-a716-446655440051';

const now = new Date();

const draftState = {
  id: STATE_DRAFT_ID,
  workflowId: WORKFLOW_ID,
  stateKey: 'draft',
  displayName: 'Draft',
  sortOrder: 0,
  isInitial: true,
  isTerminal: false,
  entryActions: null,
  exitActions: null,
  createdAt: now,
  updatedAt: now,
};

const reviewState = {
  id: STATE_REVIEW_ID,
  workflowId: WORKFLOW_ID,
  stateKey: 'review',
  displayName: 'In Review',
  sortOrder: 1,
  isInitial: false,
  isTerminal: false,
  entryActions: [{ type: 'notify', to: 'reviewer', template: 'needs_review' }],
  exitActions: null,
  createdAt: now,
  updatedAt: now,
};

const approvedState = {
  id: STATE_APPROVED_ID,
  workflowId: WORKFLOW_ID,
  stateKey: 'approved',
  displayName: 'Approved',
  sortOrder: 2,
  isInitial: false,
  isTerminal: true,
  entryActions: [{ type: 'set_field', field: 'status', value: 'approved' }],
  exitActions: null,
  createdAt: now,
  updatedAt: now,
};

const workflowDef = {
  id: WORKFLOW_ID,
  tenantId: TENANT_ID,
  entityType: 'invoice',
  name: 'Invoice Approval',
  description: 'Standard invoice workflow',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const submitTransition = {
  id: TRANSITION_SUBMIT_ID,
  workflowId: WORKFLOW_ID,
  fromStateId: STATE_DRAFT_ID,
  toStateId: STATE_REVIEW_ID,
  transitionKey: 'submit',
  displayName: 'Submit for Review',
  conditions: null,
  requiredPermissions: null,
  actions: null,
  createdAt: now,
  updatedAt: now,
};

const approveTransition = {
  id: TRANSITION_APPROVE_ID,
  workflowId: WORKFLOW_ID,
  fromStateId: STATE_REVIEW_ID,
  toStateId: STATE_APPROVED_ID,
  transitionKey: 'approve',
  displayName: 'Approve',
  conditions: { conditions: [{ field: 'amount', operator: 'gt', value: 0 }] },
  requiredPermissions: 'workflow.approve',
  actions: null,
  createdAt: now,
  updatedAt: now,
};

function makeInstance(stateId: string) {
  return {
    id: INSTANCE_ID,
    tenantId: TENANT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    entityType: 'invoice',
    entityId: ENTITY_ID,
    currentStateId: stateId,
    startedAt: now,
    completedAt: null,
  };
}

// ── Mock chain builder ─────────────────────────────────────────────
// Queue-based: each DB call shifts from the front of the queue.
const selectQueue: unknown[][] = [];
const insertQueue: unknown[][] = [];
const updateQueue: unknown[][] = [];

function makeThenableWithLimit(rows: unknown[]) {
  return {
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: () => ({
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    }),
  };
}

function makeSelectChain(): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.from = () => chain;
  chain.where = () => makeThenableWithLimit(selectQueue.shift() ?? []);
  chain.limit = () => ({
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject),
  });
  return chain;
}

function makeInsertChain(): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.values = () => chain;
  chain.returning = () => ({
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(insertQueue.shift() ?? []).then(resolve, reject),
  });
  return chain;
}

function makeUpdateChain(): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  chain.set = () => chain;
  chain.where = () => {
    const rows = updateQueue.shift() ?? [];
    const thenable = {
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
      returning: () => ({
        then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject),
      }),
    };
    return thenable;
  };
  return chain;
}

vi.mock('../../src/db/connection.js', () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  },
  pool: { connect: vi.fn() },
}));

vi.mock('../../src/db/schema/index.js', () => ({
  workflowDefinitions: { id: 'id', tenantId: 'tenant_id', entityType: 'entity_type', isActive: 'is_active' },
  workflowStates: { id: 'id', workflowId: 'workflow_id' },
  workflowTransitions: { id: 'id', workflowId: 'workflow_id', fromStateId: 'from_state_id', transitionKey: 'transition_key' },
  workflowInstances: { id: 'id', tenantId: 'tenant_id', entityType: 'entity_type', entityId: 'entity_id' },
  approvalSteps: { id: 'id', workflowTransitionId: 'workflow_transition_id' },
  approvalRecords: { id: 'id', workflowInstanceId: 'workflow_instance_id', approvalStepId: 'approval_step_id' },
}));

vi.mock('../../src/db/schema/audit.js', () => ({
  auditLog: { userId: 'user_id', entityType: 'entity_type', entityId: 'entity_id', action: 'action' },
}));

vi.mock('../../src/core/audit.service.js', () => ({
  logAction: vi.fn(),
}));

const mockCheckPermission = vi.fn();
vi.mock('../../src/core/auth.service.js', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

import {
  getWorkflowForEntity,
  startWorkflow,
  getInstanceState,
  getAvailableTransitions,
  executeTransition,
  submitApproval,
  checkApprovalComplete,
} from '../../src/workflow/workflow.service.js';

describe('Workflow Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue.length = 0;
    insertQueue.length = 0;
    updateQueue.length = 0;
    mockCheckPermission.mockReset();
  });

  // ── startWorkflow ────────────────────────────────────────────────
  describe('startWorkflow', () => {
    it('puts instance in initial state', async () => {
      // 1. check existing instance — none
      selectQueue.push([]);
      // 2. getWorkflowForEntity: find definition
      selectQueue.push([workflowDef]);
      // 3. getWorkflowForEntity: find states
      selectQueue.push([draftState, reviewState, approvedState]);
      // 4. getWorkflowForEntity: find transitions
      selectQueue.push([submitTransition, approveTransition]);
      // 5. insert instance returning
      insertQueue.push([makeInstance(STATE_DRAFT_ID)]);

      const result = await startWorkflow(TENANT_ID, 'invoice', ENTITY_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instance.currentStateId).toBe(STATE_DRAFT_ID);
        expect(result.value.currentState?.stateKey).toBe('draft');
        expect(result.value.currentState?.isInitial).toBe(true);
      }
    });
  });

  // ── executeTransition — valid ────────────────────────────────────
  describe('executeTransition', () => {
    it('valid transition moves to new state', async () => {
      // getInstanceState: find instance
      selectQueue.push([makeInstance(STATE_DRAFT_ID)]);
      // getInstanceState: find current state
      selectQueue.push([draftState]);
      // find transition by key
      selectQueue.push([submitTransition]);
      // check approval steps — none
      selectQueue.push([]);
      // update instance returning
      updateQueue.push([makeInstance(STATE_REVIEW_ID)]);
      // load new state
      selectQueue.push([reviewState]);

      const result = await executeTransition(
        TENANT_ID, 'invoice', ENTITY_ID, 'submit', USER_ID,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.instance.currentStateId).toBe(STATE_REVIEW_ID);
        expect(result.value.currentState?.stateKey).toBe('review');
      }
    });

    it('blocked transition — missing permission', async () => {
      // getInstanceState
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      selectQueue.push([reviewState]);
      // find transition
      selectQueue.push([approveTransition]);
      // checkPermission — denied
      mockCheckPermission.mockResolvedValue({ ok: true, value: false });

      const result = await executeTransition(
        TENANT_ID, 'invoice', ENTITY_ID, 'approve', USER_ID, { amount: 500 },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });

    it('blocked transition — conditions not met', async () => {
      // getInstanceState
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      selectQueue.push([reviewState]);
      // find transition (has condition: amount > 0)
      selectQueue.push([approveTransition]);
      // checkPermission — granted
      mockCheckPermission.mockResolvedValue({ ok: true, value: true });
      // approval steps — none
      selectQueue.push([]);

      const result = await executeTransition(
        TENANT_ID, 'invoice', ENTITY_ID, 'approve', USER_ID, { amount: -5 },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BAD_REQUEST');
        expect(result.error.message).toContain('conditions not met');
      }
    });

    it('terminal state blocks further transitions', async () => {
      // getInstanceState — instance at approved (terminal)
      selectQueue.push([makeInstance(STATE_APPROVED_ID)]);
      selectQueue.push([approvedState]);

      const result = await executeTransition(
        TENANT_ID, 'invoice', ENTITY_ID, 'anything', USER_ID,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BAD_REQUEST');
        expect(result.error.message).toContain('terminal state');
      }
    });
  });

  // ── getAvailableTransitions ──────────────────────────────────────
  describe('getAvailableTransitions', () => {
    it('filters by user permissions', async () => {
      // getInstanceState
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      selectQueue.push([reviewState]);
      // get transitions from current state
      selectQueue.push([approveTransition]);
      // checkPermission for 'workflow.approve' — denied
      mockCheckPermission.mockResolvedValue({ ok: true, value: false });

      const result = await getAvailableTransitions(TENANT_ID, 'invoice', ENTITY_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('includes transitions when user has permission', async () => {
      // getInstanceState
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      selectQueue.push([reviewState]);
      // get transitions from current state
      selectQueue.push([approveTransition]);
      // checkPermission — granted
      mockCheckPermission.mockResolvedValue({ ok: true, value: true });
      // look up target state
      selectQueue.push([approvedState]);
      // approval steps — none
      selectQueue.push([]);

      const result = await getAvailableTransitions(TENANT_ID, 'invoice', ENTITY_ID, USER_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.transitionKey).toBe('approve');
        expect(result.value[0]?.toStateKey).toBe('approved');
      }
    });
  });

  // ── Approval routing ─────────────────────────────────────────────
  describe('approval routing', () => {
    const serialStep1 = {
      id: STEP_1_ID,
      workflowTransitionId: TRANSITION_APPROVE_ID,
      stepOrder: 1,
      approvalType: 'serial',
      approverRule: null,
      timeoutHours: null,
      escalationRule: null,
      createdAt: now,
      updatedAt: now,
    };

    const serialStep2 = {
      id: STEP_2_ID,
      workflowTransitionId: TRANSITION_APPROVE_ID,
      stepOrder: 2,
      approvalType: 'serial',
      approverRule: null,
      timeoutHours: null,
      escalationRule: null,
      createdAt: now,
      updatedAt: now,
    };

    it('serial approval requires steps in order', async () => {
      // submitApproval for step 2 — should fail because step 1 not approved
      // find step
      selectQueue.push([serialStep2]);
      // find instance
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      // load prior steps for serial check
      selectQueue.push([serialStep1, serialStep2]);
      // check prior step 1 record — no record
      selectQueue.push([]);

      const result = await submitApproval(
        TENANT_ID, INSTANCE_ID, STEP_2_ID, USER_ID, 'approved',
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BAD_REQUEST');
        expect(result.error.message).toContain('Prior approval step');
      }
    });

    it('serial approval succeeds when prior steps are approved', async () => {
      // submitApproval for step 2 — step 1 is already approved
      // find step
      selectQueue.push([serialStep2]);
      // find instance
      selectQueue.push([makeInstance(STATE_REVIEW_ID)]);
      // load prior steps
      selectQueue.push([serialStep1, serialStep2]);
      // check step 1 record — approved
      selectQueue.push([{
        id: 'rec-1',
        tenantId: TENANT_ID,
        workflowInstanceId: INSTANCE_ID,
        approvalStepId: STEP_1_ID,
        approverId: USER_ID,
        decision: 'approved',
        comments: null,
        decidedAt: now,
      }]);
      // insert approval record
      insertQueue.push([{
        id: 'rec-2',
        tenantId: TENANT_ID,
        workflowInstanceId: INSTANCE_ID,
        approvalStepId: STEP_2_ID,
        approverId: USER_ID,
        decision: 'approved',
        comments: null,
        decidedAt: now,
      }]);

      const result = await submitApproval(
        TENANT_ID, INSTANCE_ID, STEP_2_ID, USER_ID, 'approved',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.decision).toBe('approved');
      }
    });

    it('parallel approval: all approvals needed regardless of order', async () => {
      const parallelStep1 = { ...serialStep1, approvalType: 'parallel' };
      const parallelStep2 = { ...serialStep2, approvalType: 'parallel' };

      // checkApprovalComplete — step 1 approved, step 2 not
      // load steps for transition
      selectQueue.push([parallelStep1, parallelStep2]);
      // check step 1 record — approved
      selectQueue.push([{
        id: 'rec-1',
        tenantId: TENANT_ID,
        workflowInstanceId: INSTANCE_ID,
        approvalStepId: STEP_1_ID,
        approverId: USER_ID,
        decision: 'approved',
        comments: null,
        decidedAt: now,
      }]);
      // check step 2 record — no record
      selectQueue.push([]);

      const result = await checkApprovalComplete(TENANT_ID, INSTANCE_ID, TRANSITION_APPROVE_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false); // not complete — step 2 missing
      }
    });

    it('parallel approval: complete when all steps approved', async () => {
      const parallelStep1 = { ...serialStep1, approvalType: 'parallel' };
      const parallelStep2 = { ...serialStep2, approvalType: 'parallel' };

      // load steps
      selectQueue.push([parallelStep1, parallelStep2]);
      // step 1 approved
      selectQueue.push([{
        id: 'rec-1',
        tenantId: TENANT_ID,
        workflowInstanceId: INSTANCE_ID,
        approvalStepId: STEP_1_ID,
        approverId: USER_ID,
        decision: 'approved',
        comments: null,
        decidedAt: now,
      }]);
      // step 2 approved
      selectQueue.push([{
        id: 'rec-2',
        tenantId: TENANT_ID,
        workflowInstanceId: INSTANCE_ID,
        approvalStepId: STEP_2_ID,
        approverId: 'other-user',
        decision: 'approved',
        comments: null,
        decidedAt: now,
      }]);

      const result = await checkApprovalComplete(TENANT_ID, INSTANCE_ID, TRANSITION_APPROVE_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });
  });
});
