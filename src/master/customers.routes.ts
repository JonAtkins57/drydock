import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook } from '../core/auth.middleware.js';
import { customerService } from './master.service.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
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

export async function customerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  // GET / — list customers
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
    const result = await customerService.list(tenantId, query.data);

    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get customer by id
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await customerService.getById(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create customer
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await customerService.create(tenantId, parsed.data, userId);

    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update customer
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await customerService.update(tenantId, id, parsed.data, userId);

    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // DELETE /:id — deactivate customer
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await customerService.deactivate(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id/contacts — list contacts for customer
  fastify.get('/:id/contacts', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    // Verify customer exists
    const custResult = await customerService.getById(tenantId, id);
    if (!custResult.ok) return sendError(reply, custResult.error);

    const result = await customerService.listContacts(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // GET /:id/duplicate-check — check for duplicate customers (also available as query)
  fastify.get('/duplicate-check', async (request: FastifyRequest<{
    Querystring: { name: string; customerNumber?: string };
  }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { name, customerNumber } = request.query;

    if (!name) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'name query parameter is required',
      });
    }

    const result = await customerService.duplicateCheck(tenantId, name, customerNumber);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}
