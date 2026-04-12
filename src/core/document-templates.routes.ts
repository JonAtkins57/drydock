import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateHook } from './auth.middleware.js';
import {
  listDocumentTemplates,
  getDocumentTemplate,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  renderTemplate,
} from './document-templates.service.js';
import type { AppError } from '../lib/result.js';

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, INTERNAL: 500,
};
function sendError(reply: FastifyReply, error: AppError): FastifyReply {
  return reply.status(STATUS_MAP[error.code] ?? 500).send({ error: error.code, message: error.message });
}

const createSchema = z.object({
  templateType: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  htmlContent: z.string().min(1),
  variables: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

const previewSchema = z.object({
  vars: z.record(z.unknown()),
});

export async function documentTemplateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);

  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { type } = req.query as { type?: string };
    const result = await listDocumentTemplates(tenantId, type);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send({ data: result.value });
  });

  fastify.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { id } = req.params as { id: string };
    const result = await getDocumentTemplate(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const userId = (req as unknown as { userId: string }).userId;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const result = await createDocumentTemplate(tenantId, userId, parsed.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(201).send(result.value);
  });

  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const userId = (req as unknown as { userId: string }).userId;
    const { id } = req.params as { id: string };
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const result = await updateDocumentTemplate(tenantId, userId, id, parsed.data);
    if (!result.ok) return sendError(reply, result.error);
    return reply.send(result.value);
  });

  fastify.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { id } = req.params as { id: string };
    const result = await deleteDocumentTemplate(tenantId, id);
    if (!result.ok) return sendError(reply, result.error);
    return reply.status(204).send();
  });

  // Preview — render template with provided vars, return HTML
  fastify.post('/:id/preview', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const { id } = req.params as { id: string };
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(422).send({ error: 'VALIDATION', message: parsed.error.message });
    const tpl = await getDocumentTemplate(tenantId, id);
    if (!tpl.ok) return sendError(reply, tpl.error);
    const html = renderTemplate(tpl.value.htmlContent, parsed.data.vars);
    return reply.type('text/html').send(html);
  });
}
