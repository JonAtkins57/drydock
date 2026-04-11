/**
 * OCC Usage-Based Billing Routes
 *
 * GET  /api/v1/integrations/occ/rate-cards        — list tenant rate cards
 * GET  /api/v1/integrations/occ/runs              — list pull runs for a config
 * POST /api/v1/integrations/occ/pull-and-invoice  — pull usage + generate invoice
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { listRateCards, listPullRuns, pullAndInvoice } from './occ.service.js';
import type { AppError } from '../lib/result.js';

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
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

const runsQuerySchema = z.object({
  configId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const pullAndInvoiceBodySchema = z.object({
  configId: z.string().uuid(),
  periodStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export default async function occRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── GET /api/v1/integrations/occ/rate-cards ─────────────────────
  fastify.get(
    '/api/v1/integrations/occ/rate-cards',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.currentUser.tenantId;
      const result = await listRateCards(tenantId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value });
    },
  );

  // ── GET /api/v1/integrations/occ/runs ───────────────────────────
  fastify.get(
    '/api/v1/integrations/occ/runs',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = runsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'configId query parameter required',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const tenantId = request.currentUser.tenantId;
      const result = await listPullRuns(tenantId, parsed.data.configId, parsed.data.limit);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value, total: result.value.length });
    },
  );

  // ── POST /api/v1/integrations/occ/pull-and-invoice ──────────────
  fastify.post(
    '/api/v1/integrations/occ/pull-and-invoice',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = pullAndInvoiceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const tenantId = request.currentUser.tenantId;
      const userId = request.currentUser.sub;
      const { configId, periodStart, periodEnd } = parsed.data;
      const result = await pullAndInvoice(tenantId, configId, periodStart, periodEnd, userId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );
}
