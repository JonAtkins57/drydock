import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from './auth.middleware.js';
import { listSodRules, createSodRule, updateSodRule, deleteSodRule } from './sod-rules.service.js';
import type { AppError } from '../lib/result.js';

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, INTERNAL: 500,
};
function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply.status(STATUS_MAP[error.code] ?? 500).send({ error: error.code, message: error.message });
}

const createSchema = z.object({
  ruleKey: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  entityType: z.string().min(1).max(100),
  actionA: z.string().min(1).max(100),
  actionB: z.string().min(1).max(100),
});

export async function sodRulesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const result = await listSodRules(tenantId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const result = await createSodRule(tenantId, parsed.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { id } = req.params as { id: string };
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const result = await updateSodRule(tenantId, id, parsed.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  fastify.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { id } = req.params as { id: string };
    const result = await deleteSodRule(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(204).send();
  });
}
