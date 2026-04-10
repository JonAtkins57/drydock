import { z } from 'zod';

// ── Condition operators ────────────────────────────────────────────
export const conditionOperatorSchema = z.enum([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains',
]);

export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const conditionSchema = z.object({
  field: z.string().min(1),
  operator: conditionOperatorSchema,
  value: z.unknown(),
});

export type Condition = z.infer<typeof conditionSchema>;

export const conditionsPayloadSchema = z.object({
  conditions: z.array(conditionSchema),
});

export type ConditionsPayload = z.infer<typeof conditionsPayloadSchema>;

// ── Actions ────────────────────────────────────────────────────────
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_field'), field: z.string(), value: z.unknown() }),
  z.object({ type: z.literal('notify'), to: z.string(), template: z.string() }),
  z.object({ type: z.literal('create_record'), entityType: z.string() }),
]);

export type WorkflowAction = z.infer<typeof actionSchema>;

// ── Approval ───────────────────────────────────────────────────────
export const approvalDecisionSchema = z.enum(['approved', 'rejected', 'delegated']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const approvalTypeSchema = z.enum(['serial', 'parallel']);
export type ApprovalType = z.infer<typeof approvalTypeSchema>;

// ── Route params / bodies ──────────────────────────────────────────
export const entityParamsSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
});

export type EntityParams = z.infer<typeof entityParamsSchema>;

export const entityTypeParamSchema = z.object({
  entityType: z.string().min(1).max(100),
});

export type EntityTypeParam = z.infer<typeof entityTypeParamSchema>;

export const transitionParamsSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  transitionKey: z.string().min(1).max(100),
});

export type TransitionParams = z.infer<typeof transitionParamsSchema>;

export const executeTransitionBodySchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
}).optional();

export type ExecuteTransitionBody = z.infer<typeof executeTransitionBodySchema>;

export const approvalParamsSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  stepId: z.string().uuid(),
});

export type ApprovalParams = z.infer<typeof approvalParamsSchema>;

export const submitApprovalBodySchema = z.object({
  decision: approvalDecisionSchema,
  comments: z.string().max(2000).optional(),
});

export type SubmitApprovalBody = z.infer<typeof submitApprovalBodySchema>;

// ── Response shapes ────────────────────────────────────────────────
export const workflowStateResponseSchema = z.object({
  id: z.string().uuid(),
  stateKey: z.string(),
  displayName: z.string(),
  sortOrder: z.number(),
  isInitial: z.boolean(),
  isTerminal: z.boolean(),
  entryActions: z.unknown().nullable(),
  exitActions: z.unknown().nullable(),
});

export const workflowTransitionResponseSchema = z.object({
  id: z.string().uuid(),
  fromStateId: z.string().uuid(),
  toStateId: z.string().uuid(),
  transitionKey: z.string(),
  displayName: z.string(),
  conditions: z.unknown().nullable(),
  requiredPermissions: z.string().nullable(),
  actions: z.unknown().nullable(),
});

export const workflowDefinitionResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  entityType: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  states: z.array(workflowStateResponseSchema),
  transitions: z.array(workflowTransitionResponseSchema),
});

export type WorkflowDefinitionResponse = z.infer<typeof workflowDefinitionResponseSchema>;

export const workflowInstanceResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowDefinitionId: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  currentStateId: z.string().uuid(),
  currentState: workflowStateResponseSchema.nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type WorkflowInstanceResponse = z.infer<typeof workflowInstanceResponseSchema>;

export const availableTransitionResponseSchema = z.object({
  id: z.string().uuid(),
  transitionKey: z.string(),
  displayName: z.string(),
  toStateId: z.string().uuid(),
  toStateKey: z.string(),
  toStateDisplayName: z.string(),
  hasApprovalSteps: z.boolean(),
});

export type AvailableTransitionResponse = z.infer<typeof availableTransitionResponseSchema>;

export const approvalStepStatusSchema = z.object({
  stepId: z.string().uuid(),
  stepOrder: z.number(),
  approvalType: z.string(),
  approverRule: z.unknown().nullable(),
  timeoutHours: z.number().nullable(),
  decision: z.string().nullable(),
  approverId: z.string().uuid().nullable(),
  comments: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

export type ApprovalStepStatus = z.infer<typeof approvalStepStatusSchema>;
