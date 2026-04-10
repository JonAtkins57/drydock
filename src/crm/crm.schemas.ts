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
