import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticateHook, requirePermission, setTenantContext } from '../core/auth.middleware.js';
import {
  createAccountSchema,
  updateAccountSchema,
  listAccountsQuerySchema,
  createPeriodSchema,
  listPeriodsQuerySchema,
  updatePeriodStatusSchema,
  createJournalEntrySchema,
  listJournalEntriesQuerySchema,
  reverseJournalSchema,
  trialBalanceQuerySchema,
  createChecklistSchema,
  updateChecklistItemSchema,
  listChecklistQuerySchema,
  createRecurringTemplateSchema,
  createRecurringTemplateLineSchema,
  updateRecurringTemplateSchema,
  listRecurringTemplatesQuerySchema,
} from './gl.schemas.js';
import * as recurringSvc from './recurring.service.js';
import * as accountsSvc from './accounts.service.js';
import { exportAccountsCsv, importAccountsCsv } from '../master/import-export.service.js';
import * as periodsSvc from './periods.service.js';
import * as postingSvc from './posting.service.js';
import * as checklistSvc from './close-checklist.service.js';
import { getTrialBalance } from './trial-balance.service.js';
import type { AppErrorCode } from '../lib/result.js';

// ── Error response helper ──────────────────────────────────────────

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

function errorResponse(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
  const status = errorStatus(code);
  return {
    type: `https://httpstatuses.io/${status}`,
    title: code,
    status,
    detail: message,
    ...(details ? { details } : {}),
  };
}

// ── Plugin ─────────────────────────────────────────────────────────

const glRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  // All GL routes require authentication and tenant context
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ════════════════════════════════════════════════════════════════
  // ACCOUNTS
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/accounts
  fastify.post('/api/v1/accounts', {
    preHandler: [requirePermission('gl.account.create')],
  }, async (request, reply) => {
    const parsed = createAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await accountsSvc.createAccount(tenantId, parsed.data, userId);

    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/accounts
  fastify.get('/api/v1/accounts', {
    preHandler: [requirePermission('gl.account.read')],
  }, async (request, reply) => {
    const parsed = listAccountsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const result = await accountsSvc.listAccounts(request.currentUser.tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // GET /api/v1/accounts/:id
  fastify.get<{ Params: { id: string } }>('/api/v1/accounts/:id', {
    preHandler: [requirePermission('gl.account.read')],
  }, async (request, reply) => {
    const result = await accountsSvc.getAccount(request.currentUser.tenantId, request.params.id);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // PUT /api/v1/accounts/:id
  fastify.put<{ Params: { id: string } }>('/api/v1/accounts/:id', {
    preHandler: [requirePermission('gl.account.update')],
  }, async (request, reply) => {
    const parsed = updateAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await accountsSvc.updateAccount(tenantId, request.params.id, parsed.data, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/accounts/:id/actions/deactivate
  fastify.post<{ Params: { id: string } }>('/api/v1/accounts/:id/actions/deactivate', {
    preHandler: [requirePermission('gl.account.update')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await accountsSvc.deactivateAccount(tenantId, request.params.id, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // GET /api/v1/accounts/export — export chart of accounts as CSV
  fastify.get('/api/v1/accounts/export', {
    preHandler: [requirePermission('gl.account.read')],
  }, async (request, reply) => {
    const csv = await exportAccountsCsv(request.currentUser.tenantId);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="chart-of-accounts.csv"')
      .send(csv);
  });

  // POST /api/v1/accounts/import — import chart of accounts from CSV (multipart)
  fastify.post('/api/v1/accounts/import', {
    preHandler: [requirePermission('gl.account.create')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const data = await request.file();
    if (!data) {
      return reply.status(422).send(errorResponse('VALIDATION', 'No file uploaded'));
    }
    const buf = await data.toBuffer();
    const csvText = buf.toString('utf-8');
    const result = await importAccountsCsv(tenantId, csvText, userId);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }
    return reply.send(result.value);
  });

  // ════════════════════════════════════════════════════════════════
  // ACCOUNTING PERIODS
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/accounting-periods
  fastify.post('/api/v1/accounting-periods', {
    preHandler: [requirePermission('gl.period.create')],
  }, async (request, reply) => {
    const parsed = createPeriodSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await periodsSvc.createPeriod(tenantId, parsed.data, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/accounting-periods
  fastify.get('/api/v1/accounting-periods', {
    preHandler: [requirePermission('gl.period.read')],
  }, async (request, reply) => {
    const parsed = listPeriodsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const { tenantId } = request.currentUser;
    const result = await periodsSvc.listPeriods(tenantId, parsed.data.fiscalYear, parsed.data.entityId);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/accounting-periods/:id/actions/status
  fastify.post<{ Params: { id: string } }>('/api/v1/accounting-periods/:id/actions/status', {
    preHandler: [requirePermission('gl.period.manage')],
  }, async (request, reply) => {
    const parsed = updatePeriodStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await periodsSvc.updatePeriodStatus(tenantId, request.params.id, parsed.data.status, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // ════════════════════════════════════════════════════════════════
  // JOURNAL ENTRIES
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/journal-entries
  fastify.post('/api/v1/journal-entries', {
    preHandler: [requirePermission('gl.journal.create')],
  }, async (request, reply) => {
    const parsed = createJournalEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await postingSvc.createJournalEntry(tenantId, parsed.data, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/journal-entries
  fastify.get('/api/v1/journal-entries', {
    preHandler: [requirePermission('gl.journal.read')],
  }, async (request, reply) => {
    const parsed = listJournalEntriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const result = await postingSvc.listJournalEntries(request.currentUser.tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // GET /api/v1/journal-entries/:id
  fastify.get<{ Params: { id: string } }>('/api/v1/journal-entries/:id', {
    preHandler: [requirePermission('gl.journal.read')],
  }, async (request, reply) => {
    const result = await postingSvc.getJournalEntry(request.currentUser.tenantId, request.params.id);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/journal-entries/:id/actions/submit
  fastify.post<{ Params: { id: string } }>('/api/v1/journal-entries/:id/actions/submit', {
    preHandler: [requirePermission('gl.journal.submit')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await postingSvc.submitForApproval(tenantId, request.params.id, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/journal-entries/:id/actions/approve
  fastify.post<{ Params: { id: string } }>('/api/v1/journal-entries/:id/actions/approve', {
    preHandler: [requirePermission('gl.journal.approve')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await postingSvc.approveJournal(tenantId, request.params.id, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/journal-entries/:id/actions/post
  fastify.post<{ Params: { id: string } }>('/api/v1/journal-entries/:id/actions/post', {
    preHandler: [requirePermission('gl.journal.post')],
  }, async (request, reply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const result = await postingSvc.postJournal(tenantId, request.params.id, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // POST /api/v1/journal-entries/:id/actions/reverse
  fastify.post<{ Params: { id: string } }>('/api/v1/journal-entries/:id/actions/reverse', {
    preHandler: [requirePermission('gl.journal.reverse')],
  }, async (request, reply) => {
    const parsed = reverseJournalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await postingSvc.reverseJournal(
      tenantId,
      request.params.id,
      userId,
      parsed.data.reversalDate,
    );
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // ════════════════════════════════════════════════════════════════
  // REPORTS
  // ════════════════════════════════════════════════════════════════

  // GET /api/v1/reports/trial-balance
  fastify.get('/api/v1/reports/trial-balance', {
    preHandler: [requirePermission('gl.report.read')],
  }, async (request, reply) => {
    const parsed = trialBalanceQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const result = await getTrialBalance(request.currentUser.tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // ════════════════════════════════════════════════════════════════
  // CLOSE CHECKLISTS
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/close-checklists
  fastify.post('/api/v1/close-checklists', {
    preHandler: [requirePermission('gl.period.manage')],
  }, async (request, reply) => {
    const parsed = createChecklistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await checklistSvc.createChecklist(tenantId, parsed.data.periodId, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/close-checklists?periodId=X
  fastify.get('/api/v1/close-checklists', {
    preHandler: [requirePermission('gl.period.read')],
  }, async (request, reply) => {
    const parsed = listChecklistQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId } = request.currentUser;
    const result = await checklistSvc.getChecklistByPeriod(tenantId, parsed.data.periodId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // PATCH /api/v1/close-checklists/:checklistId/items/:itemId
  fastify.patch<{ Params: { checklistId: string; itemId: string } }>(
    '/api/v1/close-checklists/:checklistId/items/:itemId',
    { preHandler: [requirePermission('gl.period.manage')] },
    async (request, reply) => {
      const parsed = updateChecklistItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
          errors: parsed.error.flatten().fieldErrors,
        }));
      }

      const { tenantId, sub: userId } = request.currentUser;
      const result = await checklistSvc.updateChecklistItem(
        tenantId,
        request.params.checklistId,
        request.params.itemId,
        parsed.data,
        userId,
      );
      if (!result.ok) {
        const status = errorStatus(result.error.code);
        return reply.status(status).send(errorResponse(result.error.code, result.error.message));
      }

      return reply.status(200).send(result.value);
    },
  );

  // GET /api/v1/close-checklists/:checklistId/summary
  fastify.get<{ Params: { checklistId: string } }>(
    '/api/v1/close-checklists/:checklistId/summary',
    { preHandler: [requirePermission('gl.period.read')] },
    async (request, reply) => {
      const { tenantId } = request.currentUser;
      const result = await checklistSvc.getChecklistSummary(tenantId, request.params.checklistId);
      if (!result.ok) {
        const status = errorStatus(result.error.code);
        return reply.status(status).send(errorResponse(result.error.code, result.error.message));
      }

      return reply.status(200).send(result.value);
    },
  );

  // ════════════════════════════════════════════════════════════════
  // RECURRING JOURNAL TEMPLATES
  // ════════════════════════════════════════════════════════════════

  // POST /api/v1/recurring-journal-templates
  fastify.post('/api/v1/recurring-journal-templates', {
    preHandler: [requirePermission('gl.recurring.create')],
  }, async (request, reply) => {
    const parsed = createRecurringTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId, sub: userId } = request.currentUser;
    const result = await recurringSvc.createTemplate(tenantId, parsed.data, userId);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // POST /api/v1/recurring-journal-templates/:id/lines
  fastify.post<{ Params: { id: string } }>('/api/v1/recurring-journal-templates/:id/lines', {
    preHandler: [requirePermission('gl.recurring.create')],
  }, async (request, reply) => {
    const parsed = createRecurringTemplateLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId } = request.currentUser;
    const result = await recurringSvc.addTemplateLine(tenantId, request.params.id, parsed.data);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(201).send(result.value);
  });

  // GET /api/v1/recurring-journal-templates
  fastify.get('/api/v1/recurring-journal-templates', {
    preHandler: [requirePermission('gl.recurring.read')],
  }, async (request, reply) => {
    const parsed = listRecurringTemplatesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Invalid query parameters'));
    }

    const result = await recurringSvc.listTemplates(request.currentUser.tenantId, parsed.data);
    if (!result.ok) {
      return reply.status(500).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // GET /api/v1/recurring-journal-templates/:id
  fastify.get<{ Params: { id: string } }>('/api/v1/recurring-journal-templates/:id', {
    preHandler: [requirePermission('gl.recurring.read')],
  }, async (request, reply) => {
    const result = await recurringSvc.getTemplate(request.currentUser.tenantId, request.params.id);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // PATCH /api/v1/recurring-journal-templates/:id
  fastify.patch<{ Params: { id: string } }>('/api/v1/recurring-journal-templates/:id', {
    preHandler: [requirePermission('gl.recurring.update')],
  }, async (request, reply) => {
    const parsed = updateRecurringTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', 'Validation failed', {
        errors: parsed.error.flatten().fieldErrors,
      }));
    }

    const { tenantId } = request.currentUser;
    const result = await recurringSvc.updateTemplate(tenantId, request.params.id, parsed.data);
    if (!result.ok) {
      const status = errorStatus(result.error.code);
      return reply.status(status).send(errorResponse(result.error.code, result.error.message));
    }

    return reply.status(200).send(result.value);
  });

  // DELETE /api/v1/recurring-journal-templates/:id/lines/:lineId
  fastify.delete<{ Params: { id: string; lineId: string } }>(
    '/api/v1/recurring-journal-templates/:id/lines/:lineId',
    {
      preHandler: [requirePermission('gl.recurring.update')],
    },
    async (request, reply) => {
      const { tenantId } = request.currentUser;
      const result = await recurringSvc.deleteTemplateLine(
        tenantId,
        request.params.id,
        request.params.lineId,
      );
      if (!result.ok) {
        const status = errorStatus(result.error.code);
        return reply.status(status).send(errorResponse(result.error.code, result.error.message));
      }

      return reply.status(200).send(result.value);
    },
  );

  done();
};

export default glRoutes;
