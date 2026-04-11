import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNotNull } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { quoteService } from './quotes.service.js';
import { orderService } from './orders.service.js';
import { invoiceService } from './invoices.service.js';
import { billingService } from './billing.service.js';
import { creditMemoRoutes } from './credit-memos.routes.js';
import { revRecRoutes } from './rev-rec.routes.js';
import { statementService } from './statement.service.js';
import { generateQuotePdf, generateInvoicePdf } from './pdf.js';
import { db } from '../db/connection.js';
import { contacts, quotes } from '../db/schema/index.js';
import { sendTransactionEmail } from '../email/email-log.service.js';
import { logAction } from '../core/audit.service.js';
import { sendEnvelope, getDocuSignConfig, DocuSignApiError } from '../integration/docusign.js';
import {
  createQuoteSchema,
  updateQuoteSchema,
  listQuotesQuerySchema,
  createOrderSchema,
  listOrdersQuerySchema,
  createInvoiceSchema,
  listInvoicesQuerySchema,
  recordPaymentSchema,
  createBillingPlanSchema,
  listBillingPlansQuerySchema,
  paginationQuerySchema,
} from './q2c.schemas.js';
import type { AppError } from '../lib/result.js';

// ── HTML escaping helper ───────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Error response helper ──────────────────────────────────────────

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  const status = STATUS_MAP[error.code] ?? 500;
  return reply.status(status).send({
    error: error.code,
    message: error.message,
    details: error.details,
  });
}

// ── Quote Routes ──────────────────────────────────────────────────

async function quoteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list quotes
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuotesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await quoteService.listQuotes(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get quote with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await quoteService.getQuote(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create quote
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createQuoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await quoteService.createQuote(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update quote (versioning for non-draft)
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateQuoteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await quoteService.updateQuote(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/send — send quote
  fastify.post('/:id/actions/send', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await quoteService.sendQuote(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/accept — accept quote, auto-create order
  fastify.post('/:id/actions/accept', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await quoteService.acceptQuote(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/actions/send-email — email quote to primary contact
  fastify.post('/:id/actions/send-email', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const quoteResult = await quoteService.getQuote(tenantId, id);
    if (!quoteResult.ok) return sendError(reply, quoteResult.error);
    const quote = quoteResult.value;

    const contactRows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.customerId, quote.customerId),
          eq(contacts.tenantId, tenantId),
          eq(contacts.isPrimary, true),
          eq(contacts.isActive, true),
          isNotNull(contacts.email),
        ),
      )
      .limit(1);

    const toEmail = contactRows[0]?.email ?? '';

    const totalDollars = '$' + (quote.totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const validUntilStr = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-US') : 'N/A';
    const safeQuoteNumber = escapeHtml(quote.quoteNumber ?? '');
    const safeQuoteName = escapeHtml(quote.name ?? '');
    const subject = `Quote ${safeQuoteNumber}: ${safeQuoteName}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1a3a4a; font-size: 24px;">Quote ${safeQuoteNumber}</h1>
        <p style="color: #4a5568;"><strong>Name:</strong> ${safeQuoteName}</p>
        <p style="color: #4a5568;"><strong>Total:</strong> ${totalDollars}</p>
        <p style="color: #4a5568;"><strong>Valid Until:</strong> ${validUntilStr}</p>
        <p style="color: #718096; font-size: 13px; margin-top: 30px;">Thrasoz / DryDock Operational Platform</p>
      </div>
    `;

    const logResult = await sendTransactionEmail(tenantId, 'quote', id, toEmail, subject, html);
    if (!logResult.ok) return sendError(reply, logResult.error);
    return reply.send(logResult.value);
  });

  // POST /:id/actions/send-for-signature — send quote to DocuSign for e-signature
  fastify.post('/:id/actions/send-for-signature', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const quoteResult = await quoteService.getQuote(tenantId, id);
    if (!quoteResult.ok) return sendError(reply, quoteResult.error);
    const quote = quoteResult.value;

    if (!['draft', 'sent'].includes(quote.status)) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `Cannot send for signature from status: ${quote.status}`,
      });
    }

    if (quote.docusignEnvelopeId) {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: `Quote already has a DocuSign envelope: ${quote.docusignEnvelopeId}`,
      });
    }

    const config = getDocuSignConfig();
    if (!config) {
      return reply.status(500).send({
        error: 'INTERNAL',
        message: 'DocuSign is not configured (missing DOCUSIGN_ACCOUNT_ID, DOCUSIGN_BASE_URL, or DOCUSIGN_ACCESS_TOKEN)',
      });
    }

    // Look up primary contact for signer details
    const contactRows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.customerId, quote.customerId),
          eq(contacts.tenantId, tenantId),
          eq(contacts.isPrimary, true),
          eq(contacts.isActive, true),
          isNotNull(contacts.email),
        ),
      )
      .limit(1);

    const contact = contactRows[0];
    if (!contact?.email) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'No primary contact with email found for this customer',
      });
    }

    const signerName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.email;

    // Build a plain-text document representing the quote
    const documentLines: string[] = [
      `Quote: ${escapeHtml(quote.quoteNumber)}`,
      `Name: ${escapeHtml(quote.name)}`,
      `Total: $${(quote.totalAmount / 100).toFixed(2)}`,
      `Valid Until: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-US') : 'N/A'}`,
      '',
      'Line Items:',
      ...quote.lines.map(
        (l) => `  ${l.description}  qty: ${l.quantity}  unit: $${(l.unitPrice / 100).toFixed(2)}  total: $${(l.amount / 100).toFixed(2)}`
      ),
      '',
      'By signing below, you accept the terms of this quote.',
      '',
      'Signature: ___________________________  Date: ___________',
    ];
    const documentBase64 = Buffer.from(documentLines.join('\n'), 'utf-8').toString('base64');

    try {
      const envelopeResult = await sendEnvelope(config, {
        subject: `Please sign Quote ${quote.quoteNumber}`,
        signers: [{ name: signerName, email: contact.email, recipientId: '1' }],
        documentBase64,
        documentName: `Quote_${quote.quoteNumber}.txt`,
        fileExtension: 'txt',
        documentId: '1',
      });

      await db
        .update(quotes)
        .set({
          docusignEnvelopeId: envelopeResult.envelopeId,
          docusignStatus: envelopeResult.status,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(quotes.id, id), eq(quotes.tenantId, tenantId)));

      await logAction({
        tenantId,
        userId,
        action: 'send_for_signature',
        entityType: 'quote',
        entityId: id,
        changes: { envelopeId: envelopeResult.envelopeId, signerEmail: contact.email },
      });

      return reply.send({
        envelopeId: envelopeResult.envelopeId,
        status: envelopeResult.status,
        signerEmail: contact.email,
      });
    } catch (e) {
      if (e instanceof DocuSignApiError) {
        return reply.status(502).send({
          error: 'INTERNAL',
          message: e.message,
          details: { docusignResponse: e.responseBody },
        });
      }
      const message = e instanceof Error ? e.message : 'Unexpected error calling DocuSign';
      return reply.status(500).send({ error: 'INTERNAL', message });
    }
  });
}

// ── Order Routes ──────────────────────────────────────────────────

async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list orders
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listOrdersQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await orderService.listOrders(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get order with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await orderService.getOrder(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create order
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await orderService.createOrder(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/actions/confirm — confirm order
  fastify.post('/:id/actions/confirm', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await orderService.confirmOrder(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/invoice — generate invoice from order
  fastify.post('/:id/actions/invoice', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await orderService.generateInvoice(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });
}

// ── Invoice Routes ────────────────────────────────────────────────

async function invoiceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list invoices
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listInvoicesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await invoiceService.listInvoices(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get invoice with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await invoiceService.getInvoice(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create invoice
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await invoiceService.createInvoice(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/actions/send — send invoice
  fastify.post('/:id/actions/send', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await invoiceService.sendInvoice(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/pay — record payment
  fastify.post('/:id/actions/pay', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = recordPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await invoiceService.recordPayment(tenantId, id, parsed.data.amount, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/send-email — email invoice to primary contact
  fastify.post('/:id/actions/send-email', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const invoiceResult = await invoiceService.getInvoice(tenantId, id);
    if (!invoiceResult.ok) return sendError(reply, invoiceResult.error);
    const invoice = invoiceResult.value;

    const contactRows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.customerId, invoice.customerId),
          eq(contacts.tenantId, tenantId),
          eq(contacts.isPrimary, true),
          eq(contacts.isActive, true),
          isNotNull(contacts.email),
        ),
      )
      .limit(1);

    const toEmail = contactRows[0]?.email ?? '';

    const totalDollars = '$' + (invoice.totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-US');
    const safeInvoiceNumber = escapeHtml(invoice.invoiceNumber ?? '');
    const subject = `Invoice ${safeInvoiceNumber} — Due ${dueDateStr}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1a3a4a; font-size: 24px;">Invoice ${safeInvoiceNumber}</h1>
        <p style="color: #4a5568;"><strong>Total:</strong> ${totalDollars}</p>
        <p style="color: #4a5568;"><strong>Due Date:</strong> ${dueDateStr}</p>
        <p style="color: #718096; font-size: 13px; margin-top: 30px;">Thrasoz / DryDock Operational Platform</p>
      </div>
    `;

    const logResult = await sendTransactionEmail(tenantId, 'invoice', id, toEmail, subject, html);
    if (!logResult.ok) return sendError(reply, logResult.error);
    return reply.send(logResult.value);
  });
}

// ── Billing Plan Routes ───────────────────────────────────────────

async function billingPlanRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list billing plans
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listBillingPlansQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await billingService.listBillingPlans(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get billing plan with schedule
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await billingService.getBillingPlan(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create billing plan
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBillingPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await billingService.createBillingPlan(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /process — process scheduled billing
  fastify.post('/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const result = await billingService.processScheduledBilling(tenantId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── AR Aging Report Route ─────────────────────────────────────────

async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /ar-aging — accounts receivable aging report
  fastify.get('/ar-aging', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const result = await invoiceService.getAgingReport(tenantId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });
}

// ── PDF Routes ────────────────────────────────────────────────────

async function pdfRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /quotes/:id/pdf
  fastify.get<{ Params: { id: string } }>('/quotes/:id/pdf', async (request, reply) => {
    const result = await generateQuotePdf(request.currentUser.tenantId, request.params.id);
    if (!result.ok) return sendError(reply, result.error);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="quote-${request.params.id}.pdf"`)
      .send(result.value);
  });

  // GET /invoices/:id/pdf
  fastify.get<{ Params: { id: string } }>('/invoices/:id/pdf', async (request, reply) => {
    const result = await generateInvoicePdf(request.currentUser.tenantId, request.params.id);
    if (!result.ok) return sendError(reply, result.error);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="invoice-${request.params.id}.pdf"`)
      .send(result.value);
  });
}

// ── Customer Statement Routes ─────────────────────────────────────

async function statementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /:id/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
  fastify.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/:id/statement',
    async (request, reply) => {
      const { tenantId } = request.currentUser;
      const { id } = request.params;
      const from = request.query.from ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]!;
      const to = request.query.to ?? new Date().toISOString().split('T')[0]!;
      const result = await statementService.getStatement(tenantId, id, from, to);
      if (!result.ok) return sendError(reply, result.error);
      return reply.send(result.value);
    },
  );

  // POST /:id/statement/send
  fastify.post<{ Params: { id: string }; Body: { email?: string } }>(
    '/:id/statement/send',
    async (request, reply) => {
      const { tenantId } = request.currentUser;
      const { id } = request.params;
      const result = await statementService.sendStatement(tenantId, id, request.body?.email);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );
}

// ── Combined Q2C Plugin ───────────────────────────────────────────

export async function q2cRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(quoteRoutes, { prefix: '/api/v1/quotes' });
  await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
  await fastify.register(invoiceRoutes, { prefix: '/api/v1/invoices' });
  await fastify.register(billingPlanRoutes, { prefix: '/api/v1/billing-plans' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });
  await fastify.register(creditMemoRoutes, { prefix: '/api/v1/credit-memos' });
  await fastify.register(revRecRoutes, { prefix: '/api/v1/rev-rec' });
  await fastify.register(pdfRoutes, { prefix: '/api/v1' });
  await fastify.register(statementRoutes, { prefix: '/api/v1/customers' });
}
