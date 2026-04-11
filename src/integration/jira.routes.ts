/**
 * JIRA Cloud Integration Routes
 *
 * POST   /api/v1/integrations/jira/connect
 * GET    /api/v1/integrations/jira/test/:configId
 * POST   /api/v1/integrations/jira/sync/projects/:configId
 * POST   /api/v1/integrations/jira/sync/issues/:configId
 * POST   /api/v1/integrations/jira/sync/worklogs/:configId
 * GET    /api/v1/integrations/jira/status-mappings/:configId
 * PUT    /api/v1/integrations/jira/status-mappings/:configId
 * GET    /api/v1/integrations/jira/field-mappings/:configId
 * PUT    /api/v1/integrations/jira/field-mappings/:configId
 * GET    /api/v1/integrations/jira/sync-logs/:configId
 *
 * Webhook: POST /webhooks/jira/:configId — registered in server.ts (outside JWT auth)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import {
  connectJira,
  testJiraConnection,
  syncJiraProjects,
  syncJiraIssues,
  syncJiraWorklogs,
  getStatusMappings,
  setStatusMappings,
  getFieldMappings,
  setFieldMappings,
  getJiraSyncLogs,
} from './jira.service.js';
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
  host: z.string().min(1),
  email: z.string().email(),
  apiToken: z.string().min(1),
  configName: z.string().min(1),
});

const configIdParamsSchema = z.object({
  configId: z.string().uuid(),
});

const statusMappingsPutSchema = z.array(
  z.object({
    jiraStatus: z.string().min(1),
    drydockStatus: z.string().min(1),
    entityType: z.enum(['work_order', 'project']),
  }),
);

const fieldMappingsPutSchema = z.array(
  z.object({
    sourceField: z.string().min(1),
    targetEntity: z.string().min(1),
    targetField: z.string().min(1),
    transformRule: z.string().optional(),
  }),
);

const syncLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(25),
});

// ── Plugin ───────────────────────────────────────────────────────────

export default async function jiraRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── POST /api/v1/integrations/jira/connect ───────────────────────
  fastify.post(
    '/api/v1/integrations/jira/connect',
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
      const { host, email, apiToken, configName } = parsed.data;

      const result = await connectJira(tenantId, configName, host, email, apiToken);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(201).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/jira/test/:configId ─────────────────
  fastify.get(
    '/api/v1/integrations/jira/test/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await testJiraConnection(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/jira/sync/projects/:configId ───────
  fastify.post(
    '/api/v1/integrations/jira/sync/projects/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncJiraProjects(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/jira/sync/issues/:configId ─────────
  fastify.post(
    '/api/v1/integrations/jira/sync/issues/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncJiraIssues(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── POST /api/v1/integrations/jira/sync/worklogs/:configId ───────
  fastify.post(
    '/api/v1/integrations/jira/sync/worklogs/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await syncJiraWorklogs(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );

  // ── GET /api/v1/integrations/jira/status-mappings/:configId ──────
  fastify.get(
    '/api/v1/integrations/jira/status-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await getStatusMappings(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value });
    },
  );

  // ── PUT /api/v1/integrations/jira/status-mappings/:configId ──────
  fastify.put(
    '/api/v1/integrations/jira/status-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const bodyParsed = statusMappingsPutSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await setStatusMappings(tenantId, paramsParsed.data.configId, bodyParsed.data);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ ok: true });
    },
  );

  // ── GET /api/v1/integrations/jira/field-mappings/:configId ───────
  fastify.get(
    '/api/v1/integrations/jira/field-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = configIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await getFieldMappings(tenantId, parsed.data.configId);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ data: result.value });
    },
  );

  // ── PUT /api/v1/integrations/jira/field-mappings/:configId ───────
  fastify.put(
    '/api/v1/integrations/jira/field-mappings/:configId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const paramsParsed = configIdParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.status(400).send({ error: 'VALIDATION', message: 'Invalid configId' });
      }

      const bodyParsed = fieldMappingsPutSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.status(400).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: bodyParsed.error.flatten().fieldErrors,
        });
      }

      const tenantId = request.currentUser.tenantId;
      const result = await setFieldMappings(tenantId, paramsParsed.data.configId, bodyParsed.data);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send({ ok: true });
    },
  );

  // ── GET /api/v1/integrations/jira/sync-logs/:configId ────────────
  fastify.get(
    '/api/v1/integrations/jira/sync-logs/:configId',
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
      const result = await getJiraSyncLogs(tenantId, paramsParsed.data.configId, page, page_size);
      if (!result.ok) return sendError(reply, result.error);
      return reply.status(200).send(result.value);
    },
  );
}
