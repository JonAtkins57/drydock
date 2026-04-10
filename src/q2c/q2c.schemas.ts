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

// ── Quote Status ──────────────────────────────────────────────────

export const quoteStatusValues = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type QuoteStatus = (typeof quoteStatusValues)[number];

// ── Quote Line Input ──────────────────────────────────────────────

export const quoteLineInputSchema = z.object({
  itemId: uuidSchema.optional(),
  description: z.string().min(1).max(2000),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  accountId: uuidSchema.optional(),
});

export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>;

// ── Create Quote ──────────────────────────────────────────────────

export const createQuoteSchema = z.object({
  customerId: uuidSchema,
  name: z.string().min(1).max(255),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  lines: z.array(quoteLineInputSchema).min(1),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

// ── Update Quote ──────────────────────────────────────────────────

export const updateQuoteSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  lines: z.array(quoteLineInputSchema).min(1).optional(),
});

export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;

// ── List Quotes ───────────────────────────────────────────────────

export const listQuotesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(quoteStatusValues).optional(),
  customerId: uuidSchema.optional(),
});

export type ListQuotesQuery = z.infer<typeof listQuotesQuerySchema>;

// ── Order Status ──────────────────────────────────────────────────

export const orderStatusValues = ['draft', 'confirmed', 'fulfilled', 'cancelled'] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

// ── Order Line Input ──────────────────────────────────────────────

export const orderLineInputSchema = z.object({
  itemId: uuidSchema.optional(),
  description: z.string().min(1).max(2000),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});

export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

// ── Create Order ──────────────────────────────────────────────────

export const createOrderSchema = z.object({
  customerId: uuidSchema,
  quoteId: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
  lines: z.array(orderLineInputSchema).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ── List Orders ───────────────────────────────────────────────────

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(orderStatusValues).optional(),
  customerId: uuidSchema.optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// ── Invoice Status ────────────────────────────────────────────────

export const invoiceStatusValues = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited'] as const;
export type InvoiceStatus = (typeof invoiceStatusValues)[number];

// ── Invoice Line Input ────────────────────────────────────────────

export const invoiceLineInputSchema = z.object({
  itemId: uuidSchema.optional(),
  description: z.string().min(1).max(2000),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  accountId: uuidSchema.optional(),
});

export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;

// ── Create Invoice ────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema.optional(),
  dueDate: z.string().datetime(),
  taxAmount: z.number().int().nonnegative().default(0),
  notes: z.string().max(5000).optional(),
  lines: z.array(invoiceLineInputSchema).min(1),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

// ── List Invoices ─────────────────────────────────────────────────

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(invoiceStatusValues).optional(),
  customerId: uuidSchema.optional(),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// ── Record Payment ────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  amount: z.number().int().positive(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ── Billing Plan ──────────────────────────────────────────────────

export const planTypeValues = ['fixed', 'recurring', 'milestone'] as const;
export const billingMethodValues = ['advance', 'arrears'] as const;
export const frequencyValues = ['monthly', 'quarterly', 'annual', 'one_time'] as const;
export const billingPlanStatusValues = ['active', 'paused', 'completed', 'cancelled'] as const;

export const createBillingPlanSchema = z.object({
  customerId: uuidSchema,
  name: z.string().min(1).max(255),
  planType: z.enum(planTypeValues),
  billingMethod: z.enum(billingMethodValues),
  frequency: z.enum(frequencyValues),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  totalAmount: z.number().int().nonnegative(),
});

export type CreateBillingPlanInput = z.infer<typeof createBillingPlanSchema>;

// ── List Billing Plans ────────────────────────────────────────────

export const listBillingPlansQuerySchema = paginationQuerySchema.extend({
  status: z.enum(billingPlanStatusValues).optional(),
  customerId: uuidSchema.optional(),
});

export type ListBillingPlansQuery = z.infer<typeof listBillingPlansQuerySchema>;
