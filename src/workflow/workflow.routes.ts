import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import {
  entityTypeParamSchema,
  entityParamsSchema,
  transitionParamsSchema,
  approvalParamsSchema,
  executeTransitionBodySchema,
  submitApprovalBodySchema,
} from './workflow.schemas.js';
import {
  getWorkflowForEntity,
  startWorkflow,
  getInstanceState,
  getAvailableTransitions,
  executeTransition,
  submitApproval,
  getApprovalStatus,
} from './workflow.service.js';

const statusMap: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL: 500,
};

function errorStatus(code: string): number {
  return statusMap[code] ?? 500;
}

const workflowRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  // All routes require auth + tenant context
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── GET /api/v1/workflows/:entityType ────────────────────────────
  fastify.get('/api/v1/workflows/:entityType', async (request, reply) => {
    const parsed = entityTypeParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { entityType } = parsed.data;
    const tenantId = request.currentUser.tenantId;
    const result = await getWorkflowForEntity(tenantId, entityType);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    const { definition, states, transitions } = result.value;
    return reply.status(200).send({
      ...definition,
      states,
      transitions,
    });
  });

  // ── GET /api/v1/workflows/:entityType/:entityId/status ───────────
  fastify.get('/api/v1/workflows/:entityType/:entityId/status', async (request, reply) => {
    const parsed = entityParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, entityId } = parsed.data;
    const tenantId = request.currentUser.tenantId;
    const result = await getInstanceState(tenantId, entityType, entityId);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    const { instance, currentState } = result.value;
    return reply.status(200).send({
      ...instance,
      startedAt: instance.startedAt.toISOString(),
      completedAt: instance.completedAt?.toISOString() ?? null,
      currentState,
    });
  });

  // ── GET /api/v1/workflows/:entityType/:entityId/transitions ──────
  fastify.get('/api/v1/workflows/:entityType/:entityId/transitions', async (request, reply) => {
    const parsed = entityParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, entityId } = parsed.data;
    const tenantId = request.currentUser.tenantId;
    const userId = request.currentUser.sub;
    const result = await getAvailableTransitions(tenantId, entityType, entityId, userId);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(200).send(result.value);
  });

  // ── POST /api/v1/workflows/:entityType/:entityId/transitions/:transitionKey
  fastify.post('/api/v1/workflows/:entityType/:entityId/transitions/:transitionKey', async (request, reply) => {
    const paramsParsed = transitionParamsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: paramsParsed.error.flatten().fieldErrors,
      });
    }

    const bodyParsed = executeTransitionBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: bodyParsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, entityId, transitionKey } = paramsParsed.data;
    const tenantId = request.currentUser.tenantId;
    const userId = request.currentUser.sub;
    const data = bodyParsed.data?.data;

    const result = await executeTransition(tenantId, entityType, entityId, transitionKey, userId, data);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
        ...(result.error.details ? { details: result.error.details } : {}),
      });
    }

    const { instance, currentState } = result.value;
    return reply.status(200).send({
      ...instance,
      startedAt: instance.startedAt.toISOString(),
      completedAt: instance.completedAt?.toISOString() ?? null,
      currentState,
    });
  });

  // ── POST /api/v1/workflows/:entityType/:entityId/approvals/:stepId
  fastify.post('/api/v1/workflows/:entityType/:entityId/approvals/:stepId', async (request, reply) => {
    const paramsParsed = approvalParamsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: paramsParsed.error.flatten().fieldErrors,
      });
    }

    const bodyParsed = submitApprovalBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: bodyParsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, entityId, stepId } = paramsParsed.data;
    const tenantId = request.currentUser.tenantId;
    const userId = request.currentUser.sub;
    const { decision, comments } = bodyParsed.data;

    // We need the instance ID — look it up from entity
    const instanceResult = await getInstanceState(tenantId, entityType, entityId);
    if (!instanceResult.ok) {
      const status = errorStatus(instanceResult.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: instanceResult.error.code,
        status,
        detail: instanceResult.error.message,
      });
    }

    const instanceId = instanceResult.value.instance.id;
    const result = await submitApproval(tenantId, instanceId, stepId, userId, decision, comments);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(201).send(result.value);
  });

  // ── GET /api/v1/workflows/:entityType/:entityId/approvals ────────
  fastify.get('/api/v1/workflows/:entityType/:entityId/approvals', async (request, reply) => {
    const parsed = entityParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { entityType, entityId } = parsed.data;
    const tenantId = request.currentUser.tenantId;

    const instanceResult = await getInstanceState(tenantId, entityType, entityId);
    if (!instanceResult.ok) {
      const status = errorStatus(instanceResult.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: instanceResult.error.code,
        status,
        detail: instanceResult.error.message,
      });
    }

    const instanceId = instanceResult.value.instance.id;
    const result = await getApprovalStatus(tenantId, instanceId);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(200).send(result.value);
  });

  done();
};

export default workflowRoutes;
