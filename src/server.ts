import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import authRoutes from './core/auth.routes.js';
import customFieldsRoutes from './core/custom-fields.routes.js';
import picklistsRoutes from './core/picklists.routes.js';
import glRoutes from './gl/gl.routes.js';
import { customerRoutes } from './master/customers.routes.js';
import { vendorRoutes } from './master/vendors.routes.js';
import { registerEntityRoutes } from './master/entities.routes.js';
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

  await fastify.register(fastifyStatic, {
    root: path.join(projectRoot, 'assets'),
    prefix: '/assets/',
    decorateReply: true,
  });

  // Landing page
  fastify.get('/', async (_request, reply) => {
    return reply.sendFile('index.html', path.join(projectRoot, 'src', 'public'));
  });

  // ── Routes ────────────────────────────────────────────────────────
  await fastify.register(authRoutes);
  await fastify.register(customFieldsRoutes);
  await fastify.register(picklistsRoutes);
  await fastify.register(glRoutes);
  await fastify.register(customerRoutes, { prefix: '/api/v1/customers' });
  await fastify.register(vendorRoutes, { prefix: '/api/v1/vendors' });
  await fastify.register(registerEntityRoutes);

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
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Export for testing
export { buildServer };

start();
