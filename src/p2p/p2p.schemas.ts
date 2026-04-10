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

// ── Requisition Status ──────────────────────────────────────────────

export const requisitionStatusValues = [
  'draft', 'pending_approval', 'approved', 'rejected', 'cancelled',
] as const;
export type RequisitionStatus = (typeof requisitionStatusValues)[number];

// ── PO Status ───────────────────────────────────────────────────────

export const poStatusValues = [
  'draft', 'pending_approval', 'approved', 'dispatched', 'received', 'cancelled', 'sent',
] as const;
export type POStatus = (typeof poStatusValues)[number];

// ── Requisition Line Schema ─────────────────────────────────────────

export const requisitionLineSchema = z.object({
  itemId: uuidSchema.optional(),
  description: z.string().min(1).max(1000),
  quantity: z.number().int().positive(),
  estimatedUnitPrice: z.number().int().nonnegative(),
  accountId: uuidSchema.optional(),
});

export type RequisitionLineInput = z.infer<typeof requisitionLineSchema>;

// ── Create Requisition ──────────────────────────────────────────────

export const createRequisitionSchema = z.object({
  departmentId: uuidSchema.optional(),
  notes: z.string().max(5000).optional(),
  neededBy: z.string().datetime().optional(),
  lines: z.array(requisitionLineSchema).min(1),
});

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;

// ── List Requisitions ───────────────────────────────────────────────

export const listRequisitionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(requisitionStatusValues).optional(),
});

export type ListRequisitionsQuery = z.infer<typeof listRequisitionsQuerySchema>;

// ── PO Line Schema ──────────────────────────────────────────────────

export const poLineSchema = z.object({
  itemId: uuidSchema.optional(),
  description: z.string().min(1).max(1000),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  accountId: uuidSchema.optional(),
});

export type POLineInput = z.infer<typeof poLineSchema>;

// ── Create PO ───────────────────────────────────────────────────────

export const createPOSchema = z.object({
  vendorId: uuidSchema,
  requisitionId: uuidSchema.optional(),
  orderDate: z.string().datetime(),
  expectedDelivery: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  paymentTermsId: uuidSchema.optional(),
  lines: z.array(poLineSchema).min(1),
});

export type CreatePOInput = z.infer<typeof createPOSchema>;

// ── List POs ────────────────────────────────────────────────────────

export const listPOsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(poStatusValues).optional(),
  vendorId: uuidSchema.optional(),
});

export type ListPOsQuery = z.infer<typeof listPOsQuerySchema>;

// ── Convert to PO ───────────────────────────────────────────────────

export const convertToPOSchema = z.object({
  vendorId: uuidSchema,
  orderDate: z.string().datetime().optional(),
  expectedDelivery: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  paymentTermsId: uuidSchema.optional(),
});

export type ConvertToPOInput = z.infer<typeof convertToPOSchema>;

// ── Receipt Line Schema ─────────────────────────────────────────────

export const receiptLineSchema = z.object({
  poLineId: uuidSchema,
  quantityReceived: z.number().int().positive(),
  notes: z.string().max(5000).optional(),
});

export type ReceiptLineInput = z.infer<typeof receiptLineSchema>;

// ── Receive PO (Goods Receipt) ──────────────────────────────────────

export const receivePOSchema = z.object({
  receiptDate: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  lines: z.array(receiptLineSchema).min(1),
});

export type ReceivePOInput = z.infer<typeof receivePOSchema>;

// ── List Goods Receipts ─────────────────────────────────────────────

export const listGoodsReceiptsQuerySchema = paginationQuerySchema.extend({
  poId: uuidSchema.optional(),
});

export type ListGoodsReceiptsQuery = z.infer<typeof listGoodsReceiptsQuerySchema>;
