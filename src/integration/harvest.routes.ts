/**
 * Harvest Integration Routes
 *
 * POST /api/v1/integrations/harvest/connect
 * POST /api/v1/integrations/harvest/sync/users/:configId
 * POST /api/v1/integrations/harvest/sync/projects/:configId
 * POST /api/v1/integrations/harvest/sync/time-entries/:configId
 * GET  /api/v1/integrations/harvest/sync-logs/:configId
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import {
  connectHarvest,
  syncHarvestUsers,
  syncHarvestProjects,
  syncHarvestTimeEntries,
  getHarvestSyncLogs,
} from './harvest.service.js';
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
  return reply.status(errorStatus(error.code)).send({
    error: error.code,
    message: error.message,
    details: (error as { details?: unknown }).details,
  });
}

const configIdParamsSchema = z.object({ configId: z.string().uuid() });

const connectBodySchema = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1).optional().default('Harvest'),
  syncFromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const timeEntriesQuerySchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export default async function harvestRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── POST /api/v1/integrations/harvest/connect ─────────────────────
  fastify.post(
    '/api/v1/integrations/harvest/connect',
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
      const { accessToken, accountId, name, syncFromDate } = parsed.data;

      const result = await connectHarvest(tenantId, accessToken, accountId, name, syncFromDate);
      if (!result.ok) return sendError(reply, result.error);

      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/harvest/sync/users/:configId ────────
  fastify.post(
    '/api/v1/integrations/harvest/sync/users/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncHarvestUsers(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);

      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/harvest/sync/projects/:configId ─────
  fastify.post(
    '/api/v1/integrations/harvest/sync/projects/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncHarvestProjects(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);

      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/harvest/sync/time-entries/:configId ─
  fastify.post(
    '/api/v1/integrations/harvest/sync/time-entries/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const queryParsed = timeEntriesQuerySchema.safeParse(request.query);
      if (!queryParsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid query params',
          details: queryParsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncHarvestTimeEntries(
        tenantId,
        paramsParsed.data.configId,
        { since: queryParsed.data.since, until: queryParsed.data.until },
      );
      if (!result.ok) return sendError(reply, result.error);

      return reply.status(200).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/harvest/sync-logs/:configId ──────────
  fastify.get(
    '/api/v1/integrations/harvest/sync-logs/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(25) });
      const queryParsed = limitSchema.safeParse(request.query);
      const limit = queryParsed.success ? queryParsed.data.limit : 25;

      const tenantId = request.currentUser.tenantId;
      const result = await getHarvestSyncLogs(tenantId, paramsParsed.data.configId, limit);
      if (!result.ok) return sendError(reply, result.error);

      return reply.status(200).send({ data: result.value });
    },
  );
}
