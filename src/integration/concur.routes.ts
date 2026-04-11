/**
 * SAP Concur Expense Integration Routes
 *
 * POST   /api/v1/integrations/concur/connect
 * GET    /api/v1/integrations/concur/test/:configId
 * POST   /api/v1/integrations/concur/sync/:configId
 * GET    /api/v1/integrations/concur/expense-mappings/:configId
 * PUT    /api/v1/integrations/concur/expense-mappings/:configId
 * DELETE /api/v1/integrations/concur/expense-mappings/:configId/:mappingId
 * GET    /api/v1/integrations/concur/sync-logs/:configId
 * DELETE /api/v1/integrations/concur/disconnect/:configId
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import {
  connectConcur,
  testConcurConnection,
  syncConcurExpenses,
  getExpenseMappings,
  setExpenseMappings,
  deleteExpenseMapping,
  getConcurSyncLogs,
  disconnectConcur,
} from './concur.service.js';
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

function errorStatus(code: string): number {
  return STATUS_MAP[code] ?? 500;
}

function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  const status = errorStatus(error.code);
  return reply.status(status).send({
    error: error.code,
    message: error.message,
    details: error.details,
  });
}

// ── Schemas ─────────────────────────────────────────────────────────

const connectBodySchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  baseUrl: z.string().url().startsWith('https://'),
  configName: z.string().min(1),
  clearingAccountId: z.string().uuid(),
});

const configIdParamsSchema = z.object({
  configId: z.string().uuid(),
});

const mappingParamsSchema = z.object({
  configId: z.string().uuid(),
  mappingId: z.string().uuid(),
});

const expenseMappingItemSchema = z.object({
  expenseTypeCode: z.string().min(1),
  expenseTypeName: z.string().optional(),
  debitAccountId: z.string().uuid(),
  creditAccountId: z.string().uuid().optional(),
});

const expenseMappingsPutSchema = z.array(expenseMappingItemSchema);

const syncLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(25),
});

// ── Plugin ───────────────────────────────────────────────────────────

export default async function concurRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── POST /api/v1/integrations/concur/connect ─────────────────────
  fastify.post(
    '/api/v1/integrations/concur/connect',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = connectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const { clientId, clientSecret, baseUrl, configName, clearingAccountId } = parsed.data;

      const result = await connectConcur(tenantId, configName, clientId, clientSecret, baseUrl, clearingAccountId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(201).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/concur/test/:configId ───────────────
  fastify.get(
    '/api/v1/integrations/concur/test/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await testConcurConnection(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/concur/sync/:configId ─────────────
  fastify.post(
    '/api/v1/integrations/concur/sync/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncConcurExpenses(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/concur/expense-mappings/:configId ───
  fastify.get(
    '/api/v1/integrations/concur/expense-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await getExpenseMappings(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value });
    },
  );

  // ── PUT /api/v1/integrations/concur/expense-mappings/:configId ───
  fastify.put(
    '/api/v1/integrations/concur/expense-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const bodyParsed = expenseMappingsPutSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await setExpenseMappings(tenantId, paramsParsed.data.configId, bodyParsed.data);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── DELETE /api/v1/integrations/concur/expense-mappings/:configId/:mappingId
  fastify.delete(
    '/api/v1/integrations/concur/expense-mappings/:configId/:mappingId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = mappingParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid params' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await deleteExpenseMapping(tenantId, parsed.data.configId, parsed.data.mappingId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/concur/sync-logs/:configId ──────────
  fastify.get(
    '/api/v1/integrations/concur/sync-logs/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const queryParsed = syncLogsQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid query params' });
      }

      const tenantId = request.currentUser.tenantId;
      const { page, page_size } = queryParsed.data;
      const result = await getConcurSyncLogs(tenantId, paramsParsed.data.configId, page, page_size);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── DELETE /api/v1/integrations/concur/disconnect/:configId ──────
  fastify.delete(
    '/api/v1/integrations/concur/disconnect/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await disconnectConcur(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );
}
