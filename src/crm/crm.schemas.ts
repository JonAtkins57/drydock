import { z } from 'zod';

// ── Shared ──────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ── Lead Schemas ───────────────────────────────────────────────────

export const leadStatusValues = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof leadStatusValues)[number];

export const createLeadSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(255).optional(),
  source: z.string().max(100).optional(),
  assignedTo: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(leadStatusValues).optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(leadStatusValues).optional(),
  assignedTo: uuidSchema.optional(),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

// ── Opportunity Schemas ────────────────────────────────────────────

export const opportunityStageValues = [
  'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost',
] as const;
export type OpportunityStage = (typeof opportunityStageValues)[number];

export const createOpportunitySchema = z.object({
  name: z.string().min(1).max(255),
  customerId: uuidSchema.optional(),
  leadId: uuidSchema.optional(),
  stage: z.enum(opportunityStageValues).default('prospecting'),
  probability: z.number().int().min(0).max(100).default(0),
  expectedAmount: z.number().int().nonnegative().default(0),
  expectedCloseDate: z.string().datetime().optional(),
  assignedTo: uuidSchema.optional(),
  description: z.string().max(5000).optional(),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = createOpportunitySchema.partial();

export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const listOpportunitiesQuerySchema = paginationQuerySchema.extend({
  stage: z.enum(opportunityStageValues).optional(),
  customerId: uuidSchema.optional(),
  assignedTo: uuidSchema.optional(),
});

export type ListOpportunitiesQuery = z.infer<typeof listOpportunitiesQuerySchema>;

// ── Convert Lead Schema ────────────────────────────────────────────

export const convertLeadSchema = z.object({
  name: z.string().min(1).max(255),
  customerId: uuidSchema.optional(),
  stage: z.enum(opportunityStageValues).default('prospecting'),
  probability: z.number().int().min(0).max(100).default(0),
  expectedAmount: z.number().int().nonnegative().default(0),
  expectedCloseDate: z.string().datetime().optional(),
  assignedTo: uuidSchema.optional(),
  description: z.string().max(5000).optional(),
});

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

// ── Activity Schemas ───────────────────────────────────────────────

export const activityTypeValues = ['task', 'note', 'meeting', 'call', 'email'] as const;
export type ActivityType = (typeof activityTypeValues)[number];

export const createActivitySchema = z.object({
  activityType: z.enum(activityTypeValues),
  subject: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  entityType: z.string().min(1).max(100),
  entityId: uuidSchema,
  assignedTo: uuidSchema.optional(),
  dueDate: z.string().datetime().optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const listActivitiesQuerySchema = paginationQuerySchema.extend({
  activityType: z.enum(activityTypeValues).optional(),
  isCompleted: z.coerce.boolean().optional(),
});

export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

// ── Contract Schemas ───────────────────────────────────────────────

export const contractStatusValues = ['draft', 'executed', 'active', 'expired', 'terminated'] as const;
export type ContractStatus = (typeof contractStatusValues)[number];

export const createContractSchema = z.object({
  contractNumber: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  customerId: uuidSchema,
  opportunityId: uuidSchema.optional(),
  status: z.enum(contractStatusValues).default('draft'),
  effectiveDate: z.string().datetime(),
  expirationDate: z.string().datetime().optional(),
  totalValue: z.number().int().nonnegative().optional(),
  terms: z.string().max(50000).optional(),
  autoRenew: z.boolean().default(false),
  renewalNoticeDays: z.number().int().positive().optional(),
  billingPlanId: uuidSchema.optional(),
  assignedTo: uuidSchema.optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = createContractSchema.partial();

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const listContractsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(contractStatusValues).optional(),
  customerId: uuidSchema.optional(),
  assignedTo: uuidSchema.optional(),
});

export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export const transitionContractSchema = z.object({
  status: z.enum(contractStatusValues),
});

export type TransitionContractInput = z.infer<typeof transitionContractSchema>;

export const addContractLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  description: z.string().min(1).max(1000),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  amount: z.number().int().nonnegative(),
  deliveryTerms: z.string().max(500).optional(),
  itemId: uuidSchema.optional(),
});

export type AddContractLineInput = z.infer<typeof addContractLineSchema>;

// ── Subscription Schemas ───────────────────────────────────────────

export const subscriptionBillingCycleValues = ['monthly', 'quarterly', 'annual', 'one_time'] as const;
export type SubscriptionBillingCycle = (typeof subscriptionBillingCycleValues)[number];

export const subscriptionStatusValues = ['active', 'paused', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const createSubscriptionSchema = z.object({
  contractId: uuidSchema.optional(),
  customerId: uuidSchema,
  name: z.string().min(1).max(255),
  plan: z.string().min(1).max(255),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  billingCycle: z.enum(subscriptionBillingCycleValues),
  status: z.enum(subscriptionStatusValues).default('active'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  billingPlanId: uuidSchema.optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionSchema = createSubscriptionSchema.partial();

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const listSubscriptionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(subscriptionStatusValues).optional(),
  customerId: uuidSchema.optional(),
  contractId: uuidSchema.optional(),
});
