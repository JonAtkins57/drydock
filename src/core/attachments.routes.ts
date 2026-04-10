import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { authenticateHook, setTenantContext } from './auth.middleware.js';
import { db } from '../db/connection.js';
import { attachments } from '../db/schema/index.js';
import { uploadFile, getPresignedUrl, deleteFile } from './s3.js';

export default async function attachmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateHook);
  fastify.addHook('preHandler', setTenantContext);

  // POST /api/v1/attachments — upload file
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, sub: userId } = request.currentUser;

    let entityType: string | undefined;
    let entityId: string | undefined;
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;
    let sizeBytes = 0;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'entity_type') entityType = part.value as string;
        if (part.fieldname === 'entity_id') entityId = part.value as string;
      } else if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk as Buffer);
        }
        fileBuffer = Buffer.concat(chunks);
        sizeBytes = fileBuffer.length;
        filename = part.filename;
        mimeType = part.mimetype;
      }
    }

    if (!entityType || !entityId || !fileBuffer || !filename || !mimeType) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'entity_type, entity_id, and file are required',
      });
    }

    const s3Key = await uploadFile(tenantId, entityType, entityId, filename, fileBuffer, mimeType);

    const [row] = await db.insert(attachments).values({
      tenantId,
      entityType,
      entityId,
      filename,
      s3Key,
      mimeType,
      sizeBytes,
      uploadedBy: userId,
    }).returning();

    return reply.status(201).send(row);
  });

  // GET /api/v1/attachments?entity_type=x&entity_id=y
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const query = request.query as Record<string, string>;
    const { entity_type: entityType, entity_id: entityId } = query;

    if (!entityType || !entityId) {
      return reply.status(400).send({
        type: 'https://httpstatuses.io/400',
        title: 'Bad Request',
        status: 400,
        detail: 'entity_type and entity_id query parameters are required',
      });
    }

    const rows = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, tenantId),
          eq(attachments.entityType, entityType),
          eq(attachments.entityId, entityId),
        ),
      );

    const result = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        presigned_url: await getPresignedUrl(row.s3Key),
      })),
    );

    return reply.send(result);
  });

  // DELETE /api/v1/attachments/:id
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { tenantId } = request.currentUser;
    const { id } = request.params;

    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({
        type: 'https://httpstatuses.io/404',
        title: 'Not Found',
        status: 404,
        detail: 'Attachment not found',
      });
    }

    await deleteFile(row.s3Key);

    await db
      .delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, tenantId)));

    return reply.status(204).send();
  });
}
