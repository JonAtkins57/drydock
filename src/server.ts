import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import authRoutes from './core/auth.routes.js';
import customFieldsRoutes from './core/custom-fields.routes.js';
import picklistsRoutes from './core/picklists.routes.js';
import glRoutes from './gl/gl.routes.js';
import glReportsRoutes from './gl/reports.routes.js';
import { customerRoutes } from './master/customers.routes.js';
import { vendorRoutes } from './master/vendors.routes.js';
import { registerEntityRoutes } from './master/entities.routes.js';
import { crmRoutes } from './crm/crm.routes.js';
import { q2cRoutes } from './q2c/q2c.routes.js';
import { p2pRoutes } from './p2p/p2p.routes.js';
import bamboohrRoutes from './integration/bamboohr.routes.js';
import occRoutes from './integration/occ.routes.js';
import apRoutes from './ap-portal/ap.routes.js';
import attachmentRoutes from './core/attachments.routes.js';
import { processWebhookEvent } from './q2c/docusign.service.js';
import { validateDocuSignHmac } from './integration/docusign.js';
import { setupRecurringWorker } from './gl/recurring.worker.js';
import { leaseRoutes } from './lease/lease.routes.js';
import { assetRoutes } from './asset/asset.routes.js';
import { workOrderRoutes } from './work-orders/work-orders.routes.js';
import { inventoryRoutes } from './inventory/inventory.routes.js';
import { projectMgmtRoutes } from './project-mgmt/project-mgmt.routes.js';
=======
import { budgetingRoutes } from './budgeting/budgeting.routes.js';
import { forecastRoutes } from './budgeting/forecasts.routes.js';
<<<<<<< HEAD
import { kpiRoutes } from './reports/kpi.routes.js';
import { dashboardRoutes } from './reports/dashboards.routes.js';
import autoCodingRoutes from './ap-portal/auto-coding.routes.js';
import { cashForecastRoutes } from './cash-forecast/cash-forecast.routes.js';
import { projectMgmtRoutes } from './project-mgmt/project-mgmt.routes.js';
=======
import { inventoryRoutes } from './inventory/inventory.routes.js';
>>>>>>> shipyard/DD-33/dd-33-inventory-management-pha
=======
import { pricingRoutes } from './pricing/pricing.routes.js';
>>>>>>> origin/shipyard/DD-53/dd-53-pricing-rate-cards-maste
import type { AppErrorCode } from './lib/result.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '4400', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // ── CORS ──────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  // ── Multipart (file uploads) ──────────────────────────────────────
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  // ── Swagger ───────────────────────────────────────────────────────
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Drydock API',
        description: 'Multi-tenant CRM/ERP platform API',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // ── Health check ──────────────────────────────────────────────────
  fastify.get('/api/v1/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  // ── Static Files ──────────────────────────────────────────────────
  const projectRoot = process.cwd();

  // Serve React app build (includes logo in assets/)
  const appDir = path.join(projectRoot, 'src', 'public', 'app');
  await fastify.register(fastifyStatic, {
    root: appDir,
    prefix: '/',
    decorateReply: true,
  });

  // SPA fallback — serve index.html for all non-API, non-asset routes
  fastify.setNotFoundHandler(async (request, reply) => {
    const url = request.url;
    if (url.startsWith('/api/') || url.startsWith('/docs')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html', appDir);
  });

  // ── Routes ────────────────────────────────────────────────────────
  await fastify.register(authRoutes);
  await fastify.register(customFieldsRoutes);
  await fastify.register(picklistsRoutes);
  await fastify.register(glRoutes);
  await fastify.register(glReportsRoutes);
  await fastify.register(customerRoutes, { prefix: '/api/v1/customers' });
  await fastify.register(vendorRoutes, { prefix: '/api/v1/vendors' });
  await fastify.register(registerEntityRoutes);
  await fastify.register(crmRoutes);
  await fastify.register(q2cRoutes);
  await fastify.register(p2pRoutes);
  await fastify.register(bamboohrRoutes);
  await fastify.register(occRoutes);
  await fastify.register(apRoutes);
  await fastify.register(attachmentRoutes);
  await fastify.register(leaseRoutes, { prefix: '/api/v1/leases' });
  await fastify.register(assetRoutes, { prefix: '/api/v1/assets' });
  await fastify.register(workOrderRoutes, { prefix: '/api/v1/work-orders' });
  await fastify.register(budgetingRoutes, { prefix: '/api/v1/budgets' });
  await fastify.register(forecastRoutes, { prefix: '/api/v1/forecasts' });
<<<<<<< HEAD
  await fastify.register(inventoryRoutes, { prefix: '/api/v1' });
  await fastify.register(projectMgmtRoutes, { prefix: '/api/v1/projects-mgmt' });
  await fastify.register(kpiRoutes, { prefix: '/api/v1/kpis' });
  await fastify.register(dashboardRoutes, { prefix: '/api/v1/dashboards' });
  await fastify.register(autoCodingRoutes);
  await fastify.register(cashForecastRoutes, { prefix: '/api/v1/cash-forecasts' });
  await fastify.register(inventoryRoutes, { prefix: '/api/v1/inventory' });
=======
  await fastify.register(pricingRoutes, { prefix: '/api/v1/pricing' });
>>>>>>> origin/shipyard/DD-53/dd-53-pricing-rate-cards-maste

  // ── DocuSign Connect Webhook ──────────────────────────────────────
  // Encapsulated scope so the buffer content-type parser only applies here.
  // Fastify v5 has no built-in rawBody support, so we override the JSON
  // parser in this scope to capture the raw bytes needed for HMAC validation.
  await fastify.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        try {
          done(null, { _raw: body as Buffer, parsed: JSON.parse((body as Buffer).toString('utf8')) });
        } catch (e) {
          done(e as Error);
        }
      },
    );

    scope.post('/api/v1/webhooks/docusign', async (request, reply) => {
      const bodyWrapper = request.body as { _raw: Buffer; parsed: unknown } | null;
      const rawBody = bodyWrapper?._raw;
      const parsed = bodyWrapper?.parsed as {
        event?: string;
        data?: { envelopeId?: string; envelopeSummary?: { status?: string } };
      } | undefined;

      const hmacKey = process.env.DOCUSIGN_HMAC_KEY;
      if (hmacKey) {
        const signature = (request.headers['x-docusign-signature-1'] as string | undefined) ?? '';
        if (!rawBody || !validateDocuSignHmac(rawBody, signature, hmacKey)) {
          return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid DocuSign HMAC signature' });
        }
      }

      if (!parsed?.event || !parsed?.data?.envelopeId) {
        return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Missing event or envelopeId' });
      }

      const result = await processWebhookEvent({
        event: parsed.event,
        data: {
          envelopeId: parsed.data.envelopeId,
          envelopeSummary: parsed.data.envelopeSummary,
        },
      });

      if (!result.ok) {
        // Return 200 to prevent DocuSign from retrying for NOT_FOUND (orphaned envelopes)
        if (result.error.code === 'NOT_FOUND') {
          return reply.status(200).send({ received: true, warning: result.error.message });
        }
        return reply.status(422).send({ error: result.error.code, message: result.error.message });
      }

      return reply.status(200).send({ received: true, quoteId: result.value.quoteId, docusignStatus: result.value.docusignStatus });
    });
  });

  // ── RFC 7807 Error Handler ────────────────────────────────────────
  const errorCodeToStatus: Record<AppErrorCode, number> = {
    NOT_FOUND: 404,
    VALIDATION: 400,
    CONFLICT: 409,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    INTERNAL: 500,
    BAD_REQUEST: 400,
  };

  fastify.setErrorHandler((error, _request, reply) => {
    const appError = error as unknown as { code?: AppErrorCode; message?: string };

    const fastifyError = error as { validation?: unknown; message?: string; code?: string };

    // Fastify validation errors
    if (fastifyError.validation) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: fastifyError.message ?? 'Validation error',
      });
    }

    // AppError-shaped errors
    if (appError.code && appError.code in errorCodeToStatus) {
      const status = errorCodeToStatus[appError.code];
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: appError.code,
        status,
        detail: appError.message ?? 'An error occurred',
      });
    }

    // Unhandled errors
    fastify.log.error(error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return reply.status(500).send({
      type: 'https://httpstatuses.io/500',
      title: 'Internal Server Error',
      status: 500,
      detail: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : message,
    });
  });

  return fastify;
}

async function start() {
  const fastify = await buildServer();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Server listening on ${HOST}:${PORT}`);
    setupRecurringWorker(process.env.REDIS_URL ?? '').catch((err) => {
      fastify.log.error({ err }, '[recurring-worker] Failed to start');
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Export for testing
export { buildServer };

start();
