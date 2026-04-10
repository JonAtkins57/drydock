import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import jwt from 'jsonwebtoken';
import { pool } from '../db/connection.js';
import { checkPermission } from './auth.service.js';
import type { JwtPayload } from './auth.service.js';

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    currentUser: JwtPayload;
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

// ── Authenticate Hook ───────────────────────────────────────────────
export const authenticateHook: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    request.currentUser = decoded;
  } catch {
    return reply.status(401).send({
      type: 'https://httpstatuses.io/401',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid or expired token',
    });
  }
};

// ── Require Permission ──────────────────────────────────────────────
export function requirePermission(permission: string): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.currentUser) {
      return reply.status(401).send({
        type: 'https://httpstatuses.io/401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
      });
    }

    const result = await checkPermission(request.currentUser.sub, permission);
    if (!result.ok) {
      return reply.status(500).send({
        type: 'https://httpstatuses.io/500',
        title: 'Internal Server Error',
        status: 500,
        detail: result.error.message,
      });
    }

    if (!result.value) {
      return reply.status(403).send({
        type: 'https://httpstatuses.io/403',
        title: 'Forbidden',
        status: 403,
        detail: `Missing required permission: ${permission}`,
      });
    }
  };
}

// ── Set Tenant Context ──────────────────────────────────────────────
export const setTenantContext: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.currentUser?.tenantId) {
    return reply.status(400).send({
      type: 'https://httpstatuses.io/400',
      title: 'Bad Request',
      status: 400,
      detail: 'Tenant context not available',
    });
  }

  const tenantId = request.currentUser.tenantId;

  // Validate UUID format to prevent SQL injection
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return reply.status(400).send({
      type: 'https://httpstatuses.io/400',
      title: 'Bad Request',
      status: 400,
      detail: 'Invalid tenant ID format',
    });
  }

  const client = await pool.connect();
  try {
    await client.query(`SET app.current_tenant = '${tenantId}'`);
  } finally {
    client.release();
  }
};
