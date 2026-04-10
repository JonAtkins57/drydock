import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { register, login, refreshToken, getUserPermissions } from './auth.service.js';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.schemas.js';
import { authenticateHook } from './auth.middleware.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const authRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  // ── POST /api/v1/auth/register ──────────────────────────────────
  fastify.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, email, password, firstName, lastName } = parsed.data;
    const result = await register(tenantId, email, password, firstName, lastName);

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        CONFLICT: 409,
        VALIDATION: 400,
        INTERNAL: 500,
      };
      const status = statusMap[result.error.code] ?? 500;
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(201).send(result.value);
  });

  // ── POST /api/v1/auth/login ─────────────────────────────────────
  fastify.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;
    const result = await login(email, password);

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        INTERNAL: 500,
      };
      const status = statusMap[result.error.code] ?? 500;
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(200).send(result.value);
  });

  // ── POST /api/v1/auth/refresh ───────────────────────────────────
  fastify.post('/api/v1/auth/refresh', async (request, reply) => {
    const parsed = refreshTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await refreshToken(parsed.data.refreshToken);

    if (!result.ok) {
      const status = result.error.code === 'UNAUTHORIZED' ? 401 : 500;
      return reply.status(status).send({
        type: `https://httpstatuses.io/${status}`,
        title: result.error.code,
        status,
        detail: result.error.message,
      });
    }

    return reply.status(200).send(result.value);
  });

  // ── GET /api/v1/auth/me ─────────────────────────────────────────
  fastify.get(
    '/api/v1/auth/me',
    { preHandler: [authenticateHook] },
    async (request, reply) => {
      const [user] = await db
        .select({
          id: users.id,
          tenantId: users.tenantId,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, request.currentUser.sub))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          type: 'https://httpstatuses.io/404',
          title: 'Not Found',
          status: 404,
          detail: 'User not found',
        });
      }

      const permissionsResult = await getUserPermissions(user.id);
      const permissions = permissionsResult.ok ? permissionsResult.value : [];

      return reply.status(200).send({
        ...user,
        lastLogin: user.lastLogin?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        permissions,
      });
    },
  );

  done();
};

export default authRoutes;
