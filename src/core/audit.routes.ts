import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from './auth.middleware.js';
import { queryAuditLog } from './audit-query.service.js';

const querySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });

    const { from, to, ...rest } = parsed.data;
    const result = await queryAuditLog(tenantId, {
      ...rest,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    if (!result.ok) return reply.status(500).send({ error: result.error.code, message: result.error.message });

    const { page, pageSize } = parsed.data;
    return reply.send({
      data: result.value.data,
      meta: { total: result.value.total, page, pageSize },
    });
  });
}
