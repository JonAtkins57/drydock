import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from '../core/auth.middleware.js';
import { globalSearch } from './search.service.js';
import type { SearchType } from './search.service.js';

const VALID_TYPES: SearchType[] = [
  'customer', 'vendor', 'ap_invoice', 'quote', 'sales_order', 'invoice', 'lead',
];

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  types: z.string().optional(), // comma-separated
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    }

    const { q, types: typesParam } = parsed.data;
    const tenantId = (request as unknown as { tenantId: string }).tenantId;

    const types: SearchType[] = typesParam
      ? (typesParam.split(',').filter((t) => VALID_TYPES.includes(t as SearchType)) as SearchType[])
      : VALID_TYPES;

    if (types.length === 0) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'No valid types specified' });
    }

    const result = await globalSearch(tenantId, q, types);
    if (!result.ok) {
      return reply.status(500).send({ error: result.error.code, message: result.error.message });
    }

    return reply.send({ data: result.value, meta: { total: result.value.length, query: q, types } });
  });
}
