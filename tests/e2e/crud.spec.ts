import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('CRUD operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('create a new customer via modal, verify it appears in table', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');
    await expect(page.locator('h1')).toHaveText('Customers');

    // Wait for initial table load
    await page.waitForSelector('table', { state: 'visible' });

    const uniqueName = `E2E Test Customer ${Date.now()}`;

    // Open create modal
    await page.click('button:has-text("+ New Customer")');

    // Modal should be visible
    await expect(page.locator('h2:has-text("New Customer")')).toBeVisible();

    // Fill out the form
    await page.fill('input[placeholder="Customer name"]', uniqueName);

    // Submit
    await page.click('button:has-text("Create Customer")');

    // Modal should close and customer should appear in table
    await expect(page.locator('h2:has-text("New Customer")')).not.toBeVisible({ timeout: 10000 });

    // Verify customer appears in the table
    await expect(page.locator(`td:has-text("${uniqueName}")`)).toBeVisible({ timeout: 10000 });
  });

  test('create a new lead, verify it appears in leads table', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await expect(page.locator('h1')).toHaveText('Leads');

    // Wait for initial table load
    await page.waitForSelector('table', { state: 'visible' });

    const uniqueName = `E2E Test Lead ${Date.now()}`;
    const uniqueEmail = `e2e-${Date.now()}@test.com`;

    // Open create modal
    await page.click('button:has-text("+ New Lead")');

    // Modal should be visible
    await expect(page.locator('h2:has-text("New Lead")')).toBeVisible();

    // Fill out the form
    await page.fill('input[placeholder="Full name"]', uniqueName);
    await page.fill('input[placeholder="email@example.com"]', uniqueEmail);

    // Submit
    await page.click('button:has-text("Create Lead")');

    // Modal should close
    await expect(page.locator('h2:has-text("New Lead")')).not.toBeVisible({ timeout: 10000 });

    // Verify lead appears in the table
    await expect(page.locator(`td:has-text("${uniqueName}")`)).toBeVisible({ timeout: 10000 });
  });

  test('navigate between pages maintains auth state', async ({ page }) => {
    // Start on dashboard
    await expect(page.locator('h1')).toContainText('Welcome,');

    // Navigate to customers via sidebar
    await navigateTo(page, '/customers', 'Customers');
    await expect(page.locator('h1')).toHaveText('Customers');

    // Navigate to leads via sidebar
    await navigateTo(page, '/leads', 'Leads');
    await expect(page.locator('h1')).toHaveText('Leads');

    // Auth persisted across navigation — still on a protected page, not /login
    expect(page.url()).not.toContain('/login');
  });
});
