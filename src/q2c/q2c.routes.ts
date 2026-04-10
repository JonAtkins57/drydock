import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { quoteService } from './quotes.service.js';
import { orderService } from './orders.service.js';
import { invoiceService } from './invoices.service.js';
import { billingService } from './billing.service.js';
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

// ── Combined Q2C Plugin ───────────────────────────────────────────

export async function q2cRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(quoteRoutes, { prefix: '/api/v1/quotes' });
  await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
  await fastify.register(invoiceRoutes, { prefix: '/api/v1/invoices' });
  await fastify.register(billingPlanRoutes, { prefix: '/api/v1/billing-plans' });
  await fastify.register(reportRoutes, { prefix: '/api/v1/reports' });
}
