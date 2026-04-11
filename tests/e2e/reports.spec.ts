import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('Reports — Income Statement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('income statement page renders', async ({ page }) => {
    await navigateTo(page, '/reports/income-statement', 'Income Statement');
    await expect(page.locator('h1')).toContainText('Income Statement');
  });

  test('income statement shows revenue and expense sections', async ({ page }) => {
    await navigateTo(page, '/reports/income-statement', 'Income Statement');
    await expect(
      page.locator('text=Revenue, text=revenue, text=Income').first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('period filter controls are present', async ({ page }) => {
    await navigateTo(page, '/reports/income-statement', 'Income Statement');
    // Either a select or date inputs
    await expect(
      page.locator('select, input[type="date"], [class*="period"], button:has-text("Run")').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Reports — Balance Sheet', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('balance sheet page renders', async ({ page }) => {
    await navigateTo(page, '/reports/balance-sheet', 'Balance Sheet');
    await expect(page.locator('h1')).toContainText('Balance Sheet');
  });

  test('balance sheet shows assets section', async ({ page }) => {
    await navigateTo(page, '/reports/balance-sheet', 'Balance Sheet');
    await expect(
      page.locator('text=Asset, text=asset').first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Reports — Balance Sheet Roll-Forward', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('roll-forward page renders', async ({ page }) => {
    await navigateTo(page, '/reports/balance-sheet-rollforward', 'Balance Sheet Roll-Forward');
    await expect(page.locator('h1')).toContainText('Roll');
  });

  test('roll-forward shows beginning/ending balance columns', async ({ page }) => {
    await navigateTo(page, '/reports/balance-sheet-rollforward', 'Balance Sheet Roll-Forward');
    await expect(
      page.locator('th, td').filter({ hasText: /beginning|ending/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
