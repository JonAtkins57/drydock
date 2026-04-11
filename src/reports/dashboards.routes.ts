import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { dashboardLayouts } from '../db/schema/index.js';

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum([
    'revenue',
    'open_ar',
    'invoice_count',
    'open_opportunities',
    'pipeline_value',
    'posted_journals',
  ]),
  position: z.object({ col: z.number().int().min(0), row: z.number().int().min(0) }),
});

const createDashboardSchema = z.object({
  name: z.string().min(1).max(100),
  widgets: z.array(widgetSchema).min(1).max(12),
  isDefault: z.boolean().optional().default(false),
});

const updateDashboardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  widgets: z.array(widgetSchema).min(1).max(12).optional(),
  isDefault: z.boolean().optional(),
});

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list current user's dashboards
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;

    const rows = await db
      .select()
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.userId, userId)))
      .orderBy(desc(dashboardLayouts.updatedAt));

    return reply.send({ data: rows });
  });

  // POST / — create a new dashboard layout
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createDashboardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { name, widgets, isDefault } = parsed.data;

    // If setting as default, clear other defaults for this user
    if (isDefault) {
      await db
        .update(dashboardLayouts)
        .set({ isDefault: false })
        .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.userId, userId)));
    }

    const [layout] = await db
      .insert(dashboardLayouts)
      .values({ tenantId, userId, name, widgets, isDefault })
      .returning();

    return reply.status(201).send(layout);
  });

  // GET /:id — get a single dashboard layout
  fastify.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [layout] = await db
        .select()
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.tenantId, tenantId),
            eq(dashboardLayouts.userId, userId),
          ),
        );

      if (!layout) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dashboard not found' });
      }

      return reply.send(layout);
    },
  );

  // PUT /:id — update a dashboard layout (full replace of widgets)
  fastify.put(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parsed = updateDashboardSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: 'VALIDATION',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.tenantId, tenantId),
            eq(dashboardLayouts.userId, userId),
          ),
        );

      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dashboard not found' });
      }

      const updates = parsed.data;

      // If setting as default, clear other defaults for this user
      if (updates.isDefault) {
        await db
          .update(dashboardLayouts)
          .set({ isDefault: false })
          .where(and(eq(dashboardLayouts.tenantId, tenantId), eq(dashboardLayouts.userId, userId)));
      }

      const [updated] = await db
        .update(dashboardLayouts)
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.widgets !== undefined && { widgets: updates.widgets }),
          ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
          updatedAt: new Date(),
        })
        .where(eq(dashboardLayouts.id, id))
        .returning();

      return reply.send(updated);
    },
  );

  // DELETE /:id — delete a dashboard layout
  fastify.delete(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { tenantId, sub: userId } = request.currentUser;
      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.tenantId, tenantId),
            eq(dashboardLayouts.userId, userId),
          ),
        );

      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Dashboard not found' });
      }

      await db.delete(dashboardLayouts).where(eq(dashboardLayouts.id, id));

      return reply.status(204).send();
    },
  );
}
