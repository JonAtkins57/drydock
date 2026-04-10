import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('Page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar has all sections (CRM, Master Data, Finance)', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();

    const sections = ['CRM', 'Master Data', 'Finance'];
    for (const section of sections) {
      await expect(sidebar.locator(`button:has-text("${section}")`)).toBeVisible();
    }
  });

  test('navigate to /customers shows customer table with data', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');

    // Page heading
    await expect(page.locator('h1')).toHaveText('Customers');

    // Wait for table to render with data (or "No customers found")
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Table headers
    await expect(table.locator('th:has-text("Number")')).toBeVisible();
    await expect(table.locator('th:has-text("Name")')).toBeVisible();
  });

  test('navigate to /vendors shows vendor table', async ({ page }) => {
    await navigateTo(page, '/vendors', 'Vendors');
    await expect(page.locator('h1')).toHaveText('Vendors');

    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('th:has-text("Number")')).toBeVisible();
    await expect(table.locator('th:has-text("Name")')).toBeVisible();
  });

  test('navigate to /accounts shows GL accounts table', async ({ page }) => {
    await navigateTo(page, '/accounts', 'GL Accounts');
    await expect(page.locator('h1')).toHaveText('Chart of Accounts');

    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('th:has-text("Number")')).toBeVisible();
    await expect(table.locator('th:has-text("Name")')).toBeVisible();
  });

  test('navigate to /periods shows period cards', async ({ page }) => {
    await navigateTo(page, '/periods', 'Periods');
    await expect(page.locator('h1')).toHaveText('Accounting Periods');

    // Wait for period data to load — grid of period cards
    await page.waitForSelector('main', { state: 'visible' });
  });

  test('navigate to /leads shows leads page', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await expect(page.locator('h1')).toHaveText('Leads');

    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('th:has-text("Name")')).toBeVisible();
  });

  test('navigate to /opportunities shows opportunities page', async ({ page }) => {
    await navigateTo(page, '/opportunities', 'Opportunities');
    await expect(page.locator('h1')).toHaveText('Opportunities');

    // Wait for main content to be visible
    await page.waitForSelector('main', { state: 'visible' });
  });
});
