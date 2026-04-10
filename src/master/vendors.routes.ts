import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook } from '../core/auth.middleware.js';
import { vendorService } from './master.service.js';
import {
  createVendorSchema,
  updateVendorSchema,
  paginationQuerySchema,
} from './master.schemas.js';
import type { AppError } from '../lib/result.js';

// ── Error response helper ───────────────────────────────────────────

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

// ── Route registration ──────────────────────────────────────────────

export async function vendorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  // GET / — list vendors
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = paginationQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await vendorService.list(tenantId, query.data);

    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get vendor by id
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await vendorService.getById(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create vendor
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createVendorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await vendorService.create(tenantId, parsed.data, userId);

    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update vendor
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateVendorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await vendorService.update(tenantId, id, parsed.data, userId);

    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // DELETE /:id — deactivate vendor
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await vendorService.deactivate(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id/contacts — list contacts for vendor
  fastify.get('/:id/contacts', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const vendResult = await vendorService.getById(tenantId, id);
    if (!vendResult.ok) return sendError(reply, vendResult.error);

    const result = await vendorService.listContacts(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // GET /duplicate-check — check for duplicate vendors
  fastify.get('/duplicate-check', async (request: FastifyRequest<{
    Querystring: { name: string; vendorNumber?: string };
  }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { name, vendorNumber } = request.query;

    if (!name) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'name query parameter is required',
      });
    }

    const result = await vendorService.duplicateCheck(tenantId, name, vendorNumber);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}
