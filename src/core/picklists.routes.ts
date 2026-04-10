import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPicklist,
  getPicklist,
  listPicklists,
  updatePicklist,
  addPicklistValue,
  updatePicklistValue,
  deactivatePicklistValue,
} from './picklists.service.js';
import {
  createPicklistSchema,
  updatePicklistSchema,
  createPicklistValueSchema,
  updatePicklistValueSchema,
} from './custom-fields.schemas.js';
import type { AppError } from '../lib/result.js';

function httpStatus(code: AppError['code']): number {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'VALIDATION': return 400;
    case 'BAD_REQUEST': return 400;
    case 'CONFLICT': return 409;
    case 'UNAUTHORIZED': return 401;
    case 'FORBIDDEN': return 403;
    case 'INTERNAL': return 500;
    default: return 500;
  }
}

function getTenantId(request: FastifyRequest): string {
  return (request.headers['x-tenant-id'] as string) ?? '';
}

export default async function picklistRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    const tenantId = getTenantId(request);
    if (!tenantId) {
      return reply.status(400).send({ error: 'x-tenant-id header is required' });
    }
  });

  // ── POST /api/v1/picklists ─────────────────────────────────────
  app.post('/api/v1/picklists', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const parsed = createPicklistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await createPicklist(tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
    }
    return reply.status(201).send(result.value);
  });

  // ── GET /api/v1/picklists ──────────────────────────────────────
  app.get('/api/v1/picklists', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);

    const result = await listPicklists(tenantId);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
    }
    return reply.status(200).send(result.value);
  });

  // ── GET /api/v1/picklists/:id ──────────────────────────────────
  app.get('/api/v1/picklists/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const result = await getPicklist(tenantId, id);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
    }
    return reply.status(200).send(result.value);
  });

  // ── PATCH /api/v1/picklists/:id ────────────────────────────────
  app.patch('/api/v1/picklists/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const parsed = updatePicklistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await updatePicklist(tenantId, id, parsed.data);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
    }
    return reply.status(200).send(result.value);
  });

  // ── POST /api/v1/picklists/:picklistId/values ──────────────────
  app.post(
    '/api/v1/picklists/:picklistId/values',
    async (request: FastifyRequest<{ Params: { picklistId: string } }>, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const { picklistId } = request.params;

      const parsed = createPicklistValueSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await addPicklistValue(tenantId, picklistId, parsed.data);
      if (!result.ok) {
        return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
      }
      return reply.status(201).send(result.value);
    },
  );

  // ── PATCH /api/v1/picklists/values/:valueId ────────────────────
  app.patch(
    '/api/v1/picklists/values/:valueId',
    async (request: FastifyRequest<{ Params: { valueId: string } }>, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const { valueId } = request.params;

      const parsed = updatePicklistValueSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await updatePicklistValue(tenantId, valueId, parsed.data);
      if (!result.ok) {
        return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
      }
      return reply.status(200).send(result.value);
    },
  );

  // ── DELETE /api/v1/picklists/values/:valueId ───────────────────
  app.delete(
    '/api/v1/picklists/values/:valueId',
    async (request: FastifyRequest<{ Params: { valueId: string } }>, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const { valueId } = request.params;

      const result = await deactivatePicklistValue(tenantId, valueId);
      if (!result.ok) {
        return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
      }
      return reply.status(200).send(result.value);
    },
  );
}
