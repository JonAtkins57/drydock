import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from './api-keys.service.js';

// Routes that don't require an API key
const PUBLIC_PREFIXES = [
  '/docs',
  '/api/v1/openapi.json',
  '/api/v1/health',
  '/api/v1/auth/',
  '/webhooks/',
  '/api/v1/webhooks/',
];

function isPublicRoute(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isPublicRoute(request.url)) return;

  const authHeader = request.headers['authorization'] as string | undefined;
  const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

  let rawKey: string | undefined;

  if (apiKeyHeader) {
    rawKey = apiKeyHeader;
  } else if (authHeader?.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7);
  }

  if (!rawKey) {
    return reply.status(401).send({
      type: 'https://httpstatuses.io/401',
      title: 'UNAUTHORIZED',
      status: 401,
      detail: 'Missing API key. Provide X-API-Key header or Authorization: Bearer <key>.',
    });
  }

  const validated = await validateApiKey(rawKey);
  if (!validated) {
    return reply.status(401).send({
      type: 'https://httpstatuses.io/401',
      title: 'UNAUTHORIZED',
      status: 401,
      detail: 'Invalid or expired API key.',
    });
  }

  // Attach resolved tenant IDs to the request for downstream handlers
  (request as FastifyRequest & { apiKeyId: string; apiKeyTenantIds: string[] }).apiKeyId = validated.id;
  (request as FastifyRequest & { apiKeyTenantIds: string[] }).apiKeyTenantIds = validated.tenantIds;
}
