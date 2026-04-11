import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from '../core/auth.middleware.js';
import { exportItemsCsv, importItemsCsv } from './import-export.service.js';
import {
  departmentService,
  locationService,
  legalEntityService,
  employeeService,
  itemService,
  projectService,
  costCenterService,
  paymentTermsService,
  taxCodeService,
  currencyService,
} from './master.service.js';
import {
  paginationQuerySchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  createLocationSchema,
  updateLocationSchema,
  createLegalEntitySchema,
  updateLegalEntitySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  createItemSchema,
  updateItemSchema,
  createProjectSchema,
  updateProjectSchema,
  createCostCenterSchema,
  updateCostCenterSchema,
  createPaymentTermsSchema,
  updatePaymentTermsSchema,
  createTaxCodeSchema,
  updateTaxCodeSchema,
  createCurrencySchema,
  updateCurrencySchema,
} from './master.schemas.js';
import type { AppError } from '../lib/result.js';

// ── Error response helper ───────────────────────────────────────────

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

// ── Generic CRUD route builder ──────────────────────────────────────

interface CrudRouteConfig {
  service: ReturnType<typeof import('./master.service.js').createMasterService>;
  createSchema: z.ZodType;
  updateSchema: z.ZodType;
}

function buildCrudRoutes(fastify: FastifyInstance, config: CrudRouteConfig): void {
  const { service, createSchema, updateSchema } = config;

  // GET / — list
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = paginationQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const result = await service.list(tenantId, query.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // GET /:id — get by id
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const result = await service.getById(tenantId, request.params.id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // POST / — create
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: (parsed as { error: z.ZodError }).error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await service.create(tenantId, parsed.data as Record<string, unknown>, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  // PATCH /:id — update
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: (parsed as { error: z.ZodError }).error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await service.update(tenantId, request.params.id, parsed.data as Record<string, unknown>, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  // DELETE /:id — deactivate
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await service.deactivate(tenantId, request.params.id, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

// ── Entity route registrations ──────────────────────────────────────

export async function departmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: departmentService,
    createSchema: createDepartmentSchema,
    updateSchema: updateDepartmentSchema,
  });
}

export async function locationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: locationService,
    createSchema: createLocationSchema,
    updateSchema: updateLocationSchema,
  });
}

export async function legalEntityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: legalEntityService,
    createSchema: createLegalEntitySchema,
    updateSchema: updateLegalEntitySchema,
  });
}

export async function employeeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: employeeService,
    createSchema: createEmployeeSchema,
    updateSchema: updateEmployeeSchema,
  });
}

export async function itemRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: itemService,
    createSchema: createItemSchema,
    updateSchema: updateItemSchema,
  });

  // GET /export — export all items as CSV
  fastify.get('/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const csv = await exportItemsCsv(tenantId);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="items.csv"')
      .send(csv);
  });

  // POST /import — import items from CSV (multipart)
  fastify.post('/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const data = await request.file();
    if (!data) {
      return reply.status(422).send({ error: 'VALIDATION', message: 'No file uploaded' });
    }
    const buf = await data.toBuffer();
    const csvText = buf.toString('utf-8');
    const result = await importItemsCsv(tenantId, csvText, userId);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });
}

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: projectService,
    createSchema: createProjectSchema,
    updateSchema: updateProjectSchema,
  });
}

export async function costCenterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: costCenterService,
    createSchema: createCostCenterSchema,
    updateSchema: updateCostCenterSchema,
  });
}

export async function paymentTermsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: paymentTermsService,
    createSchema: createPaymentTermsSchema,
    updateSchema: updatePaymentTermsSchema,
  });
}

export async function taxCodeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: taxCodeService,
    createSchema: createTaxCodeSchema,
    updateSchema: updateTaxCodeSchema,
  });
}

export async function currencyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  buildCrudRoutes(fastify, {
    service: currencyService,
    createSchema: createCurrencySchema,
    updateSchema: updateCurrencySchema,
  });
}

// ── Aggregate registration ──────────────────────────────────────────

export async function registerEntityRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(departmentRoutes, { prefix: '/api/v1/departments' });
  await fastify.register(locationRoutes, { prefix: '/api/v1/locations' });
  await fastify.register(legalEntityRoutes, { prefix: '/api/v1/legal-entities' });
  await fastify.register(employeeRoutes, { prefix: '/api/v1/employees' });
  await fastify.register(itemRoutes, { prefix: '/api/v1/items' });
  await fastify.register(projectRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(costCenterRoutes, { prefix: '/api/v1/cost-centers' });
  await fastify.register(paymentTermsRoutes, { prefix: '/api/v1/payment-terms' });
  await fastify.register(taxCodeRoutes, { prefix: '/api/v1/tax-codes' });
  await fastify.register(currencyRoutes, { prefix: '/api/v1/currencies' });
}
