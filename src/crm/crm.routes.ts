import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { leadService } from './leads.service.js';
import { opportunityService } from './opportunities.service.js';
import { activityService } from './activities.service.js';
import { contractService } from './contracts.service.js';
import { subscriptionService } from './subscriptions.service.js';
import {
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  convertLeadSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  listOpportunitiesQuerySchema,
  createActivitySchema,
  listActivitiesQuerySchema,
  paginationQuerySchema,
  createContractSchema,
  updateContractSchema,
  listContractsQuerySchema,
  transitionContractSchema,
  addContractLineSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  listSubscriptionsQuerySchema,
} from './crm.schemas.js';
import type { AppError } from '../lib/result.js';

// ── Error response helper ──────────────────────────────────────────

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
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

// ── Lead Routes ────────────────────────────────────────────────────

export async function leadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list leads
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listLeadsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await leadService.listLeads(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get lead
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await leadService.getLead(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create lead
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await leadService.createLead(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update lead
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await leadService.updateLead(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/convert — convert lead to opportunity
  fastify.post('/:id/convert', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = convertLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await leadService.convertToOpportunity(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });
}

// ── Opportunity Routes ─────────────────────────────────────────────

export async function opportunityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /pipeline — pipeline summary (must be before /:id)
  fastify.get('/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const result = await opportunityService.getPipeline(tenantId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // GET / — list opportunities
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listOpportunitiesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await opportunityService.listOpportunities(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get opportunity
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await opportunityService.getOpportunity(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create opportunity
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createOpportunitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await opportunityService.createOpportunity(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update opportunity
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateOpportunitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await opportunityService.updateOpportunity(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── Activity Routes ────────────────────────────────────────────────

export async function activityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /mine — list my activities
  fastify.get('/mine', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listActivitiesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await activityService.listMyActivities(tenantId, userId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET / — list activities for an entity (query: entityType, entityId)
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: { entityType: string; entityId: string };
  }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { entityType, entityId } = request.query;

    if (!entityType || !entityId) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'entityType and entityId query parameters are required',
      });
    }

    const result = await activityService.listActivities(tenantId, entityType, entityId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // POST / — create activity
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createActivitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await activityService.createActivity(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // POST /:id/complete — complete activity
  fastify.post('/:id/complete', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const result = await activityService.completeActivity(tenantId, id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── Contract Routes ────────────────────────────────────────────────

export async function contractRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list contracts
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listContractsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await contractService.listContracts(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get contract
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await contractService.getContract(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create contract
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await contractService.createContract(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update contract
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await contractService.updateContract(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST /:id/actions/transition — transition contract status
  fastify.post('/:id/actions/transition', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = transitionContractSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await contractService.transitionContractStatus(tenantId, id, parsed.data.status, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id/lines — list contract lines
  fastify.get('/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await contractService.listContractLines(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  // POST /:id/lines — add contract line
  fastify.post('/:id/lines', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = addContractLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await contractService.addContractLine(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });
}

// ── Subscription Routes ────────────────────────────────────────────

export async function subscriptionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list subscriptions
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listSubscriptionsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await subscriptionService.listSubscriptions(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get subscription
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const result = await subscriptionService.getSubscription(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create subscription
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await subscriptionService.createSubscription(tenantId, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update subscription
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;
    const result = await subscriptionService.updateSubscription(tenantId, id, parsed.data, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── Combined CRM Plugin ────────────────────────────────────────────

export async function crmRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(leadRoutes, { prefix: '/api/v1/leads' });
  await fastify.register(opportunityRoutes, { prefix: '/api/v1/opportunities' });
  await fastify.register(activityRoutes, { prefix: '/api/v1/activities' });
  await fastify.register(contractRoutes, { prefix: '/api/v1/contracts' });
  await fastify.register(subscriptionRoutes, { prefix: '/api/v1/subscriptions' });
}
