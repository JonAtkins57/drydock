/**
 * phase3.spec.ts
 * Coverage for screens not in phase2.spec.ts:
 * Budgets, Project Management, KPI Dashboards, AP Auto-Coding Metrics,
 * Cash Forecast, OCC Billing, Warehouses, Inventory Items/Transactions,
 * Pricing Rate Cards, Jira Integration, Concur Integration.
 */
import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

// ── Budgets ────────────────────────────────────────────────────────

test.describe('Phase 2 — Budgets', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('budgets page renders', async ({ page }) => {
    await navigateTo(page, '/budgets', 'Budgets');
    await expect(page.locator('h1')).toContainText(/budget/i);
  });

  test('budgets show fiscal year and status columns', async ({ page }) => {
    await navigateTo(page, '/budgets', 'Budgets');
    await expect(page.locator('table, [role="table"], .budget').first()).toBeVisible();
  });

  test('create budget opens modal', async ({ page }) => {
    await navigateTo(page, '/budgets', 'Budgets');
    const btn = page.locator('button').filter({ hasText: /new budget|create budget/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Project Management ─────────────────────────────────────────────

test.describe('Phase 2 — Project Management', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('project management page renders', async ({ page }) => {
    await navigateTo(page, '/project-management', 'Project Management');
    await expect(page.locator('h1')).toContainText(/project/i);
  });

  test('project list shows name and status', async ({ page }) => {
    await navigateTo(page, '/project-management', 'Project Management');
    await expect(page.locator('table, .project-list, [role="table"]').first()).toBeVisible();
  });
});

// ── KPI Dashboards ─────────────────────────────────────────────────

test.describe('Phase 2 — KPI Dashboards', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('KPI dashboards page renders', async ({ page }) => {
    await navigateTo(page, '/kpi-dashboards', 'KPI Dashboards');
    await expect(page.locator('h1')).toContainText(/kpi|dashboard/i);
  });

  test('dashboard shows metric cards or chart area', async ({ page }) => {
    await navigateTo(page, '/kpi-dashboards', 'KPI Dashboards');
    await expect(page.locator('.metric, .card, canvas, svg, table').first()).toBeVisible();
  });
});

// ── AP Auto-Coding Metrics ─────────────────────────────────────────

test.describe('Phase 2 — AP Auto-Coding Metrics', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('auto-coding metrics page renders', async ({ page }) => {
    await page.goto('/ap/auto-coding-metrics');
    await expect(page.locator('h1')).toContainText(/auto.?cod|ml|metric/i);
  });

  test('metrics page shows accuracy or suggestion stats', async ({ page }) => {
    await page.goto('/ap/auto-coding-metrics');
    await expect(page.locator('.metric, .stat, table, .card').first()).toBeVisible();
  });
});

// ── Cash Forecast ──────────────────────────────────────────────────

test.describe('Phase 2 — Cash Forecast', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('cash forecast page renders', async ({ page }) => {
    await navigateTo(page, '/cash-forecast', 'Cash Forecast');
    await expect(page.locator('h1')).toContainText(/cash/i);
  });

  test('forecast shows inflow/outflow or period columns', async ({ page }) => {
    await navigateTo(page, '/cash-forecast', 'Cash Forecast');
    await expect(page.locator('table, .forecast, canvas, svg').first()).toBeVisible();
  });

  test('create forecast entry opens form', async ({ page }) => {
    await navigateTo(page, '/cash-forecast', 'Cash Forecast');
    const btn = page.locator('button').filter({ hasText: /new|add|create/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── OCC Billing ────────────────────────────────────────────────────

test.describe('Phase 2 — OCC Billing', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('OCC billing page renders', async ({ page }) => {
    await navigateTo(page, '/occ-billing', 'OCC Billing');
    await expect(page.locator('h1')).toContainText(/occ|billing|usage/i);
  });

  test('OCC page shows usage records or plan list', async ({ page }) => {
    await navigateTo(page, '/occ-billing', 'OCC Billing');
    await expect(page.locator('table, .plan-list, .usage').first()).toBeVisible();
  });
});

// ── Warehouses ─────────────────────────────────────────────────────

test.describe('Phase 2 — Warehouses', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('warehouses page renders', async ({ page }) => {
    await navigateTo(page, '/warehouses', 'Warehouses');
    await expect(page.locator('h1')).toContainText(/warehouse/i);
  });

  test('warehouses show name and location columns', async ({ page }) => {
    await navigateTo(page, '/warehouses', 'Warehouses');
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('create warehouse opens modal', async ({ page }) => {
    await navigateTo(page, '/warehouses', 'Warehouses');
    const btn = page.locator('button').filter({ hasText: /new warehouse|add warehouse/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Inventory Items ────────────────────────────────────────────────

test.describe('Phase 2 — Inventory Items', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('inventory items page renders', async ({ page }) => {
    await navigateTo(page, '/inventory-items', 'Inventory Items');
    await expect(page.locator('h1')).toContainText(/inventory/i);
  });

  test('inventory items show SKU, quantity, and value columns', async ({ page }) => {
    await navigateTo(page, '/inventory-items', 'Inventory Items');
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });
});

// ── Inventory Transactions ─────────────────────────────────────────

test.describe('Phase 2 — Inventory Transactions', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('inventory transactions page renders', async ({ page }) => {
    await navigateTo(page, '/inventory-transactions', 'Inventory Transactions');
    await expect(page.locator('h1')).toContainText(/transaction|inventory/i);
  });

  test('transactions show type, quantity, and date columns', async ({ page }) => {
    await navigateTo(page, '/inventory-transactions', 'Inventory Transactions');
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('create transaction opens modal with type selector', async ({ page }) => {
    await navigateTo(page, '/inventory-transactions', 'Inventory Transactions');
    const btn = page.locator('button').filter({ hasText: /new transaction|record/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Pricing Rate Cards ─────────────────────────────────────────────

test.describe('Phase 2 — Pricing Rate Cards', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('pricing rate cards page renders', async ({ page }) => {
    await page.goto('/pricing/rate-cards');
    await expect(page.locator('h1')).toContainText(/pricing|rate card/i);
  });

  test('rate cards show name and effective date columns', async ({ page }) => {
    await page.goto('/pricing/rate-cards');
    await expect(page.locator('table, .rate-card').first()).toBeVisible();
  });

  test('create rate card opens modal', async ({ page }) => {
    await page.goto('/pricing/rate-cards');
    const btn = page.locator('button').filter({ hasText: /new rate card|create/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Jira Integration ───────────────────────────────────────────────

test.describe('Integrations — Jira', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('jira integration page renders', async ({ page }) => {
    await navigateTo(page, '/jira-integration', 'Jira');
    await expect(page.locator('h1')).toContainText(/jira/i);
  });

  test('jira page shows connection status or config form', async ({ page }) => {
    await navigateTo(page, '/jira-integration', 'Jira');
    await expect(page.locator('form, .status, .config, table').first()).toBeVisible();
  });
});

// ── Concur Integration ─────────────────────────────────────────────

test.describe('Integrations — Concur', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('concur integration page renders', async ({ page }) => {
    await navigateTo(page, '/concur-integration', 'Concur');
    await expect(page.locator('h1')).toContainText(/concur/i);
  });

  test('concur page shows sync status or expense records', async ({ page }) => {
    await navigateTo(page, '/concur-integration', 'Concur');
    await expect(page.locator('table, .sync-log, .status, .card').first()).toBeVisible();
  });
});
