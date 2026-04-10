import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticateHook, requirePermission, setTenantContext } from '../core/auth.middleware';
import {
  createManualInvoiceSchema,
  createFromUploadSchema,
  updateLineCodingSchema,
  matchToPOSchema,
  createCodingRuleSchema,
  listInvoicesQuerySchema,
} from './ap.schemas';
import * as intakeSvc from './intake.service';
import * as codingSvc from './coding.service';
import * as matchingSvc from './matching.service';
import { eq, and, sql, asc } from 'drizzle-orm';
import { db, pool } from '../db/connection';
import { apInvoices, apInvoiceLines, codingRules, journalEntries, journalEntryLines, accounts } from '../db/schema/index';
import { ok, err, type AppErrorCode } from '../lib/result';
import { logAction } from '../core/audit.service';
import { generateNumber } from '../core/numbering.service';

// ── Error response helper ──────────────────────────────────────────

const STATUS_MAP: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL: 500,
  BAD_REQUEST: 400,
};

function errorStatus(code: AppErrorCode): number {
  return STATUS_MAP[code] ?? 500;
}

function errorResponse(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
  const status = errorStatus(code);
  return {
    type: `https://httpstatuses.io/${status}`,
    title: code,
    status,
    detail: message,
    ...(details ? { details } : {}),
  };
}

// ── Plugin ─────────────────────────────────────────────────────────

const apRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ════════════════════════════════════════════════════════════════
  // AP INVOICES — CRUD
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/ap-invoices — create manual invoice
  fastify.post('/api/v1/ap-invoices', {
    preHandler: [requirePermission('ap.invoice.create')],
  }, async (request, reply) => {
    const parsed = createManualInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await intakeSvc.createManualInvoice(tenantId, parsed.data, userId);
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message, result.error.details),
      );
    }

    return reply.status(201).send(result.value);
  });

  // POST /api/v1/ap-invoices/upload — create from upload
  fastify.post('/api/v1/ap-invoices/upload', {
    preHandler: [requirePermission('ap.invoice.create')],
  }, async (request, reply) => {
    const parsed = createFromUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await intakeSvc.createFromUpload(tenantId, parsed.data, userId);
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/ap-invoices — list invoices
  fastify.get('/api/v1/ap-invoices', {
    preHandler: [requirePermission('ap.invoice.read')],
  }, async (request, reply) => {
    const parsed = listInvoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const { tenantId } = request.currentUser;
    const opts = parsed.data;
    const conditions = [eq(apInvoices.tenantId, tenantId)];

    if (opts.status) conditions.push(eq(apInvoices.status, opts.status));
    if (opts.vendorId) conditions.push(eq(apInvoices.vendorId, opts.vendorId));
    if (opts.startDate) conditions.push(sql`${apInvoices.invoiceDate} >= ${opts.startDate}::timestamptz`);
    if (opts.endDate) conditions.push(sql`${apInvoices.invoiceDate} <= ${opts.endDate}::timestamptz`);

    const where = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apInvoices)
      .where(where);

    const total = countResult?.count ?? 0;
    const offset = (opts.page - 1) * opts.pageSize;

    const data = await db
      .select()
      .from(apInvoices)
      .where(where)
      .orderBy(asc(apInvoices.createdAt))
      .limit(opts.pageSize)
      .offset(offset);

    return reply.status(200).send({ data, total, page: opts.page, pageSize: opts.pageSize });
  });

  // GET /api/v1/ap-invoices/queue — processing console (group by status)
  fastify.get('/api/v1/ap-invoices/queue', {
    preHandler: [requirePermission('ap.invoice.read')],
  }, async (request, reply) => {
    const { tenantId } = request.currentUser;

    const rows = await db
      .select({
        status: apInvoices.status,
        count: sql<number>`count(*)::int`,
        totalAmount: sql<number>`COALESCE(sum(${apInvoices.totalAmount}), 0)::int`,
      })
      .from(apInvoices)
      .where(eq(apInvoices.tenantId, tenantId))
      .groupBy(apInvoices.status);

    return reply.status(200).send({ queue: rows });
  });

  // GET /api/v1/ap-invoices/:id — get single invoice with lines
  fastify.get<{ Params: { id: string } }>('/api/v1/ap-invoices/:id', {
    preHandler: [requirePermission('ap.invoice.read')],
  }, async (request, reply) => {
    const { tenantId } = request.currentUser;

    const [invoice] = await db
      .select()
      .from(apInvoices)
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, request.params.id)))
      .limit(1);

    if (!invoice) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'AP invoice not found'));
    }

    const lines = await db
      .select()
      .from(apInvoiceLines)
      .where(
        and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.apInvoiceId, invoice.id)),
      )
      .orderBy(asc(apInvoiceLines.lineNumber));

    return reply.status(200).send({ ...invoice, lines });
  });

  // ════════════════════════════════════════════════════════════════
  // AP INVOICE ACTIONS
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/ap-invoices/:id/actions/code — apply coding rules
  fastify.post<{ Params: { id: string } }>('/api/v1/ap-invoices/:id/actions/code', {
    preHandler: [requirePermission('ap.invoice.code')],
  }, async (request, reply) => {
    const { tenantId } = request.currentUser;
    const result = await codingSvc.applyCodingRules(tenantId, request.params.id);
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/ap-invoices/:id/actions/submit — submit for approval
  fastify.post<{ Params: { id: string } }>('/api/v1/ap-invoices/:id/actions/submit', {
    preHandler: [requirePermission('ap.invoice.submit')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await codingSvc.submitForApproval(tenantId, request.params.id, userId);
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/ap-invoices/:id/actions/approve
  fastify.post<{ Params: { id: string } }>('/api/v1/ap-invoices/:id/actions/approve', {
    preHandler: [requirePermission('ap.invoice.approve')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;

    const [invoice] = await db
      .select()
      .from(apInvoices)
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, request.params.id)))
      .limit(1);

    if (!invoice) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'AP invoice not found'));
    }

    if (invoice.status !== 'approval') {
      return reply.status(422).send(errorResponse('VALIDATION',
        `Cannot approve invoice in '${invoice.status}' status. Must be 'approval'.`));
    }

    // Segregation of duties: approver != creator
    if (invoice.createdBy === userId) {
      return reply.status(403).send(errorResponse('FORBIDDEN',
        'Cannot approve an invoice you created (segregation of duties)'));
    }

    const [updated] = await db
      .update(apInvoices)
      .set({ status: 'approved', updatedAt: new Date(), updatedBy: userId })
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, request.params.id)))
      .returning();

    await logAction({
      tenantId,
      userId,
      action: 'ap_invoice.approve',
      entityType: 'ap_invoice',
      entityId: request.params.id,
    });

    return reply.status(200).send(updated);
  });

  // POST /api/v1/ap-invoices/:id/actions/post — post to GL (create journal entry)
  fastify.post<{ Params: { id: string } }>('/api/v1/ap-invoices/:id/actions/post', {
    preHandler: [requirePermission('ap.invoice.post')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const invoiceId = request.params.id;

    const [invoice] = await db
      .select()
      .from(apInvoices)
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, invoiceId)))
      .limit(1);

    if (!invoice) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'AP invoice not found'));
    }

    if (invoice.status !== 'approved') {
      return reply.status(422).send(errorResponse('VALIDATION',
        `Cannot post invoice in '${invoice.status}' status. Must be 'approved'.`));
    }

    // Fetch lines for journal entry creation
    const lines = await db
      .select()
      .from(apInvoiceLines)
      .where(and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.apInvoiceId, invoiceId)))
      .orderBy(asc(apInvoiceLines.lineNumber));

    if (lines.length === 0) {
      return reply.status(422).send(errorResponse('VALIDATION', 'Invoice has no lines to post'));
    }

    // Create GL journal entry: debit expense accounts, credit AP
    // Find AP liability account for the vendor
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate journal number
      const numResult = await generateNumber(tenantId, 'journal_entry');
      if (!numResult.ok) {
        await client.query('ROLLBACK');
        return reply.status(500).send(errorResponse('INTERNAL', numResult.error.message));
      }

      // Find the current open period
      const { rows: periodRows } = await client.query<{ id: string }>(
        `SELECT id FROM drydock_gl.accounting_periods
         WHERE tenant_id = $1 AND status = 'open'
         AND start_date <= NOW() AND end_date >= NOW()
         LIMIT 1`,
        [tenantId],
      );

      if (!periodRows[0]) {
        await client.query('ROLLBACK');
        return reply.status(422).send(errorResponse('VALIDATION', 'No open accounting period found for current date'));
      }

      const totalAmount = invoice.totalAmount ?? lines.reduce((sum, l) => sum + l.amount, 0);

      // Create journal entry
      const { rows: jeRows } = await client.query<{ id: string }>(
        `INSERT INTO drydock_gl.journal_entries
         (tenant_id, journal_number, journal_type, period_id, posting_date, description,
          status, source_module, source_entity_type, source_entity_id, created_by)
         VALUES ($1, $2, 'automated', $3, NOW(), $4, 'draft', 'ap', 'ap_invoice', $5, $6)
         RETURNING id`,
        [
          tenantId,
          numResult.value,
          periodRows[0].id,
          `AP Invoice ${invoice.invoiceNumber} - Vendor ${invoice.vendorId}`,
          invoiceId,
          userId,
        ],
      );

      const journalId = jeRows[0]?.id;
      if (!journalId) {
        await client.query('ROLLBACK');
        return reply.status(500).send(errorResponse('INTERNAL', 'Failed to create journal entry'));
      }

      // Debit lines (expense accounts from invoice lines)
      let lineNum = 1;
      for (const line of lines) {
        if (!line.accountId) continue;
        await client.query(
          `INSERT INTO drydock_gl.journal_entry_lines
           (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description,
            department_id, project_id, cost_center_id)
           VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)`,
          [journalId, lineNum++, line.accountId, line.amount, line.description,
           line.departmentId, line.projectId, line.costCenterId],
        );
      }

      // Credit line (AP liability account) — use vendor default or first AP account
      const { rows: apAcctRows } = await client.query<{ id: string }>(
        `SELECT id FROM drydock_gl.accounts
         WHERE tenant_id = $1 AND account_type = 'liability' AND is_active = true
         AND name ILIKE '%accounts payable%'
         LIMIT 1`,
        [tenantId],
      );

      const apAccountId = apAcctRows[0]?.id;
      if (!apAccountId) {
        await client.query('ROLLBACK');
        return reply.status(422).send(errorResponse('VALIDATION',
          'No accounts payable GL account found. Create a liability account named "Accounts Payable" first.'));
      }

      await client.query(
        `INSERT INTO drydock_gl.journal_entry_lines
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description, vendor_id)
         VALUES ($1, $2, $3, 0, $4, $5, $6)`,
        [journalId, lineNum, apAccountId, totalAmount,
         `AP - Invoice ${invoice.invoiceNumber}`, invoice.vendorId],
      );

      // Update invoice status to posted
      await client.query(
        `UPDATE drydock_ap.ap_invoices SET status = 'posted', updated_at = NOW(), updated_by = $1
         WHERE id = $2 AND tenant_id = $3`,
        [userId, invoiceId, tenantId],
      );

      // Audit
      await client.query(
        `INSERT INTO drydock_audit.audit_log (tenant_id, user_id, action, entity_type, entity_id, changes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, userId, 'ap_invoice.post', 'ap_invoice', invoiceId,
         JSON.stringify({ journalEntryId: journalId, journalNumber: numResult.value, totalAmount })],
      );

      await client.query('COMMIT');

      return reply.status(200).send({
        invoiceId,
        status: 'posted',
        journalEntryId: journalId,
        journalNumber: numResult.value,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const msg = error instanceof Error ? error.message : 'Unknown error during posting';
      return reply.status(500).send(errorResponse('INTERNAL', msg));
    } finally {
      client.release();
    }
  });

  // POST /api/v1/ap-invoices/:id/match — match to PO
  fastify.post<{ Params: { id: string } }>('/api/v1/ap-invoices/:id/match', {
    preHandler: [requirePermission('ap.invoice.match')],
  }, async (request, reply) => {
    const parsed = matchToPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId } = request.currentUser;
    const { poId, receiptId } = parsed.data;

    const result = receiptId
      ? await matchingSvc.threeWayMatch(tenantId, request.params.id, poId, receiptId)
      : await matchingSvc.matchToPO(tenantId, request.params.id, poId);

    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(200).send(result.value);
  });

  // ════════════════════════════════════════════════════════════════
  // CODING RULES
  // ════════════════════════════════════════════════════════════════

  // GET /api/v1/coding-rules
  fastify.get('/api/v1/coding-rules', {
    preHandler: [requirePermission('ap.coding_rule.read')],
  }, async (request, reply) => {
    const { tenantId } = request.currentUser;

    const rules = await db
      .select()
      .from(codingRules)
      .where(eq(codingRules.tenantId, tenantId))
      .orderBy(asc(codingRules.priority));

    return reply.status(200).send({ data: rules });
  });

  // POST /api/v1/coding-rules
  fastify.post('/api/v1/coding-rules', {
    preHandler: [requirePermission('ap.coding_rule.create')],
  }, async (request, reply) => {
    const parsed = createCodingRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId } = request.currentUser;

    const [rule] = await db
      .insert(codingRules)
      .values({
        tenantId,
        vendorId: parsed.data.vendorId ?? null,
        descriptionPattern: parsed.data.descriptionPattern ?? null,
        defaultAccountId: parsed.data.defaultAccountId,
        defaultDepartmentId: parsed.data.defaultDepartmentId ?? null,
        defaultProjectId: parsed.data.defaultProjectId ?? null,
        defaultCostCenterId: parsed.data.defaultCostCenterId ?? null,
        priority: parsed.data.priority,
      })
      .returning();

    if (!rule) {
      return reply.status(500).send(errorResponse('INTERNAL', 'Failed to create coding rule'));
    }

    return reply.status(201).send(rule);
  });

  // PUT /api/v1/ap-invoices/:id/lines/:lineId/coding — update line coding
  fastify.put<{ Params: { id: string; lineId: string } }>(
    '/api/v1/ap-invoices/:id/lines/:lineId/coding',
    { preHandler: [requirePermission('ap.invoice.code')] },
    async (request, reply) => {
      const parsed = updateLineCodingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
          errors: parsed.error.flatten().fieldErrors,
        }));
      }

      const { tenantId, sub: userId } = request.currentUser;
      const result = await codingSvc.updateLineCoding(
        tenantId,
        request.params.id,
        request.params.lineId,
        parsed.data,
        userId,
      );

      if (!result.ok) {
        return reply.status(errorStatus(result.error.code)).send(
          errorResponse(result.error.code, result.error.message),
        );
      }

      return reply.status(200).send(result.value);
    },
  );

  done();
};

export default apRoutes;
