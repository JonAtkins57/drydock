import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────

export const accountTypeEnum = z.enum([
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);
export type AccountType = z.infer<typeof accountTypeEnum>;

export const normalBalanceEnum = z.enum(['debit', 'credit']);
export type NormalBalance = z.infer<typeof normalBalanceEnum>;

export const periodStatusEnum = z.enum(['open', 'soft_close', 'closed', 'locked']);
export type PeriodStatus = z.infer<typeof periodStatusEnum>;

export const journalStatusEnum = z.enum([
  'draft',
  'pending_approval',
  'approved',
  'posted',
  'reversed',
  'rejected',
]);
export type JournalStatus = z.infer<typeof journalStatusEnum>;

export const journalTypeEnum = z.enum([
  'manual',
  'automated',
  'adjustment',
  'closing',
  'reversal',
]);
export type JournalType = z.infer<typeof journalTypeEnum>;

// ── Accounts ───────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  accountNumber: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  accountType: accountTypeEnum,
  accountSubtype: z.string().max(100).nullish(),
  parentAccountId: z.string().uuid().nullish(),
  isPostingAccount: z.boolean().default(true),
  normalBalance: normalBalanceEnum.default('debit'),
  description: z.string().max(1000).nullish(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  accountSubtype: z.string().max(100).nullish(),
  parentAccountId: z.string().uuid().nullish(),
  description: z.string().max(1000).nullish(),
  normalBalance: normalBalanceEnum.optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const listAccountsQuerySchema = z.object({
  accountType: accountTypeEnum.optional(),
  parentAccountId: z.string().uuid().optional(),
  postingOnly: z.coerce.boolean().optional(),
  activeOnly: z.coerce.boolean().default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

// ── Accounting Periods ─────────────────────────────────────────────

export const createPeriodSchema = z.object({
  entityId: z.string().uuid().nullish(),
  periodName: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  fiscalYear: z.number().int().min(1900).max(2100),
  periodNumber: z.number().int().min(0).max(13),
});
export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;

export const listPeriodsQuerySchema = z.object({
  fiscalYear: z.coerce.number().int().optional(),
  entityId: z.string().uuid().optional(),
});
export type ListPeriodsQuery = z.infer<typeof listPeriodsQuerySchema>;

export const updatePeriodStatusSchema = z.object({
  status: periodStatusEnum,
});
export type UpdatePeriodStatusInput = z.infer<typeof updatePeriodStatusSchema>;

// ── Journal Entries ────────────────────────────────────────────────

export const journalEntryLineSchema = z.object({
  accountId: z.string().uuid(),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
  description: z.string().max(500).nullish(),
  departmentId: z.string().uuid().nullish(),
  locationId: z.string().uuid().nullish(),
  customerId: z.string().uuid().nullish(),
  vendorId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  costCenterId: z.string().uuid().nullish(),
  entityId: z.string().uuid().nullish(),
  customDimensions: z.record(z.unknown()).nullish(),
});
export type JournalEntryLineInput = z.infer<typeof journalEntryLineSchema>;

export const createJournalEntrySchema = z.object({
  entityId: z.string().uuid().nullish(),
  journalType: journalTypeEnum.default('manual'),
  periodId: z.string().uuid(),
  postingDate: z.string().datetime(),
  description: z.string().max(1000).nullish(),
  sourceModule: z.string().max(50).nullish(),
  sourceEntityType: z.string().max(50).nullish(),
  sourceEntityId: z.string().uuid().nullish(),
  lines: z.array(journalEntryLineSchema).min(2),
});
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

export const listJournalEntriesQuerySchema = z.object({
  status: journalStatusEnum.optional(),
  periodId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListJournalEntriesQuery = z.infer<typeof listJournalEntriesQuerySchema>;

export const reverseJournalSchema = z.object({
  reversalDate: z.string().datetime(),
});
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;

// ── Trial Balance ──────────────────────────────────────────────────

export const trialBalanceQuerySchema = z.object({
  periodId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
});
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;

export interface TrialBalanceRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface TrialBalanceResult {
  accounts: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
}

// ── Income Statement ───────────────────────────────────────────────

export const incomeStatementQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  entityId: z.string().uuid().optional(),
});
export type IncomeStatementQuery = z.infer<typeof incomeStatementQuerySchema>;

export interface AccountRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  netAmount: number;
}

export interface IncomeStatementResult {
  revenue: AccountRow[];
  expenses: AccountRow[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

// ── Balance Sheet ──────────────────────────────────────────────────

export const balanceSheetQuerySchema = z.object({
  asOf: z.string().datetime().optional(),
  entityId: z.string().uuid().optional(),
});
export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;

export interface BalanceSheetResult {
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}
