import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count, and, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import {
  cashForecastScenarios,
  cashForecastLines,
  bankAccounts,
  bankAccountBalances,
} from '../db/schema/index.js';
import { invoices } from '../db/schema/index.js';
import { apInvoices } from '../db/schema/index.js';

// ── Helpers ────────────────────────────────────────────────────────

/** Return the Monday (week start) for a given date, as YYYY-MM-DD string */
function isoWeekStart(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...6=Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

/** Add N weeks to a date, returning a new Date */
function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(d.getUTCDate() + n * 7);
  return result;
}

// ── Zod Schemas ────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createScenarioSchema = z.object({
  name: z.string().min(1),
  scenario: z.enum(['base', 'optimistic', 'pessimistic']).default('base'),
  windowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

const createForecastLineSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  inflowCents: z.number().int().min(0).default(0),
  outflowCents: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

const createBankAccountSchema = z.object({
  name: z.string().min(1),
  accountNumber: z.string().optional(),
  institution: z.string().optional(),
  currency: z.string().length(3).default('USD'),
});

const recordBalanceSchema = z.object({
  balanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  balanceCents: z.number().int(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function cashForecastRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── Scenarios ──────────────────────────────────────────────────

  // GET / — list scenarios (paginated)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      db.select({ value: count() }).from(cashForecastScenarios).where(eq(cashForecastScenarios.tenantId, tenantId)),
      db
        .select()
        .from(cashForecastScenarios)
        .where(eq(cashForecastScenarios.tenantId, tenantId))
        .orderBy(desc(cashForecastScenarios.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);
    return reply.send({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  });

  // POST / — create scenario
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createScenarioSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { name, scenario, windowStart } = parsed.data;

    const [row] = await db
      .insert(cashForecastScenarios)
      .values({ tenantId, name, scenario, windowStart, createdBy: userId })
      .returning();

    return reply.status(201).send(row);
  });

  // GET /:id — scenario + its lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [scenario] = await db
      .select()
      .from(cashForecastScenarios)
      .where(and(eq(cashForecastScenarios.id, id), eq(cashForecastScenarios.tenantId, tenantId)));

    if (!scenario) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Scenario not found' });
    }

    const lines = await db
      .select()
      .from(cashForecastLines)
      .where(and(eq(cashForecastLines.scenarioId, id), eq(cashForecastLines.tenantId, tenantId)))
      .orderBy(cashForecastLines.weekStart);

    return reply.send({ ...scenario, lines });
  });

  // POST /:id/lines — add a manual forecast line
  fastify.post('/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = createForecastLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [scenario] = await db
      .select()
      .from(cashForecastScenarios)
      .where(and(eq(cashForecastScenarios.id, id), eq(cashForecastScenarios.tenantId, tenantId)));

    if (!scenario) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Scenario not found' });
    }

    const { weekStart, inflowCents, outflowCents, notes } = parsed.data;

    const [line] = await db
      .insert(cashForecastLines)
      .values({
        tenantId,
        scenarioId: id,
        weekStart,
        inflowCents,
        outflowCents,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(line);
  });

  // ── Rolling 13-Week Actuals ────────────────────────────────────

  // GET /rolling — compute 13-week window from today using AR and AP data
  fastify.get('/rolling', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;

    // Build 13 week buckets starting from this week's Monday
    const todayMonday = isoWeekStart(new Date());
    const buckets: Array<{
      weekStart: string;
      arInflowCents: number;
      apOutflowCents: number;
      netCents: number;
    }> = [];

    for (let i = 0; i < 13; i++) {
      buckets.push({
        weekStart: isoWeekStart(addWeeks(new Date(todayMonday), i)),
        arInflowCents: 0,
        apOutflowCents: 0,
        netCents: 0,
      });
    }

    const windowEnd = isoWeekStart(addWeeks(new Date(todayMonday), 13));

    // Parallel AR + AP queries
    const [arRows, apRows] = await Promise.all([
      // AR: outstanding receivables (total - paid) grouped by week of due_date
      db
        .select({
          dueDate: invoices.dueDate,
          totalAmount: invoices.totalAmount,
          paidAmount: invoices.paidAmount,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            inArray(invoices.status, ['sent', 'overdue']),
            sql`${invoices.dueDate} >= ${todayMonday}::date`,
            sql`${invoices.dueDate} < ${windowEnd}::date`,
          ),
        ),

      // AP: outstanding payables grouped by week of due_date
      db
        .select({
          dueDate: apInvoices.dueDate,
          totalAmount: apInvoices.totalAmount,
        })
        .from(apInvoices)
        .where(
          and(
            eq(apInvoices.tenantId, tenantId),
            notInArray(apInvoices.status, ['paid', 'cancelled']),
            isNotNull(apInvoices.dueDate),
            sql`${apInvoices.dueDate} >= ${todayMonday}::date`,
            sql`${apInvoices.dueDate} < ${windowEnd}::date`,
          ),
        ),
    ]);

    // Build a lookup map by weekStart string
    const bucketIndex = new Map<string, number>();
    for (let i = 0; i < buckets.length; i++) {
      bucketIndex.set(buckets[i].weekStart, i);
    }

    // Accumulate AR inflows
    for (const row of arRows) {
      if (!row.dueDate) continue;
      const ws = isoWeekStart(new Date(row.dueDate as unknown as Date));
      const idx = bucketIndex.get(ws);
      if (idx !== undefined) {
        const outstanding = (row.totalAmount ?? 0) - (row.paidAmount ?? 0);
        buckets[idx].arInflowCents += outstanding > 0 ? outstanding : 0;
      }
    }

    // Accumulate AP outflows
    for (const row of apRows) {
      if (!row.dueDate) continue;
      const ws = isoWeekStart(new Date(row.dueDate as unknown as Date));
      const idx = bucketIndex.get(ws);
      if (idx !== undefined) {
        buckets[idx].apOutflowCents += row.totalAmount ?? 0;
      }
    }

    // Compute net per bucket
    for (const bucket of buckets) {
      bucket.netCents = bucket.arInflowCents - bucket.apOutflowCents;
    }

    return reply.send({ data: buckets });
  });

  // ── Bank Accounts ──────────────────────────────────────────────

  // GET /bank-accounts — list bank accounts
  fastify.get('/bank-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;

    const rows = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.tenantId, tenantId))
      .orderBy(desc(bankAccounts.createdAt));

    return reply.send({ data: rows });
  });

  // POST /bank-accounts — create bank account
  fastify.post('/bank-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBankAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { name, accountNumber, institution, currency } = parsed.data;

    const [row] = await db
      .insert(bankAccounts)
      .values({
        tenantId,
        name,
        accountNumber: accountNumber ?? null,
        institution: institution ?? null,
        currency,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(row);
  });

  // GET /bank-accounts/:id/balances — list balance snapshots
  fastify.get('/bank-accounts/:id/balances', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)));

    if (!account) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Bank account not found' });
    }

    const rows = await db
      .select()
      .from(bankAccountBalances)
      .where(and(eq(bankAccountBalances.bankAccountId, id), eq(bankAccountBalances.tenantId, tenantId)))
      .orderBy(desc(bankAccountBalances.balanceDate));

    return reply.send({ data: rows });
  });

  // POST /bank-accounts/:id/balances — record balance snapshot
  fastify.post('/bank-accounts/:id/balances', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = recordBalanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [account] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)));

    if (!account) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Bank account not found' });
    }

    const { balanceDate, balanceCents } = parsed.data;

    const [row] = await db
      .insert(bankAccountBalances)
      .values({
        tenantId,
        bankAccountId: id,
        balanceDate,
        balanceCents,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(row);
  });
}
