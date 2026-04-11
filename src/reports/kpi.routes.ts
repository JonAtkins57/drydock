import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { getAllKpis } from './kpi.service.js';

const kpiQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO date YYYY-MM-DD'),
});

export async function kpiRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /api/v1/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = kpiQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'from and to are required (YYYY-MM-DD)',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const from = new Date(parsed.data.from + 'T00:00:00Z');
    const to = new Date(parsed.data.to + 'T23:59:59Z');

    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid date range: from must be before or equal to to',
      });
    }

    const kpis = await getAllKpis({ tenantId, from, to });
    return reply.send({ data: kpis, from: parsed.data.from, to: parsed.data.to });
  });
}
