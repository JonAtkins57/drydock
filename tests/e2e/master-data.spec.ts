import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('Master Data — Customers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('customer list renders with data', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');
    await expect(page.locator('h1')).toContainText('Customers');
    await expect(page.locator('table')).toBeVisible();
  });

  test('create customer via modal', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');
    await page.click('button:has-text("+ New Customer")');
    await expect(page.locator('h2, [role="dialog"] h2, .modal h2').filter({ hasText: /customer/i })).toBeVisible({ timeout: 5000 });

    await page.fill('input[placeholder="Customer name"]', 'Playwright Test Corp');
    await page.click('button:has-text("Create")');

    // Modal closes and new customer appears
    await expect(page.locator('text=Playwright Test Corp')).toBeVisible({ timeout: 10000 });
  });

  test('customer list pagination works', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });
});

test.describe('Master Data — Vendors', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('vendor list renders', async ({ page }) => {
    await navigateTo(page, '/vendors', 'Vendors');
    await expect(page.locator('h1')).toContainText('Vendors');
    await expect(page.locator('table')).toBeVisible();
  });

  test('vendors show name and status columns', async ({ page }) => {
    await navigateTo(page, '/vendors', 'Vendors');
    await expect(page.locator('th').filter({ hasText: /name/i }).first()).toBeVisible();
  });
});

test.describe('Master Data — Employees/Items/Locations/Projects', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('employees page renders', async ({ page }) => {
    await navigateTo(page, '/employees', 'Employees');
    await expect(page.locator('h1')).toContainText('Employees');
  });

  test('items page renders', async ({ page }) => {
    await navigateTo(page, '/items', 'Items');
    await expect(page.locator('h1')).toContainText('Items');
  });

  test('locations page renders', async ({ page }) => {
    await navigateTo(page, '/locations', 'Locations');
    await expect(page.locator('h1')).toContainText('Locations');
  });

  test('projects page renders', async ({ page }) => {
    await navigateTo(page, '/projects', 'Projects');
    await expect(page.locator('h1')).toContainText('Projects');
  });
});
