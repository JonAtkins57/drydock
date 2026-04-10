import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createFieldDefinition,
  getFieldDefinition,
  listFieldDefinitions,
  updateFieldDefinition,
  deactivateFieldDefinition,
  getFieldValues,
  setFieldValues,
} from './custom-fields.service.js';
import {
  createFieldDefinitionSchema,
  updateFieldDefinitionSchema,
  listFieldDefinitionsQuerySchema,
  setFieldValuesSchema,
} from './custom-fields.schemas.js';
import type { AppError } from '../lib/result.js';

// ── Helpers ──────────────────────────────────────────────────────

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
  // Expect tenantId from JWT or header. For now, header-based.
  const tenantId = (request.headers['x-tenant-id'] as string) ?? '';
  return tenantId;
}

// ── Plugin ───────────────────────────────────────────────────────

export default async function customFieldRoutes(app: FastifyInstance): Promise<void> {
  // Tenant ID guard
  app.addHook('preHandler', async (request, reply) => {
    const tenantId = getTenantId(request);
    if (!tenantId) {
      return reply.status(400).send({ error: 'x-tenant-id header is required' });
    }
  });

  // ── POST /api/v1/custom-fields ─────────────────────────────────
  app.post('/api/v1/custom-fields', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const parsed = createFieldDefinitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await createFieldDefinition(tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
    }
    return reply.status(201).send(result.value);
  });

  // ── GET /api/v1/custom-fields ──────────────────────────────────
  app.get('/api/v1/custom-fields', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const parsed = listFieldDefinitionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, page, pageSize } = parsed.data;
    const result = await listFieldDefinitions(tenantId, entityType, { page, pageSize });
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
    }
    return reply.status(200).send(result.value);
  });

  // ── GET /api/v1/custom-fields/:id ──────────────────────────────
  app.get('/api/v1/custom-fields/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const result = await getFieldDefinition(tenantId, id);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
    }
    return reply.status(200).send(result.value);
  });

  // ── PATCH /api/v1/custom-fields/:id ────────────────────────────
  app.patch('/api/v1/custom-fields/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const parsed = updateFieldDefinitionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await updateFieldDefinition(tenantId, id, parsed.data);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
    }
    return reply.status(200).send(result.value);
  });

  // ── DELETE /api/v1/custom-fields/:id ───────────────────────────
  app.delete('/api/v1/custom-fields/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const result = await deactivateFieldDefinition(tenantId, id);
    if (!result.ok) {
      return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
    }
    return reply.status(200).send(result.value);
  });

  // ── GET /api/v1/custom-fields/values/:entityType/:entityId ─────
  app.get(
    '/api/v1/custom-fields/values/:entityType/:entityId',
    async (request: FastifyRequest<{ Params: { entityType: string; entityId: string } }>, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const { entityType, entityId } = request.params;

      const result = await getFieldValues(tenantId, entityType, entityId);
      if (!result.ok) {
        return reply.status(httpStatus(result.error.code)).send({ error: result.error.message });
      }
      return reply.status(200).send(result.value);
    },
  );

  // ── PUT /api/v1/custom-fields/values/:entityType/:entityId ─────
  app.put(
    '/api/v1/custom-fields/values/:entityType/:entityId',
    async (request: FastifyRequest<{ Params: { entityType: string; entityId: string } }>, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const { entityType, entityId } = request.params;

      const parsed = setFieldValuesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await setFieldValues(tenantId, entityType, entityId, parsed.data as { fieldDefinitionId: string; value: unknown }[]);
      if (!result.ok) {
        return reply.status(httpStatus(result.error.code)).send({ error: result.error.message, details: result.error.details });
      }
      return reply.status(200).send(result.value);
    },
  );
}
