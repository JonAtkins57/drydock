import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  journalEntries,
  journalEntryLines,
  accounts,
  invoices,
  opportunities,
} from '../db/schema/index.js';

export interface KpiResult {
  widget: string;
  label: string;
  value: number;
  unit: 'cents' | 'count';
  drillDownPath: string;
}

export interface KpiParams {
  tenantId: string;
  from: Date;
  to: Date;
}

// 1. Revenue posted in date range (sum of credit_amount on revenue accounts in posted journals)
async function revenuePosted(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(cast(sum(${journalEntryLines.creditAmount}) as bigint), 0)`,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
    .where(
      and(
        eq(journalEntries.tenantId, params.tenantId),
        eq(journalEntries.status, 'posted'),
        eq(accounts.accountType, 'revenue'),
        gte(journalEntries.postingDate, params.from),
        lte(journalEntries.postingDate, params.to),
      ),
    );

  return {
    widget: 'revenue',
    label: 'Revenue (Posted)',
    value: Number(rows[0]?.total ?? 0),
    unit: 'cents',
    drillDownPath: '/journal-entries',
  };
}

// 2. Open AR: sum of outstanding balance on invoices with status sent/overdue
async function openAr(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(cast(sum(${invoices.totalAmount} - ${invoices.paidAmount}) as bigint), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, params.tenantId),
        sql`${invoices.status} IN ('sent', 'overdue')`,
      ),
    );

  return {
    widget: 'open_ar',
    label: 'Open AR',
    value: Number(rows[0]?.total ?? 0),
    unit: 'cents',
    drillDownPath: '/invoices',
  };
}

// 3. Invoice count in date range
async function invoiceCount(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`cast(count(*) as integer)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, params.tenantId),
        gte(invoices.invoiceDate, params.from),
        lte(invoices.invoiceDate, params.to),
      ),
    );

  return {
    widget: 'invoice_count',
    label: 'Invoices (Period)',
    value: Number(rows[0]?.total ?? 0),
    unit: 'count',
    drillDownPath: '/invoices',
  };
}

// 4. Open opportunities count (not closed_won or closed_lost)
async function openOpportunitiesCount(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`cast(count(*) as integer)`,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, params.tenantId),
        eq(opportunities.isActive, true),
        sql`${opportunities.stage} NOT IN ('closed_won', 'closed_lost')`,
      ),
    );

  return {
    widget: 'open_opportunities',
    label: 'Open Opportunities',
    value: Number(rows[0]?.total ?? 0),
    unit: 'count',
    drillDownPath: '/opportunities',
  };
}

// 5. Pipeline value: sum of expectedAmount * probability / 100 for open opportunities
async function pipelineValue(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(cast(sum(${opportunities.expectedAmount} * ${opportunities.probability} / 100.0) as bigint), 0)`,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, params.tenantId),
        eq(opportunities.isActive, true),
        sql`${opportunities.stage} NOT IN ('closed_won', 'closed_lost')`,
      ),
    );

  return {
    widget: 'pipeline_value',
    label: 'Weighted Pipeline',
    value: Number(rows[0]?.total ?? 0),
    unit: 'cents',
    drillDownPath: '/opportunities',
  };
}

// 6. Posted journal entries count in date range
async function postedJournalCount(params: KpiParams): Promise<KpiResult> {
  const rows = await db
    .select({
      total: sql<number>`cast(count(*) as integer)`,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, params.tenantId),
        eq(journalEntries.status, 'posted'),
        gte(journalEntries.postingDate, params.from),
        lte(journalEntries.postingDate, params.to),
      ),
    );

  return {
    widget: 'posted_journals',
    label: 'Posted Journals',
    value: Number(rows[0]?.total ?? 0),
    unit: 'count',
    drillDownPath: '/journal-entries',
  };
}

export async function getAllKpis(params: KpiParams): Promise<KpiResult[]> {
  const results = await Promise.all([
    revenuePosted(params),
    openAr(params),
    invoiceCount(params),
    openOpportunitiesCount(params),
    pipelineValue(params),
    postedJournalCount(params),
  ]);
  return results;
}
