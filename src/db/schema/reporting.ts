import { pgSchema, uuid, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const reportingSchema = pgSchema('drydock_reporting');

// ── Enums ─────────────────────────────────────────────────────────

export const widgetTypeEnum = reportingSchema.enum('widget_type', [
  'metric',
  'bar_chart',
  'line_chart',
  'pie_chart',
  'table',
]);

// ── KPI Dashboards ─────────────────────────────────────────────────

export const kpiDashboards = reportingSchema.table('kpi_dashboards', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

// ── Dashboard Widgets ──────────────────────────────────────────────

/**
 * config (jsonb) schema depends on widget_type:
 *   metric:     { kpiKey: string; label?: string }
 *   bar_chart:  { kpiKey: string; label?: string; period?: 'month'|'quarter' }
 *   line_chart: { kpiKey: string; label?: string; period?: 'month'|'quarter' }
 *   pie_chart:  { kpiKey: string; label?: string }
 *   table:      { kpiKey: string; label?: string; columns?: string[] }
 */
export const dashboardWidgets = reportingSchema.table('dashboard_widgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  dashboardId: uuid('dashboard_id').notNull().references(() => kpiDashboards.id, { onDelete: 'cascade' }),
  widgetType: widgetTypeEnum('widget_type').notNull(),
  title: text('title').notNull(),
  kpiKey: text('kpi_key').notNull(),
  config: jsonb('config').notNull().default({}),
  // Grid layout: col/row (0-indexed), width/height in grid units
  gridCol: integer('grid_col').notNull().default(0),
  gridRow: integer('grid_row').notNull().default(0),
  gridWidth: integer('grid_width').notNull().default(2),
  gridHeight: integer('grid_height').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
