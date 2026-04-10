/**
 * BambooHR Integration Routes
 *
 * POST /api/v1/integrations/bamboohr/sync   — trigger full sync
 * GET  /api/v1/integrations/bamboohr/status — last sync status
 * GET  /api/v1/integrations/bamboohr/logs   — sync history
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import {
  syncEmployees,
  syncDepartments,
  syncManagerHierarchy,
  getLastSyncStatus,
  getSyncLogs,
} from './bamboohr.service.js';
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

const syncBodySchema = z.object({
  configId: z.string().uuid(),
  syncTypes: z
    .array(z.enum(['employees', 'departments', 'manager_hierarchy']))
    .optional()
    .default(['departments', 'employees', 'manager_hierarchy']),
});

const configIdQuerySchema = z.object({
  configId: z.string().uuid(),
});

export default async function bamboohrRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── POST /api/v1/integrations/bamboohr/sync ──────────────────────
  fastify.post(
    '/api/v1/integrations/bamboohr/sync',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = syncBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const { configId, syncTypes } = parsed.data;

      const results: Record<string, unknown> = {};

      for (const syncType of syncTypes) {
        let result;
        switch (syncType) {
          case 'departments':
            result = await syncDepartments(tenantId, configId);
            break;
          case 'employees':
            result = await syncEmployees(tenantId, configId);
            break;
          case 'manager_hierarchy':
            result = await syncManagerHierarchy(tenantId, configId);
            break;
        }
        if (!result.ok) {
          return sendError(reply, result.error);
        }
        results[syncType] = result.value;
      }

      return reply.status(200).send({ results });
    },
  );

  // ── GET /api/v1/integrations/bamboohr/status ─────────────────────
  fastify.get(
    '/api/v1/integrations/bamboohr/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'configId query parameter required',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await getLastSyncStatus(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/bamboohr/logs ───────────────────────
  fastify.get(
    '/api/v1/integrations/bamboohr/logs',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const querySchema = configIdQuerySchema.extend({
        limit: z.coerce.number().int().min(1).max(100).optional().default(25),
      });
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'configId query parameter required',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await getSyncLogs(tenantId, parsed.data.configId, parsed.data.limit);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value });
    },
  );
}
