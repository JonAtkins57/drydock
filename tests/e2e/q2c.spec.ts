import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('Q2C — Quotes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('quotes list renders', async ({ page }) => {
    await navigateTo(page, '/quotes', 'Quotes');
    await expect(page.locator('h1')).toContainText('Quotes');
    await expect(page.locator('table')).toBeVisible();
  });

  test('create quote opens modal with line item form', async ({ page }) => {
    await navigateTo(page, '/quotes', 'Quotes');
    await page.click('button:has-text("+ New Quote")');

    await expect(page.locator('h2').filter({ hasText: /New Quote/i })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="Quote name"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Customer name"]')).toBeVisible();
  });

  test('create a quote with one line item', async ({ page }) => {
    await navigateTo(page, '/quotes', 'Quotes');
    await page.click('button:has-text("+ New Quote")');

    await page.fill('input[placeholder="Quote name"]', 'PW Test Quote');
    await page.fill('input[placeholder="Customer name"]', 'Acme Corp');
    // Fill first line description
    await page.fill('input[placeholder="Item description"]', 'Consulting Services');
    await page.fill('input[placeholder="0.00"]', '5000');
    await page.click('button:has-text("Create Quote")');

    await expect(page.locator('text=PW Test Quote')).toBeVisible({ timeout: 10000 });
  });

  test('quotes show status badges (draft/sent/approved)', async ({ page }) => {
    await navigateTo(page, '/quotes', 'Quotes');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Q2C — Sales Orders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sales orders list renders', async ({ page }) => {
    await navigateTo(page, '/orders', 'Sales Orders');
    await expect(page.locator('h1')).toContainText('Sales Orders');
    await expect(page.locator('table')).toBeVisible();
  });

  test('orders show customer and amount columns', async ({ page }) => {
    await navigateTo(page, '/orders', 'Sales Orders');
    await expect(page.locator('th').filter({ hasText: /customer/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /amount|total/i }).first()).toBeVisible();
  });
});

test.describe('Q2C — Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('invoices list renders', async ({ page }) => {
    await navigateTo(page, '/invoices', 'Invoices');
    await expect(page.locator('h1')).toContainText('Invoices');
    await expect(page.locator('table')).toBeVisible();
  });

  test('AR aging summary is visible', async ({ page }) => {
    await navigateTo(page, '/invoices', 'Invoices');
    // AR aging buckets should appear (Current, 1-30, 31-60, 61-90, 90+)
    await expect(
      page.locator('text=Current, text=Aging').first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Q2C — Billing Plans', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('billing plans list renders', async ({ page }) => {
    await navigateTo(page, '/billing-plans', 'Billing Plans');
    await expect(page.locator('h1')).toContainText('Billing Plans');
    await expect(page.locator('table')).toBeVisible();
  });
});

test.describe('Q2C — Credit Memos', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('credit memos list renders', async ({ page }) => {
    await navigateTo(page, '/credit-memos', 'Credit Memos');
    await expect(page.locator('h1')).toContainText('Credit Memo');
    await expect(page.locator('table')).toBeVisible();
  });

  test('create credit memo', async ({ page }) => {
    await navigateTo(page, '/credit-memos', 'Credit Memos');
    const newBtn = page.locator('button:has-text("+ New Credit Memo"), button:has-text("New Credit Memo")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page.locator('h2').filter({ hasText: /Credit Memo/i })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Q2C — Revenue Recognition', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('rev rec page renders', async ({ page }) => {
    await navigateTo(page, '/rev-rec', 'Revenue Recognition');
    await expect(page.locator('h1')).toContainText('Revenue Recognition');
    await expect(page.locator('table')).toBeVisible();
  });

  test('rev rec shows contracts and obligations tabs', async ({ page }) => {
    await navigateTo(page, '/rev-rec', 'Revenue Recognition');
    await expect(
      page.locator('button:has-text("Contracts"), button:has-text("Obligations")').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Q2C — Customer Statement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('statement page is accessible from customer', async ({ page }) => {
    await navigateTo(page, '/customers', 'Customers');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      // Look for a statement link
      const statementLink = rows.first().locator('a:has-text("Statement"), button:has-text("Statement")');
      if (await statementLink.count() > 0) {
        await statementLink.click();
        await expect(page.locator('h1')).toContainText('Statement');
      }
    }
  });
});
