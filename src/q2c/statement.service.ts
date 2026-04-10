import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { invoices } from '../db/schema/index.js';
import { contacts, customers } from '../db/schema/index.js';
import { sendEmail } from '../core/email.service.js';
import { ok, err, type Result, type AppError } from '../lib/result.js';

// ── Types ──────────────────────────────────────────────────────────

interface AgingBucket {
  count: number;
  totalAmount: number;
  totalOutstanding: number;
}

interface StatementInvoice {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}

interface StatementResponse {
  customer_id: string;
  customer_name: string;
  statement_date: string;
  from: string;
  to: string;
  open_invoices: StatementInvoice[];
  credit_memos: unknown[];
  unapplied_payments: unknown[];
  aging_summary: {
    current: AgingBucket;
    '1_30': AgingBucket;
    '31_60': AgingBucket;
    '61_90': AgingBucket;
    '90plus': AgingBucket;
  };
  total_outstanding: number;
  truncated: boolean;
}

// ── Aging computation ──────────────────────────────────────────────

function emptyBucket(): AgingBucket {
  return { count: 0, totalAmount: 0, totalOutstanding: 0 };
}

function computeAgingBuckets(
  rows: Array<{ dueDate: Date | string; totalAmount: number; paidAmount: number }>,
  toDate: Date,
): StatementResponse['aging_summary'] {
  const buckets = {
    current: emptyBucket(),
    '1_30': emptyBucket(),
    '31_60': emptyBucket(),
    '61_90': emptyBucket(),
    '90plus': emptyBucket(),
  };

  for (const row of rows) {
    const due = row.dueDate instanceof Date ? row.dueDate : new Date(row.dueDate);
    // daysOverdue = how many days before toDate the invoice was due
    // positive = past due, negative = not yet due relative to toDate
    const daysOverdue = Math.floor((toDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const outstanding = row.totalAmount - row.paidAmount;

    let bucket: AgingBucket;
    if (daysOverdue < 0) {
      // dueDate > toDate → current (not yet due relative to statement date)
      bucket = buckets.current;
    } else if (daysOverdue <= 30) {
      // includes day 0 (dueDate == toDate) → current per spec: dueDate >= to
      bucket = daysOverdue === 0 ? buckets.current : buckets['1_30'];
    } else if (daysOverdue <= 60) {
      bucket = buckets['31_60'];
    } else if (daysOverdue <= 90) {
      bucket = buckets['61_90'];
    } else {
      bucket = buckets['90plus'];
    }

    bucket.count += 1;
    bucket.totalAmount += row.totalAmount;
    bucket.totalOutstanding += outstanding;
  }

  return buckets;
}

// ── getStatement ───────────────────────────────────────────────────

export async function getStatement(
  tenantId: string,
  customerId: string,
  from: string,
  to: string,
): Promise<Result<StatementResponse, AppError>> {
  // Verify customer exists for this tenant
  const customerRows = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  const customer = customerRows[0];
  if (!customer) {
    return err({ code: 'NOT_FOUND', message: `Customer '${customerId}' not found` });
  }

  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T00:00:00Z');

  // Fetch limit 501 to detect truncation
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.customerId, customerId),
        sql`${invoices.status} IN ('sent', 'overdue')`,
        gte(invoices.dueDate, fromDate),
        lte(invoices.dueDate, toDate),
      ),
    )
    .limit(501);

  const truncated = rows.length > 500;
  const capped = truncated ? rows.slice(0, 500) : rows;

  const open_invoices: StatementInvoice[] = capped.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    dueDate: (inv.dueDate instanceof Date ? inv.dueDate : new Date(inv.dueDate)).toISOString().split('T')[0]!,
    totalAmount: inv.totalAmount,
    paidAmount: inv.paidAmount,
    outstanding: inv.totalAmount - inv.paidAmount,
    status: inv.status,
  }));

  const total_outstanding = capped.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);

  const aging_summary = computeAgingBuckets(capped, toDate);

  return ok({
    customer_id: customer.id,
    customer_name: customer.name,
    statement_date: to,
    from,
    to,
    open_invoices,
    credit_memos: [],
    unapplied_payments: [],
    aging_summary,
    total_outstanding,
    truncated,
  });
}

// ── sendStatement ──────────────────────────────────────────────────

export async function sendStatement(
  tenantId: string,
  customerId: string,
  toEmail?: string,
): Promise<Result<{ messageId: string; sentTo: string }, AppError>> {
  // Verify customer exists
  const customerRows = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  const customer = customerRows[0];
  if (!customer) {
    return err({ code: 'NOT_FOUND', message: `Customer '${customerId}' not found` });
  }

  let resolvedEmail: string;

  if (toEmail) {
    resolvedEmail = toEmail;
  } else {
    // Resolve primary contact email
    const contactRows = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          eq(contacts.customerId, customerId),
          eq(contacts.isPrimary, true),
        ),
      )
      .limit(1);

    const primaryEmail = contactRows[0]?.email;
    if (!primaryEmail) {
      return err({ code: 'VALIDATION', message: 'No email could be resolved: customer has no primary contact with an email address' });
    }
    resolvedEmail = primaryEmail;
  }

  const emailResult = await sendEmail({
    to: resolvedEmail,
    subject: `Account Statement — ${customer.name}`,
    html: `<p>Please find your account statement attached.</p><p>Customer: ${customer.name}</p>`,
    text: `Please find your account statement for ${customer.name}.`,
  });

  if (!emailResult.ok) return emailResult;

  return ok({ messageId: emailResult.value.messageId, sentTo: resolvedEmail });
}

export const statementService = { getStatement, sendStatement };
