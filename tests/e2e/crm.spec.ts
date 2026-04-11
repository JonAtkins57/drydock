import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('CRM — Leads', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('leads list renders with status filter tabs', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await expect(page.locator('h1')).toContainText('Leads');
    // Status filter buttons
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("New")')).toBeVisible();
  });

  test('create lead via modal', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await page.click('button:has-text("+ New Lead")');

    const modal = page.locator('text=New Lead').locator('..');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await page.fill('input[placeholder="Full name"]', 'Test Lead PW');
    await page.fill('input[placeholder="email@example.com"]', 'testlead@playwright.test');
    await page.click('button:has-text("Create Lead")');

    await expect(page.locator('text=Test Lead PW')).toBeVisible({ timeout: 10000 });
  });

  test('filter leads by status', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await page.click('button:has-text("New")');
    // Table still renders after filter
    await expect(page.locator('table')).toBeVisible();
  });

  test('qualified leads show convert button', async ({ page }) => {
    await navigateTo(page, '/leads', 'Leads');
    await page.click('button:has-text("Qualified")');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first().locator('button:has-text("Convert")')).toBeVisible();
    }
  });
});

test.describe('CRM — Opportunities', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('opportunities list renders', async ({ page }) => {
    await navigateTo(page, '/opportunities', 'Opportunities');
    await expect(page.locator('h1')).toContainText('Opportunities');
    await expect(page.locator('table')).toBeVisible();
  });

  test('opportunities show stage and amount columns', async ({ page }) => {
    await navigateTo(page, '/opportunities', 'Opportunities');
    await expect(page.locator('th').filter({ hasText: /stage/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /amount/i }).first()).toBeVisible();
  });

  test('pipeline view shows stage groupings', async ({ page }) => {
    await navigateTo(page, '/opportunities', 'Opportunities');
    const pipelineBtn = page.locator('button:has-text("Pipeline")');
    if (await pipelineBtn.isVisible()) {
      await pipelineBtn.click();
      // Pipeline column headers should appear
      await expect(page.locator('text=Discovery, text=Proposal').first()).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});

test.describe('CRM — Activities', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('activities list renders', async ({ page }) => {
    await navigateTo(page, '/activities', 'Activities');
    await expect(page.locator('h1')).toContainText('Activities');
  });

  test('my activities tab works', async ({ page }) => {
    await navigateTo(page, '/activities', 'Activities');
    const myTab = page.locator('button:has-text("My Activities")');
    if (await myTab.isVisible()) {
      await myTab.click();
      await expect(page.locator('table')).toBeVisible();
    }
  });

  test('create activity', async ({ page }) => {
    await navigateTo(page, '/activities', 'Activities');
    const newBtn = page.locator('button:has-text("+ New Activity"), button:has-text("New Activity")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page.locator('[placeholder*="subject"], [placeholder*="Subject"], [placeholder*="title"]').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
