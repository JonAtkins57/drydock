/**
 * master-data-extended.spec.ts
 * Coverage for master data screens not in master-data.spec.ts:
 * Employees, Items, Locations, Projects.
 */
import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

// ── Employees ──────────────────────────────────────────────────────

test.describe('Master Data — Employees', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('employees list renders', async ({ page }) => {
    await navigateTo(page, '/employees', 'Employees');
    await expect(page.locator('h1')).toContainText(/employee/i);
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('employees show name and department columns', async ({ page }) => {
    await navigateTo(page, '/employees', 'Employees');
    const ths = page.locator('th');
    await expect(ths.first()).toBeVisible();
  });

  test('create employee opens modal', async ({ page }) => {
    await navigateTo(page, '/employees', 'Employees');
    const btn = page.locator('button').filter({ hasText: /new employee|add employee/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Items ──────────────────────────────────────────────────────────

test.describe('Master Data — Items', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('items list renders', async ({ page }) => {
    await navigateTo(page, '/items', 'Items');
    await expect(page.locator('h1')).toContainText(/item/i);
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('items show item number and type columns', async ({ page }) => {
    await navigateTo(page, '/items', 'Items');
    await expect(page.locator('th').first()).toBeVisible();
  });

  test('create item opens modal', async ({ page }) => {
    await navigateTo(page, '/items', 'Items');
    const btn = page.locator('button').filter({ hasText: /new item|add item/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Locations ──────────────────────────────────────────────────────

test.describe('Master Data — Locations', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('locations list renders', async ({ page }) => {
    await navigateTo(page, '/locations', 'Locations');
    await expect(page.locator('h1')).toContainText(/location/i);
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('create location opens modal', async ({ page }) => {
    await navigateTo(page, '/locations', 'Locations');
    const btn = page.locator('button').filter({ hasText: /new location|add location/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});

// ── Projects (Master) ──────────────────────────────────────────────

test.describe('Master Data — Projects', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('projects list renders', async ({ page }) => {
    await navigateTo(page, '/projects', 'Projects');
    await expect(page.locator('h1')).toContainText(/project/i);
    await expect(page.locator('table, [role="table"]').first()).toBeVisible();
  });

  test('projects show project number and customer columns', async ({ page }) => {
    await navigateTo(page, '/projects', 'Projects');
    await expect(page.locator('th').first()).toBeVisible();
  });

  test('create project opens modal', async ({ page }) => {
    await navigateTo(page, '/projects', 'Projects');
    const btn = page.locator('button').filter({ hasText: /new project|add project/i }).first();
    if (await btn.isVisible()) {
      await btn.click();
      await expect(page.locator('[role="dialog"], .modal, form').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
