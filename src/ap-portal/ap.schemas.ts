import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────

export const invoiceStatusEnum = z.enum([
  'intake',
  'ocr_pending',
  'review',
  'coding',
  'approval',
  'approved',
  'posted',
  'rejected',
  'duplicate',
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;

export const invoiceSourceEnum = z.enum(['email', 'manual', 'upload']);
export type InvoiceSource = z.infer<typeof invoiceSourceEnum>;

export const matchTypeEnum = z.enum(['two_way', 'three_way']);
export type MatchType = z.infer<typeof matchTypeEnum>;

export const matchStatusEnum = z.enum(['matched', 'tolerance', 'exception']);
export type MatchStatus = z.infer<typeof matchStatusEnum>;

// ── Invoice Line ──────────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  description: z.string().max(500).nullish(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int(),
  amount: z.number().int(),
  accountId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  costCenterId: z.string().uuid().nullish(),
});
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

// ── Create Manual Invoice ─────────────────────────────────────────

export const createManualInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  vendorId: z.string().uuid(),
  poId: z.string().uuid().nullish(),
  invoiceDate: z.string().datetime().nullish(),
  dueDate: z.string().datetime().nullish(),
  totalAmount: z.number().int().nullish(),
  subtotal: z.number().int().nullish(),
  taxAmount: z.number().int().nullish(),
  currency: z.string().max(3).default('USD'),
  notes: z.string().max(2000).nullish(),
  lines: z.array(invoiceLineSchema).min(1),
});
export type CreateManualInvoiceInput = z.infer<typeof createManualInvoiceSchema>;

// ── Create From Upload ────────────────────────────────────────────

export const createFromUploadSchema = z.object({
  invoiceNumber: z.string().min(1).max(100).optional(),
  vendorId: z.string().uuid().optional(),
  attachmentUrl: z.string().url(),
  attachmentHash: z.string().nullish(),
  sourceEmail: z.string().email().nullish(),
  source: invoiceSourceEnum.default('upload'),
});
export type CreateFromUploadInput = z.infer<typeof createFromUploadSchema>;

// ── Update Line Coding ────────────────────────────────────────────

export const updateLineCodingSchema = z.object({
  accountId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  costCenterId: z.string().uuid().nullish(),
});
export type UpdateLineCodingInput = z.infer<typeof updateLineCodingSchema>;

// ── PO Match ──────────────────────────────────────────────────────

export const matchToPOSchema = z.object({
  poId: z.string().uuid(),
  receiptId: z.string().uuid().optional(),
});
export type MatchToPOInput = z.infer<typeof matchToPOSchema>;

// ── Coding Rule ───────────────────────────────────────────────────

export const createCodingRuleSchema = z.object({
  vendorId: z.string().uuid().nullish(),
  descriptionPattern: z.string().max(500).nullish(),
  defaultAccountId: z.string().uuid(),
  defaultDepartmentId: z.string().uuid().nullish(),
  defaultProjectId: z.string().uuid().nullish(),
  defaultCostCenterId: z.string().uuid().nullish(),
  priority: z.number().int().min(0).default(0),
});
export type CreateCodingRuleInput = z.infer<typeof createCodingRuleSchema>;

// ── List / Query ──────────────────────────────────────────────────

export const listInvoicesQuerySchema = z.object({
  status: invoiceStatusEnum.optional(),
  vendorId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
