import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  workflowDefinitions,
  workflowStates,
  workflowTransitions,
  workflowInstances,
  approvalSteps,
  approvalRecords,
} from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';
import { checkPermission } from '../core/auth.service.js';
import { logAction } from '../core/audit.service.js';
import type {
  ConditionsPayload,
  Condition,
  ConditionOperator,
  WorkflowAction,
  ApprovalDecision,
} from './workflow.schemas.js';

// ── Types ──────────────────────────────────────────────────────────

interface WorkflowDefinitionRow {
  id: string;
  tenantId: string;
  entityType: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface WorkflowStateRow {
  id: string;
  workflowId: string;
  stateKey: string;
  displayName: string;
  sortOrder: number;
  isInitial: boolean;
  isTerminal: boolean;
  entryActions: unknown;
  exitActions: unknown;
}

interface WorkflowTransitionRow {
  id: string;
  workflowId: string;
  fromStateId: string;
  toStateId: string;
  transitionKey: string;
  displayName: string;
  conditions: unknown;
  requiredPermissions: string | null;
  actions: unknown;
}

interface WorkflowInstanceRow {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  entityType: string;
  entityId: string;
  currentStateId: string;
  startedAt: Date;
  completedAt: Date | null;
}

interface ApprovalStepRow {
  id: string;
  workflowTransitionId: string;
  stepOrder: number;
  approvalType: string;
  approverRule: unknown;
  timeoutHours: number | null;
  escalationRule: unknown;
}

interface ApprovalRecordRow {
  id: string;
  tenantId: string;
  workflowInstanceId: string;
  approvalStepId: string;
  approverId: string;
  decision: string | null;
  comments: string | null;
  decidedAt: Date | null;
}

export interface WorkflowDefinitionWithDetails {
  definition: WorkflowDefinitionRow;
  states: WorkflowStateRow[];
  transitions: WorkflowTransitionRow[];
}

export interface WorkflowInstanceWithState {
  instance: WorkflowInstanceRow;
  currentState: WorkflowStateRow | null;
}

export interface AvailableTransition {
  id: string;
  transitionKey: string;
  displayName: string;
  toStateId: string;
  toStateKey: string;
  toStateDisplayName: string;
  hasApprovalSteps: boolean;
}

export interface ApprovalStepStatus {
  stepId: string;
  stepOrder: number;
  approvalType: string;
  approverRule: unknown;
  timeoutHours: number | null;
  decision: string | null;
  approverId: string | null;
  comments: string | null;
  decidedAt: Date | null;
}

// ── Condition evaluation ───────────────────────────────────────────

function evaluateCondition(condition: Condition, data: Record<string, unknown>): boolean {
  const fieldValue = data[condition.field];
  const target = condition.value;
  const op: ConditionOperator = condition.operator;

  switch (op) {
    case 'eq':
      return fieldValue === target;
    case 'ne':
      return fieldValue !== target;
    case 'gt':
      return typeof fieldValue === 'number' && typeof target === 'number' && fieldValue > target;
    case 'gte':
      return typeof fieldValue === 'number' && typeof target === 'number' && fieldValue >= target;
    case 'lt':
      return typeof fieldValue === 'number' && typeof target === 'number' && fieldValue < target;
    case 'lte':
      return typeof fieldValue === 'number' && typeof target === 'number' && fieldValue <= target;
    case 'in':
      return Array.isArray(target) && target.includes(fieldValue);
    case 'contains':
      return typeof fieldValue === 'string' && typeof target === 'string' && fieldValue.includes(target);
    default: {
      const _exhaustive: never = op;
      return false;
    }
  }
}

function evaluateConditions(
  conditionsJson: unknown,
  data: Record<string, unknown>,
): boolean {
  if (!conditionsJson || typeof conditionsJson !== 'object') return true;

  const parsed = conditionsJson as ConditionsPayload;
  if (!Array.isArray(parsed.conditions)) return true;

  return parsed.conditions.every((c) => evaluateCondition(c as Condition, data));
}

// ── Action execution (stub — logs only) ────────────────────────────

function executeActions(actions: unknown, context: { stateKey: string; entityType: string; entityId: string }): void {
  if (!actions || !Array.isArray(actions)) return;

  for (const action of actions as WorkflowAction[]) {
    // Stub: log the action for now. Real executor built later.
    console.log(`[workflow-action] ${context.entityType}/${context.entityId} state=${context.stateKey} action=${action.type}`, action);
  }
}

// ── Service functions ──────────────────────────────────────────────

export async function getWorkflowForEntity(
  tenantId: string,
  entityType: string,
): Promise<Result<WorkflowDefinitionWithDetails, AppError>> {
  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.tenantId, tenantId),
        eq(workflowDefinitions.entityType, entityType),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .limit(1);

  if (!definition) {
    return err({
      code: 'NOT_FOUND',
      message: `No active workflow found for entity type '${entityType}'`,
    });
  }

  const states = await db
    .select()
    .from(workflowStates)
    .where(eq(workflowStates.workflowId, definition.id));

  const transitions = await db
    .select()
    .from(workflowTransitions)
    .where(eq(workflowTransitions.workflowId, definition.id));

  return ok({ definition, states, transitions });
}

export async function startWorkflow(
  tenantId: string,
  entityType: string,
  entityId: string,
  userId: string,
): Promise<Result<WorkflowInstanceWithState, AppError>> {
  // Check for existing instance
  const [existing] = await db
    .select({ id: workflowInstances.id })
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.tenantId, tenantId),
        eq(workflowInstances.entityType, entityType),
        eq(workflowInstances.entityId, entityId),
      ),
    )
    .limit(1);

  if (existing) {
    return err({
      code: 'CONFLICT',
      message: `Workflow instance already exists for ${entityType}/${entityId}`,
    });
  }

  const workflowResult = await getWorkflowForEntity(tenantId, entityType);
  if (!workflowResult.ok) return workflowResult;

  const { definition, states } = workflowResult.value;

  const initialState = states.find((s) => s.isInitial);
  if (!initialState) {
    return err({
      code: 'INTERNAL',
      message: `Workflow '${definition.name}' has no initial state`,
    });
  }

  const [instance] = await db
    .insert(workflowInstances)
    .values({
      tenantId,
      workflowDefinitionId: definition.id,
      entityType,
      entityId,
      currentStateId: initialState.id,
    })
    .returning();

  if (!instance) {
    return err({ code: 'INTERNAL', message: 'Failed to create workflow instance' });
  }

  // Execute entry actions on initial state
  executeActions(initialState.entryActions, {
    stateKey: initialState.stateKey,
    entityType,
    entityId,
  });

  await logAction({
    tenantId,
    userId,
    action: 'workflow.start',
    entityType,
    entityId,
    changes: {
      workflowDefinitionId: definition.id,
      initialStateId: initialState.id,
      initialStateKey: initialState.stateKey,
    },
  });

  return ok({ instance, currentState: initialState });
}

export async function getInstanceState(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<Result<WorkflowInstanceWithState, AppError>> {
  const [instance] = await db
    .select()
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.tenantId, tenantId),
        eq(workflowInstances.entityType, entityType),
        eq(workflowInstances.entityId, entityId),
      ),
    )
    .limit(1);

  if (!instance) {
    return err({
      code: 'NOT_FOUND',
      message: `No workflow instance found for ${entityType}/${entityId}`,
    });
  }

  const [currentState] = await db
    .select()
    .from(workflowStates)
    .where(eq(workflowStates.id, instance.currentStateId))
    .limit(1);

  return ok({ instance, currentState: currentState ?? null });
}

export async function getAvailableTransitions(
  tenantId: string,
  entityType: string,
  entityId: string,
  userId: string,
): Promise<Result<AvailableTransition[], AppError>> {
  const instanceResult = await getInstanceState(tenantId, entityType, entityId);
  if (!instanceResult.ok) return instanceResult;

  const { instance, currentState } = instanceResult.value;

  if (!currentState) {
    return err({ code: 'INTERNAL', message: 'Current state not found for workflow instance' });
  }

  if (currentState.isTerminal) {
    return ok([]);
  }

  const transitions = await db
    .select()
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.workflowId, instance.workflowDefinitionId),
        eq(workflowTransitions.fromStateId, currentState.id),
      ),
    );

  const available: AvailableTransition[] = [];

  for (const t of transitions) {
    // Filter by user permissions
    if (t.requiredPermissions) {
      const permResult = await checkPermission(userId, t.requiredPermissions);
      if (!permResult.ok || !permResult.value) continue;
    }

    // Look up target state
    const [toState] = await db
      .select()
      .from(workflowStates)
      .where(eq(workflowStates.id, t.toStateId))
      .limit(1);

    // Check for approval steps
    const steps = await db
      .select({ id: approvalSteps.id })
      .from(approvalSteps)
      .where(eq(approvalSteps.workflowTransitionId, t.id))
      .limit(1);

    available.push({
      id: t.id,
      transitionKey: t.transitionKey,
      displayName: t.displayName,
      toStateId: t.toStateId,
      toStateKey: toState?.stateKey ?? 'unknown',
      toStateDisplayName: toState?.displayName ?? 'Unknown',
      hasApprovalSteps: steps.length > 0,
    });
  }

  return ok(available);
}

export async function executeTransition(
  tenantId: string,
  entityType: string,
  entityId: string,
  transitionKey: string,
  userId: string,
  data?: Record<string, unknown>,
): Promise<Result<WorkflowInstanceWithState, AppError>> {
  // 1. Load workflow instance and current state
  const instanceResult = await getInstanceState(tenantId, entityType, entityId);
  if (!instanceResult.ok) return instanceResult;

  const { instance, currentState } = instanceResult.value;

  if (!currentState) {
    return err({ code: 'INTERNAL', message: 'Current state not found' });
  }

  if (currentState.isTerminal) {
    return err({
      code: 'BAD_REQUEST',
      message: `Cannot transition from terminal state '${currentState.stateKey}'`,
    });
  }

  // 2. Find the transition by key from current state
  const [transition] = await db
    .select()
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.workflowId, instance.workflowDefinitionId),
        eq(workflowTransitions.fromStateId, currentState.id),
        eq(workflowTransitions.transitionKey, transitionKey),
      ),
    )
    .limit(1);

  if (!transition) {
    return err({
      code: 'NOT_FOUND',
      message: `Transition '${transitionKey}' not available from state '${currentState.stateKey}'`,
    });
  }

  // 3. Evaluate transition conditions
  if (transition.conditions && data) {
    const conditionsMet = evaluateConditions(transition.conditions, data);
    if (!conditionsMet) {
      return err({
        code: 'BAD_REQUEST',
        message: 'Transition conditions not met',
        details: { conditions: transition.conditions },
      });
    }
  } else if (transition.conditions && !data) {
    // Conditions exist but no data provided — evaluate with empty
    const conditionsMet = evaluateConditions(transition.conditions, {});
    if (!conditionsMet) {
      return err({
        code: 'BAD_REQUEST',
        message: 'Transition conditions not met — required data not provided',
        details: { conditions: transition.conditions },
      });
    }
  }

  // 4. Check requiredPermissions
  if (transition.requiredPermissions) {
    const permResult = await checkPermission(userId, transition.requiredPermissions);
    if (!permResult.ok) {
      return err({ code: 'INTERNAL', message: 'Failed to check permissions' });
    }
    if (!permResult.value) {
      return err({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${transition.requiredPermissions}`,
      });
    }
  }

  // 5. Check approval steps
  const steps = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.workflowTransitionId, transition.id));

  if (steps.length > 0) {
    const approvalResult = await checkApprovalComplete(tenantId, instance.id, transition.id);
    if (!approvalResult.ok) return approvalResult;
    if (!approvalResult.value) {
      return err({
        code: 'BAD_REQUEST',
        message: 'Required approvals are not complete for this transition',
      });
    }
  }

  // 6. Execute exit actions on current state
  executeActions(currentState.exitActions, {
    stateKey: currentState.stateKey,
    entityType,
    entityId,
  });

  // 7. Move instance to new state
  const [updated] = await db
    .update(workflowInstances)
    .set({ currentStateId: transition.toStateId })
    .where(eq(workflowInstances.id, instance.id))
    .returning();

  if (!updated) {
    return err({ code: 'INTERNAL', message: 'Failed to update workflow instance' });
  }

  // 8. Execute entry actions on new state
  const [newState] = await db
    .select()
    .from(workflowStates)
    .where(eq(workflowStates.id, transition.toStateId))
    .limit(1);

  if (newState) {
    executeActions(newState.entryActions, {
      stateKey: newState.stateKey,
      entityType,
      entityId,
    });

    // Mark completed if terminal
    if (newState.isTerminal) {
      await db
        .update(workflowInstances)
        .set({ completedAt: new Date() })
        .where(eq(workflowInstances.id, instance.id));
    }
  }

  // 9. Write audit log
  await logAction({
    tenantId,
    userId,
    action: 'workflow.transition',
    entityType,
    entityId,
    changes: {
      transitionKey,
      fromStateId: currentState.id,
      fromStateKey: currentState.stateKey,
      toStateId: transition.toStateId,
      toStateKey: newState?.stateKey ?? null,
      data: data ?? null,
    },
  });

  // 10. Return updated instance
  return ok({ instance: updated, currentState: newState ?? null });
}

export async function submitApproval(
  tenantId: string,
  instanceId: string,
  stepId: string,
  userId: string,
  decision: ApprovalDecision,
  comments?: string,
): Promise<Result<ApprovalRecordRow, AppError>> {
  // Verify step exists
  const [step] = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.id, stepId))
    .limit(1);

  if (!step) {
    return err({ code: 'NOT_FOUND', message: `Approval step '${stepId}' not found` });
  }

  // Verify instance exists and belongs to tenant
  const [instance] = await db
    .select()
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.id, instanceId),
        eq(workflowInstances.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!instance) {
    return err({ code: 'NOT_FOUND', message: 'Workflow instance not found' });
  }

  // For serial approvals, check that all prior steps are approved
  if (step.approvalType === 'serial') {
    const priorSteps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.workflowTransitionId, step.workflowTransitionId));

    const priorUnfinished = priorSteps.filter((s) => s.stepOrder < step.stepOrder);

    for (const prior of priorUnfinished) {
      const [record] = await db
        .select()
        .from(approvalRecords)
        .where(
          and(
            eq(approvalRecords.workflowInstanceId, instanceId),
            eq(approvalRecords.approvalStepId, prior.id),
          ),
        )
        .limit(1);

      if (!record || record.decision !== 'approved') {
        return err({
          code: 'BAD_REQUEST',
          message: `Prior approval step (order ${prior.stepOrder}) must be approved first`,
        });
      }
    }
  }

  const [record] = await db
    .insert(approvalRecords)
    .values({
      tenantId,
      workflowInstanceId: instanceId,
      approvalStepId: stepId,
      approverId: userId,
      decision,
      comments: comments ?? null,
      decidedAt: new Date(),
    })
    .returning();

  if (!record) {
    return err({ code: 'INTERNAL', message: 'Failed to create approval record' });
  }

  await logAction({
    tenantId,
    userId,
    action: 'workflow.approval',
    entityType: 'workflow_instance',
    entityId: instanceId,
    changes: {
      stepId,
      decision,
      comments: comments ?? null,
    },
  });

  return ok(record);
}

export async function getApprovalStatus(
  tenantId: string,
  instanceId: string,
): Promise<Result<ApprovalStepStatus[], AppError>> {
  // Verify instance
  const [instance] = await db
    .select()
    .from(workflowInstances)
    .where(
      and(
        eq(workflowInstances.id, instanceId),
        eq(workflowInstances.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!instance) {
    return err({ code: 'NOT_FOUND', message: 'Workflow instance not found' });
  }

  // Get all transitions from current state for this workflow
  const transitions = await db
    .select()
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.workflowId, instance.workflowDefinitionId),
        eq(workflowTransitions.fromStateId, instance.currentStateId),
      ),
    );

  const transitionIds = transitions.map((t) => t.id);
  if (transitionIds.length === 0) {
    return ok([]);
  }

  // Get all approval steps for these transitions
  const allSteps: ApprovalStepStatus[] = [];

  for (const transitionId of transitionIds) {
    const steps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.workflowTransitionId, transitionId));

    for (const step of steps) {
      const [record] = await db
        .select()
        .from(approvalRecords)
        .where(
          and(
            eq(approvalRecords.workflowInstanceId, instanceId),
            eq(approvalRecords.approvalStepId, step.id),
          ),
        )
        .limit(1);

      allSteps.push({
        stepId: step.id,
        stepOrder: step.stepOrder,
        approvalType: step.approvalType,
        approverRule: step.approverRule,
        timeoutHours: step.timeoutHours,
        decision: record?.decision ?? null,
        approverId: record?.approverId ?? null,
        comments: record?.comments ?? null,
        decidedAt: record?.decidedAt ?? null,
      });
    }
  }

  return ok(allSteps);
}

export async function checkApprovalComplete(
  tenantId: string,
  instanceId: string,
  transitionId: string,
): Promise<Result<boolean, AppError>> {
  const steps = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.workflowTransitionId, transitionId));

  if (steps.length === 0) {
    return ok(true); // No approval steps required
  }

  // Sort by step order
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);

  for (const step of sorted) {
    const [record] = await db
      .select()
      .from(approvalRecords)
      .where(
        and(
          eq(approvalRecords.workflowInstanceId, instanceId),
          eq(approvalRecords.approvalStepId, step.id),
        ),
      )
      .limit(1);

    if (!record || record.decision !== 'approved') {
      return ok(false);
    }

    // For serial: if any step is not approved, subsequent steps shouldn't matter
    // For parallel: all must be approved — same check applies
  }

  return ok(true);
}
