import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { authenticateHook, requirePermission, setTenantContext } from '../core/auth.middleware.js';
import { db, pool } from '../db/connection.js';
import { apInvoiceLines, apInvoices } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { type AppErrorCode } from '../lib/result.js';
import { normalizeDescription, getSuggestions, recordFeedback, getModelMetrics } from './auto-coding.service.js';

// ── Error helpers ──────────────────────────────────────────────────

const STATUS_MAP: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL: 500,
  BAD_REQUEST: 400,
};

function errorStatus(code: AppErrorCode): number {
  return STATUS_MAP[code] ?? 500;
}

function errorResponse(code: AppErrorCode, message: string) {
  const status = errorStatus(code);
  return {
    type: `https://httpstatuses.io/${status}`,
    title: code,
    status,
    detail: message,
  };
}

// ── Zod schemas ────────────────────────────────────────────────────

const suggestBodySchema = z.object({
  apInvoiceLineId: z.string().uuid(),
});

const feedbackBodySchema = z.object({
  suggestionId: z.string().uuid(),
  accepted: z.boolean(),
  chosenAccountId: z.string().uuid(),
  acceptedRank: z.number().int().positive().nullable().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

const autoCodingRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // POST /api/v1/ap/auto-coding/suggestions
  fastify.post('/api/v1/ap/auto-coding/suggestions', {
    preHandler: [requirePermission('ap.invoice.code')],
  }, async (request, reply) => {
    const parsed = suggestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed'));
    }

    const { tenantId } = request.currentUser;
    const { apInvoiceLineId } = parsed.data;

    // Look up the line to get vendorId + description
    const [line] = await db
      .select()
      .from(apInvoiceLines)
      .where(and(eq(apInvoiceLines.tenantId, tenantId), eq(apInvoiceLines.id, apInvoiceLineId)))
      .limit(1);

    if (!line) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'AP invoice line not found'));
    }

    // Fetch parent invoice for vendorId
    const [invoice] = await db
      .select()
      .from(apInvoices)
      .where(and(eq(apInvoices.tenantId, tenantId), eq(apInvoices.id, line.apInvoiceId)))
      .limit(1);

    if (!invoice) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'AP invoice not found'));
    }

    const descriptionTokens = normalizeDescription(line.description);
    const result = await getSuggestions(tenantId, invoice.vendorId, descriptionTokens, apInvoiceLineId, pool);

    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(201).send(result.value);
  });

  // POST /api/v1/ap/auto-coding/feedback
  fastify.post('/api/v1/ap/auto-coding/feedback', {
    preHandler: [requirePermission('ap.invoice.code')],
  }, async (request, reply) => {
    const parsed = feedbackBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed'));
    }

    const { tenantId } = request.currentUser;
    const { suggestionId, accepted, chosenAccountId, acceptedRank } = parsed.data;

    const result = await recordFeedback(tenantId, suggestionId, accepted, chosenAccountId, acceptedRank, pool);

    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/ap/auto-coding/metrics
  fastify.get('/api/v1/ap/auto-coding/metrics', {
    preHandler: [requirePermission('ap.admin')],
  }, async (request, reply) => {
    const { tenantId } = request.currentUser;

    const result = await getModelMetrics(tenantId, pool);

    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(
        errorResponse(result.error.code, result.error.message),
      );
    }

    return reply.status(200).send(result.value);
  });

  done();
};

export default autoCodingRoutes;
