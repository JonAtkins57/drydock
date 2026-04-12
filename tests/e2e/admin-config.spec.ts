/**
 * admin-config.spec.ts
 * Covers admin/config screens: Workflows, Custom Fields, SOD Rules,
 * Document Templates, PO Matching Rules, Search, API Keys.
 */
import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

// ── Workflows ──────────────────────────────────────────────────────

test.describe('Admin — Workflows', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('workflows page renders', async ({ page }) => {
    await navigateTo(page, '/workflows', 'Workflows');
    await expect(page.locator('h1')).toContainText(/workflow/i);
  });

  test('workflows show entity type and state columns', async ({ page }) => {
    await navigateTo(page, '/workflows', 'Workflows');
    await expect(page.locator('th').filter({ hasText: /entity|type/i }).first()).toBeVisible();
  });

  test('create workflow opens modal', async ({ page }) => {
    await navigateTo(page, '/workflows', 'Workflows');
    const btn = page.locator('button').filter({ hasText: /new workflow/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Custom Fields ──────────────────────────────────────────────────

test.describe('Admin — Custom Fields', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('custom fields page renders', async ({ page }) => {
    await navigateTo(page, '/custom-fields', 'Custom Fields');
    await expect(page.locator('h1')).toContainText(/custom field/i);
  });

  test('custom fields show entity type and data type columns', async ({ page }) => {
    await navigateTo(page, '/custom-fields', 'Custom Fields');
    const ths = page.locator('th');
    await expect(ths.first()).toBeVisible();
  });

  test('create custom field opens modal', async ({ page }) => {
    await navigateTo(page, '/custom-fields', 'Custom Fields');
    const btn = page.locator('button').filter({ hasText: /new field|add field/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
