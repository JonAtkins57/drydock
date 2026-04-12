import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { documentTemplates } from '../db/schema/index.js';
import { ok, err } from '../lib/result.js';
import type { Result, AppError } from '../lib/result.js';

export interface CreateTemplateInput {
  templateType: string;
  name: string;
  description?: string;
  htmlContent: string;
  variables?: Record<string, unknown>;
  isDefault?: boolean;
}

export async function listDocumentTemplates(
  tenantId: string,
  templateType?: string,
): Promise<Result<typeof documentTemplates.$inferSelect[], AppError>> {
  try {
    const conditions = [eq(documentTemplates.tenantId, tenantId), eq(documentTemplates.isActive, true)];
    if (templateType) conditions.push(eq(documentTemplates.templateType, templateType));
    const rows = await db.select().from(documentTemplates).where(and(...conditions));
    return ok(rows);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to list templates', details: { error: e } });
  }
}

export async function getDocumentTemplate(
  tenantId: string,
  id: string,
): Promise<Result<typeof documentTemplates.$inferSelect, AppError>> {
  try {
    const [row] = await db.select().from(documentTemplates)
      .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)));
    if (!row) return err({ code: 'NOT_FOUND', message: 'Template not found' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to get template', details: { error: e } });
  }
}

export async function createDocumentTemplate(
  tenantId: string,
  userId: string,
  input: CreateTemplateInput,
): Promise<Result<typeof documentTemplates.$inferSelect, AppError>> {
  try {
    const [row] = await db.insert(documentTemplates).values({
      tenantId,
      templateType: input.templateType,
      name: input.name,
      description: input.description ?? null,
      htmlContent: input.htmlContent,
      variables: input.variables ?? null,
      isDefault: input.isDefault ?? false,
      createdBy: userId,
      updatedBy: userId,
    }).returning();
    if (!row) return err({ code: 'INTERNAL', message: 'Insert returned no row' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to create template', details: { error: e } });
  }
}

export async function updateDocumentTemplate(
  tenantId: string,
  userId: string,
  id: string,
  input: Partial<CreateTemplateInput>,
): Promise<Result<typeof documentTemplates.$inferSelect, AppError>> {
  try {
    const existing = await getDocumentTemplate(tenantId, id);
    if (!existing.ok) return existing;
    const [row] = await db.update(documentTemplates).set({
      ...input,
      version: existing.value.version + 1,
      updatedBy: userId,
      updatedAt: new Date(),
    }).where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'Template not found' });
    return ok(row);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to update template', details: { error: e } });
  }
}

export async function deleteDocumentTemplate(
  tenantId: string,
  id: string,
): Promise<Result<void, AppError>> {
  try {
    const [row] = await db.update(documentTemplates).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
      .returning();
    if (!row) return err({ code: 'NOT_FOUND', message: 'Template not found' });
    return ok(undefined);
  } catch (e) {
    return err({ code: 'INTERNAL', message: 'Failed to delete template', details: { error: e } });
  }
}

// Render a template with Handlebars-style variable substitution
export function renderTemplate(htmlContent: string, vars: Record<string, unknown>): string {
  return htmlContent.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const parts = path.split('.');
    let val: unknown = vars;
    for (const p of parts) {
      if (val != null && typeof val === 'object') {
        val = (val as Record<string, unknown>)[p];
      } else {
        val = undefined;
        break;
      }
    }
    return val != null ? String(val) : '';
  });
}
