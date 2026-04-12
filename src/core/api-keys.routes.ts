import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from './auth.middleware.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.service.js';
import type { AppError } from '../lib/result.js';

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, INTERNAL: 500,
};
function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply.status(STATUS_MAP[error.code] ?? 500).send({ error: error.code, message: error.message });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  tenantIds: z.array(z.string().uuid()).min(1),
  expiresAt: z.string().datetime().optional(),
});

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  fastify.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = await listApiKeys();
    if (!result.ok) return sendError(reply, result.error);
    // Never return key_hash
    const safe = result.value.map(({ keyHash: _kh, ...rest }) => rest);
    return reply.send({ data: safe });
  });

  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as unknown as { userId?: string }).userId;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });

    const result = await createApiKey({
      name: parsed.data.name,
      tenantIds: parsed.data.tenantIds,
      createdBy: userId,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });
    if (!result.ok) return sendError(reply, result.error);

    // rawKey is returned once here — it's not stored
    return reply.status(201).send(result.value);
  });

  fastify.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const result = await revokeApiKey(id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(204).send();
  });
}
