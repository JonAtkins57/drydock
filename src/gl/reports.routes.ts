import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { authenticateHook, requirePermission, setTenantContext } from '../core/auth.middleware.js';
import {
  balanceSheetRollForwardQuerySchema,
  getBalanceSheetRollForward,
} from './reports/balance-sheet-rollforward.js';
import { getIncomeStatement, getBalanceSheet } from './reporting.js';
import type { AppErrorCode } from '../lib/result.js';

const dateRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  entityId: z.string().uuid().optional(),
});

const asOfQuerySchema = z.object({
  asOf: z.string().optional(),
  entityId: z.string().uuid().optional(),
});

const STATUS_MAP: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL: 500,
  BAD_REQUEST: 400,
};

function errorStatus(code: AppErrorCode): number {
  return STATUS_MAP[code] ?? 500;
}

function errorResponse(code: AppErrorCode, message: string) {
  const status = errorStatus(code);
  return {
    type: `https://httpstatuses.io/${status}`,
    title: code,
    status,
    detail: message,
  };
}

const glReportsRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET /api/v1/reports/income-statement
  fastify.get('/api/v1/reports/income-statement', {
    preHandler: [requirePermission('gl.report.read')],
  }, async (request, reply) => {
    const parsed = dateRangeQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }
    const result = await getIncomeStatement(
      request.currentUser.tenantId,
      parsed.data.from,
      parsed.data.to,
      parsed.data.entityId,
    );
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(errorResponse(result.error.code, result.error.message));
    }
    return reply.status(200).send(result.value);
  });

  // GET /api/v1/reports/balance-sheet
  fastify.get('/api/v1/reports/balance-sheet', {
    preHandler: [requirePermission('gl.report.read')],
  }, async (request, reply) => {
    const parsed = asOfQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }
    const result = await getBalanceSheet(
      request.currentUser.tenantId,
      parsed.data.asOf,
      parsed.data.entityId,
    );
    if (!result.ok) {
      return reply.status(errorStatus(result.error.code)).send(errorResponse(result.error.code, result.error.message));
    }
    return reply.status(200).send(result.value);
  });

  // GET /api/v1/reports/balance-sheet-rollforward
  fastify.get('/api/v1/reports/balance-sheet-rollforward', {
    preHandler: [requirePermission('gl.report.read')],
  }, async (request, reply) => {
    const parsed = balanceSheetRollForwardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const result = await getBalanceSheetRollForward(
      request.currentUser.tenantId,
      parsed.data.periodId,
      parsed.data.accountType,
    );
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  done();
};

export default glReportsRoutes;
