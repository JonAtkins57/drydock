import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import {
  recurringJournalTemplates,
  recurringJournalTemplateLines,
} from '../db/schema/gl.js';
import type { AppErrorCode } from '../lib/result.js';

// ── Error helpers ──────────────────────────────────────────────────

const STATUS_MAP: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL: 500,
  BAD_REQUEST: 400,
};

function errorResponse(code: AppErrorCode, message: string) {
  const status = STATUS_MAP[code] ?? 500;
  return {
    type: `https://httpstatuses.io/${status}`,
    title: code,
    status,
    detail: message,
  };
}

// ── Validation schemas ─────────────────────────────────────────────

const templateLineSchema = z.object({
  lineNumber: z.number().int().positive(),
  accountId: z.string().uuid(),
  debitAmount: z.number().int().min(0).default(0),
  creditAmount: z.number().int().min(0).default(0),
  description: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  journalType: z.enum(['automated', 'manual', 'adjustment']).default('automated'),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  nextRunDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  lines: z.array(templateLineSchema).min(2),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']).optional(),
  nextRunDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'paused', 'completed']).optional(),
  lines: z.array(templateLineSchema).min(2).optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

const recurringJournalsRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // ── GET /api/v1/recurring-journals ──────────────────────────────
  fastify.get('/api/v1/recurring-journals', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const query = request.query as { status?: string; page?: string; page_size?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size ?? '25', 10)));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(recurringJournalTemplates.tenantId, tenantId)];
    if (query.status) {
      conditions.push(eq(recurringJournalTemplates.status, query.status));
    }

    const rows = await db
      .select()
      .from(recurringJournalTemplates)
      .where(and(...conditions))
      .orderBy(desc(recurringJournalTemplates.createdAt))
      .limit(pageSize)
      .offset(offset);

    return reply.status(200).send({ data: rows, meta: { page, pageSize } });
  });

  // ── GET /api/v1/recurring-journals/:id ──────────────────────────
  fastify.get('/api/v1/recurring-journals/:id', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const { id } = request.params as { id: string };

    const [template] = await db
      .select()
      .from(recurringJournalTemplates)
      .where(
        and(
          eq(recurringJournalTemplates.id, id),
          eq(recurringJournalTemplates.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!template) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Recurring journal template not found'));
    }

    const lines = await db
      .select()
      .from(recurringJournalTemplateLines)
      .where(eq(recurringJournalTemplateLines.templateId, id));

    return reply.status(200).send({ ...template, lines });
  });

  // ── POST /api/v1/recurring-journals ─────────────────────────────
  fastify.post('/api/v1/recurring-journals', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const userId = request.currentUser.sub;
    const parsed = createTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(errorResponse('VALIDATION', parsed.error.message));
    }

    const { lines, ...templateData } = parsed.data;

    // Validate that lines are balanced
    const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
    if (totalDebit !== totalCredit) {
      return reply
        .status(422)
        .send(errorResponse('VALIDATION', `Template lines are not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`));
    }

    const [template] = await db
      .insert(recurringJournalTemplates)
      .values({
        tenantId,
        ...templateData,
        nextRunDate: new Date(templateData.nextRunDate),
        endDate: templateData.endDate ? new Date(templateData.endDate) : null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (!template) {
      return reply.status(500).send(errorResponse('INTERNAL', 'Failed to create template'));
    }

    if (lines.length > 0) {
      await db.insert(recurringJournalTemplateLines).values(
        lines.map((l) => ({ ...l, tenantId, templateId: template.id })),
      );
    }

    const insertedLines = await db
      .select()
      .from(recurringJournalTemplateLines)
      .where(eq(recurringJournalTemplateLines.templateId, template.id));

    return reply.status(201).send({ ...template, lines: insertedLines });
  });

  // ── PATCH /api/v1/recurring-journals/:id ────────────────────────
  fastify.patch('/api/v1/recurring-journals/:id', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const userId = request.currentUser.sub;
    const { id } = request.params as { id: string };
    const parsed = updateTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send(errorResponse('VALIDATION', parsed.error.message));
    }

    const [existing] = await db
      .select()
      .from(recurringJournalTemplates)
      .where(
        and(
          eq(recurringJournalTemplates.id, id),
          eq(recurringJournalTemplates.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Recurring journal template not found'));
    }

    const { lines, nextRunDate, endDate, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date(),
      updatedBy: userId,
    };
    if (nextRunDate !== undefined) updateData.nextRunDate = new Date(nextRunDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    const [updated] = await db
      .update(recurringJournalTemplates)
      .set(updateData)
      .where(eq(recurringJournalTemplates.id, id))
      .returning();

    // Replace lines if provided
    if (lines !== undefined) {
      const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
      if (totalDebit !== totalCredit) {
        return reply
          .status(422)
          .send(errorResponse('VALIDATION', `Template lines are not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`));
      }

      await db
        .delete(recurringJournalTemplateLines)
        .where(eq(recurringJournalTemplateLines.templateId, id));

      if (lines.length > 0) {
        await db.insert(recurringJournalTemplateLines).values(
          lines.map((l) => ({ ...l, tenantId, templateId: id })),
        );
      }
    }

    const currentLines = await db
      .select()
      .from(recurringJournalTemplateLines)
      .where(eq(recurringJournalTemplateLines.templateId, id));

    return reply.status(200).send({ ...updated, lines: currentLines });
  });

  // ── DELETE /api/v1/recurring-journals/:id ───────────────────────
  fastify.delete('/api/v1/recurring-journals/:id', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(recurringJournalTemplates)
      .where(
        and(
          eq(recurringJournalTemplates.id, id),
          eq(recurringJournalTemplates.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Recurring journal template not found'));
    }

    await db
      .update(recurringJournalTemplates)
      .set({ isActive: false, status: 'completed', updatedAt: new Date() })
      .where(eq(recurringJournalTemplates.id, id));

    return reply.status(204).send();
  });

  done();
};

export default recurringJournalsRoutes;
