import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { requisitionService } from './requisitions.service.js';
import { purchaseOrderService } from './purchase-orders.service.js';
import {
  createRequisitionSchema,
  listRequisitionsQuerySchema,
  convertToPOSchema,
  createPOSchema,
  listPOsQuerySchema,
  receivePOSchema,
  listGoodsReceiptsQuerySchema,
  paginationQuerySchema,
} from './p2p.schemas.js';
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

// ── Requisition Routes ─────────────────────────────────────────────

export async function requisitionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list requisitions
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listRequisitionsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await requisitionService.listRequisitions(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get requisition with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await requisitionService.getRequisition(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create requisition
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRequisitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await requisitionService.createRequisition(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/submit — submit for approval
  fastify.post('/:id/submit', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await requisitionService.submitForApproval(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/approve — approve requisition
  fastify.post('/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await requisitionService.approveRequisition(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/convert-to-po — convert approved requisition to PO
  fastify.post('/:id/convert-to-po', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = convertToPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await requisitionService.convertToPO(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });
}

// ── Purchase Order Routes ──────────────────────────────────────────

export async function purchaseOrderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list POs
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listPOsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await purchaseOrderService.listPOs(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get PO with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await purchaseOrderService.getPO(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create PO
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await purchaseOrderService.createPO(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/approve — approve PO
  fastify.post('/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await purchaseOrderService.approvePO(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/dispatch — dispatch PO
  fastify.post('/:id/dispatch', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await purchaseOrderService.dispatchPO(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/receive — receive goods against PO
  fastify.post('/:id/receive', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = receivePOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await purchaseOrderService.receivePO(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });
}

// ── Goods Receipt Routes ───────────────────────────────────────────

export async function goodsReceiptRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list goods receipts
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listGoodsReceiptsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await purchaseOrderService.listGoodsReceipts(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get goods receipt with lines
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await purchaseOrderService.getGoodsReceipt(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── Combined P2P Plugin ────────────────────────────────────────────

export async function p2pRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(requisitionRoutes, { prefix: '/api/v1/requisitions' });
  await fastify.register(purchaseOrderRoutes, { prefix: '/api/v1/purchase-orders' });
  await fastify.register(goodsReceiptRoutes, { prefix: '/api/v1/goods-receipts' });
}
