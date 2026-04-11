import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, count } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from '../core/auth.middleware.js';
import { db } from '../db/connection.js';
import { workOrders, workOrderParts, workOrderTimeLogs } from '../db/schema/index.js';
import { generateNumber } from '../core/numbering.service.js';

// ── Status Transition Map ──────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['assigned'],
  assigned: ['in_progress', 'open'],
  in_progress: ['completed'],
  completed: ['invoiced'],
  invoiced: [],
};

// ── Schemas ────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const createWorkOrderSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['maintenance', 'installation', 'repair']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedToEmployeeId: z.string().uuid().nullish(),
  assignedTeam: z.string().optional(),
  locationId: z.string().uuid().nullish(),
  customerId: z.string().uuid().nullish(),
  scheduledDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(['maintenance', 'installation', 'repair']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'assigned', 'in_progress', 'completed', 'invoiced']).optional(),
  assignedToEmployeeId: z.string().uuid().nullish(),
  assignedTeam: z.string().optional(),
  locationId: z.string().uuid().nullish(),
  customerId: z.string().uuid().nullish(),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  notes: z.string().optional(),
});

const addPartSchema = z.object({
  itemId: z.string().uuid().nullish(),
  partName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitCostCents: z.number().int().min(0).optional(),
});

const addTimeLogSchema = z.object({
  employeeId: z.string().uuid().nullish(),
  loggedDate: z.string().min(1),
  hoursWorked: z.number().int().positive(),
  notes: z.string().optional(),
});

// ── Plugin ─────────────────────────────────────────────────────────

export async function workOrderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // GET / — list work orders
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
        .from(workOrders)
        .where(eq(workOrders.tenantId, tenantId)),
      db
        .select()
        .from(workOrders)
        .where(eq(workOrders.tenantId, tenantId))
        .orderBy(desc(workOrders.createdAt))
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

  // POST / — create work order
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createWorkOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const {
      title,
      description,
      type,
      priority,
      assignedToEmployeeId,
      assignedTeam,
      locationId,
      customerId,
      scheduledDate,
      notes,
    } = parsed.data;

    const numResult = await generateNumber(tenantId, 'work_order');
    if (!numResult.ok) {
      return reply.status(500).send({ error: 'INTERNAL', message: numResult.error.message });
    }

    const [wo] = await db
      .insert(workOrders)
      .values({
        tenantId,
        workOrderNumber: numResult.value,
        title,
        description: description ?? null,
        type,
        priority,
        status: 'open',
        assignedToEmployeeId: assignedToEmployeeId ?? null,
        assignedTeam: assignedTeam ?? null,
        locationId: locationId ?? null,
        customerId: customerId ?? null,
        scheduledDate: scheduledDate ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(wo);
  });

  // PATCH /:id — update work order (enforces status transitions)
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = updateWorkOrderSchema.safeParse(request.body);
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
      .from(workOrders)
      .where(eq(workOrders.id, id));

    if (!existing || existing.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Work order not found' });
    }

    const { status: newStatus, ...rest } = parsed.data;

    if (newStatus !== undefined && newStatus !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return reply.status(422).send({
          error: 'INVALID_TRANSITION',
          message: `Cannot transition from '${existing.status}' to '${newStatus}'`,
        });
      }
    }

    const updatePayload: Partial<typeof workOrders.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    if (rest.title !== undefined) updatePayload.title = rest.title;
    if (rest.description !== undefined) updatePayload.description = rest.description;
    if (rest.type !== undefined) updatePayload.type = rest.type;
    if (rest.priority !== undefined) updatePayload.priority = rest.priority;
    if (newStatus !== undefined) updatePayload.status = newStatus;
    if ('assignedToEmployeeId' in rest) updatePayload.assignedToEmployeeId = rest.assignedToEmployeeId ?? null;
    if (rest.assignedTeam !== undefined) updatePayload.assignedTeam = rest.assignedTeam;
    if ('locationId' in rest) updatePayload.locationId = rest.locationId ?? null;
    if ('customerId' in rest) updatePayload.customerId = rest.customerId ?? null;
    if (rest.scheduledDate !== undefined) updatePayload.scheduledDate = rest.scheduledDate;
    if (rest.completedDate !== undefined) updatePayload.completedDate = rest.completedDate;
    if (rest.notes !== undefined) updatePayload.notes = rest.notes;

    const [updated] = await db
      .update(workOrders)
      .set(updatePayload)
      .where(eq(workOrders.id, id))
      .returning();

    return reply.send(updated);
  });

  // POST /:id/parts — add a part to a work order
  fastify.post('/:id/parts', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = addPartSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id));

    if (!wo || wo.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Work order not found' });
    }

    const { itemId, partName, quantity, unitCostCents } = parsed.data;

    const [part] = await db
      .insert(workOrderParts)
      .values({
        tenantId,
        workOrderId: id,
        itemId: itemId ?? null,
        partName,
        quantity,
        unitCostCents: unitCostCents ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(part);
  });

  // POST /:id/time-logs — add a time log to a work order
  fastify.post('/:id/time-logs', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = addTimeLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, sub: userId } = request.currentUser;
    const { id } = request.params;

    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id));

    if (!wo || wo.tenantId !== tenantId) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Work order not found' });
    }

    const { employeeId, loggedDate, hoursWorked, notes } = parsed.data;

    const [timeLog] = await db
      .insert(workOrderTimeLogs)
      .values({
        tenantId,
        workOrderId: id,
        employeeId: employeeId ?? null,
        loggedDate,
        hoursWorked,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send(timeLog);
  });
}
