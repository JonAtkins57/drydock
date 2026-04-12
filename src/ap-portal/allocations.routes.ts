import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from '../core/auth.middleware.js';
import { listAllocations, setAllocations, approveAllocations } from './allocations.service.js';
import type { AppError } from '../lib/result.js';

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, INTERNAL: 500,
};
function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply.status(STATUS_MAP[error.code] ?? 500).send({ error: error.code, message: error.message });
}

const allocationLineSchema = z.object({
  invoiceLineId: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
  amountCents: z.number().int(),
  allocationPct: z.number().min(0).max(100).optional(),
});

const setAllocationsSchema = z.object({
  lines: z.array(allocationLineSchema),
});

export async function allocationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  // GET /ap/invoices/:invoiceId/allocations
  fastify.get('/:invoiceId/allocations', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { invoiceId } = req.params as { invoiceId: string };
    const result = await listAllocations(tenantId, invoiceId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // PUT /ap/invoices/:invoiceId/allocations — replace all lines
  fastify.put('/:invoiceId/allocations', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const userId = (req as unknown as { userId: string }).userId;
    const { invoiceId } = req.params as { invoiceId: string };
    const parsed = setAllocationsSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const result = await setAllocations(tenantId, userId, invoiceId, parsed.data.lines);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // POST /ap/invoices/:invoiceId/allocations/approve
  fastify.post('/:invoiceId/allocations/approve', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { invoiceId } = req.params as { invoiceId: string };
    const result = await approveAllocations(tenantId, invoiceId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(204).send();
  });
}
