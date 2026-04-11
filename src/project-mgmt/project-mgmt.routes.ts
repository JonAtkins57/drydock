import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { projectsMgmt } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createProjectMgmtSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).default('planning'),
  customerId: z.string().uuid().nullish(),
  managerEmployeeId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetCents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const updateProjectMgmtSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  customerId: z.string().uuid().nullish(),
  managerEmployeeId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetCents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function projectMgmtRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list projects
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid query parameters',
        details: query.error.flatten().fieldErrors,
      });
    }

    const { tenantId } = request.currentUser;
    const { page, pageSize } = query.data;
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(projectsMgmt)
        .where(eq(projectsMgmt.tenantId, tenantId)),
      db
        .select()
        .from(projectsMgmt)
        .where(eq(projectsMgmt.tenantId, tenantId))
        .orderBy(desc(projectsMgmt.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = Number(totalResult[0]?.value ?? 0);

    return reply.send({
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });

  // POST / — create project
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createProjectMgmtSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const {
      name,
      description,
      status,
      customerId,
      managerEmployeeId,
      departmentId,
      startDate,
      endDate,
      budgetCents,
      notes,
    } = parsed.data;

    const numResult = await generateNumber(tenantId, 'project_mgmt');
    if (!numResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: numResult.error.message });
    }

    const [project] = await db
      .insert(projectsMgmt)
      .values({
        tenantId,
        projectNumber: numResult.value,
        name,
        description: description ?? null,
        status,
        customerId: customerId ?? null,
        managerEmployeeId: managerEmployeeId ?? null,
        departmentId: departmentId ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        budgetCents: budgetCents ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(project);
  });

  // PATCH /:id — update project
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateProjectMgmtSchema.safeParse(request.body);
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
      .from(projectsMgmt)
      .where(eq(projectsMgmt.id, id));

    if (!existing || existing.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Project not found' });
    }

    const updatePayload: Partial<typeof projectsMgmt.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    const d = parsed.data;
    if (d.name !== undefined) updatePayload.name = d.name;
    if (d.description !== undefined) updatePayload.description = d.description;
    if (d.status !== undefined) updatePayload.status = d.status;
    if ('customerId' in d) updatePayload.customerId = d.customerId ?? null;
    if ('managerEmployeeId' in d) updatePayload.managerEmployeeId = d.managerEmployeeId ?? null;
    if ('departmentId' in d) updatePayload.departmentId = d.departmentId ?? null;
    if (d.startDate !== undefined) updatePayload.startDate = d.startDate;
    if (d.endDate !== undefined) updatePayload.endDate = d.endDate;
    if (d.budgetCents !== undefined) updatePayload.budgetCents = d.budgetCents;
    if (d.notes !== undefined) updatePayload.notes = d.notes;

    const [updated] = await db
      .update(projectsMgmt)
      .set(updatePayload)
      .where(eq(projectsMgmt.id, id))
      .returning();

    return reply.send(updated);
  });

  // DELETE /:id — soft-delete project
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [existing] = await db
      .select()
      .from(projectsMgmt)
      .where(eq(projectsMgmt.id, id));

    if (!existing || existing.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Project not found' });
    }

    const [deleted] = await db
      .update(projectsMgmt)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: userId })
      .where(eq(projectsMgmt.id, id))
      .returning();

    return reply.send(deleted);
  });
}
