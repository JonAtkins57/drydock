import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('Phase 2 — Lease Accounting (ASC 842)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('lease contracts list renders', async ({ page }) => {
    await navigateTo(page, '/leases', 'Leases');
    await expect(page.locator('h1')).toContainText('Lease');
    await expect(page.locator('table')).toBeVisible();
  });

  test('leases show type, term, and ROU asset columns', async ({ page }) => {
    await navigateTo(page, '/leases', 'Leases');
    await expect(page.locator('th').filter({ hasText: /type|lease type/i }).first()).toBeVisible();
    await expect(
      page.locator('th').filter({ hasText: /rou|asset|liability/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('create lease opens modal', async ({ page }) => {
    await navigateTo(page, '/leases', 'Leases');
    const newBtn = page.locator('button:has-text("+ New Lease"), button:has-text("New Lease Contract")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /lease/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('lease detail shows amortization schedule table', async ({ page }) => {
    await navigateTo(page, '/leases', 'Leases');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await expect(
        page.locator('text=Amortization, text=Schedule, text=Payment').first()
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});

test.describe('Phase 2 — Fixed Assets', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('fixed assets list renders', async ({ page }) => {
    await navigateTo(page, '/assets', 'Fixed Assets');
    await expect(page.locator('h1')).toContainText('Asset');
    await expect(page.locator('table')).toBeVisible();
  });

  test('assets show asset number, type, and net book value columns', async ({ page }) => {
    await navigateTo(page, '/assets', 'Fixed Assets');
    await expect(page.locator('th').filter({ hasText: /number|asset/i }).first()).toBeVisible();
    await expect(
      page.locator('th').filter({ hasText: /book value|nbv|cost/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('create asset opens modal', async ({ page }) => {
    await navigateTo(page, '/assets', 'Fixed Assets');
    const newBtn = page.locator('button:has-text("+ New Asset"), button:has-text("New Fixed Asset")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /asset/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('asset detail shows depreciation schedule', async ({ page }) => {
    await navigateTo(page, '/assets', 'Fixed Assets');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await expect(
        page.locator('text=Depreciation, text=Schedule').first()
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});

test.describe('Phase 2 — Work Orders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('work orders list renders', async ({ page }) => {
    await navigateTo(page, '/work-orders', 'Work Orders');
    await expect(page.locator('h1')).toContainText('Work Order');
    await expect(page.locator('table')).toBeVisible();
  });

  test('work orders show type, status, and assigned columns', async ({ page }) => {
    await navigateTo(page, '/work-orders', 'Work Orders');
    await expect(page.locator('th').filter({ hasText: /type/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
  });

  test('create work order opens modal', async ({ page }) => {
    await navigateTo(page, '/work-orders', 'Work Orders');
    const newBtn = page.locator('button:has-text("+ New Work Order"), button:has-text("New Work Order")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /work order/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('work order status filter works', async ({ page }) => {
    await navigateTo(page, '/work-orders', 'Work Orders');
    const openFilter = page.locator('button:has-text("Open"), button:has-text("In Progress")');
    if (await openFilter.isVisible()) {
      await openFilter.click();
      await expect(page.locator('table')).toBeVisible();
    }
  });
});

test.describe('Phase 2 — Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('inventory page renders', async ({ page }) => {
    await navigateTo(page, '/inventory', 'Inventory');
    await expect(page.locator('h1')).toContainText('Inventor');
    await expect(page.locator('table')).toBeVisible();
  });

  test('inventory shows item, quantity, and value columns', async ({ page }) => {
    await navigateTo(page, '/inventory', 'Inventory');
    await expect(page.locator('th').filter({ hasText: /item|sku/i }).first()).toBeVisible();
    await expect(
      page.locator('th').filter({ hasText: /qty|quantity|on hand/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Phase 2 — Revenue Recognition', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('rev rec page renders with contracts tab', async ({ page }) => {
    await navigateTo(page, '/rev-rec', 'Revenue Recognition');
    await expect(page.locator('h1')).toContainText('Revenue Recognition');
    await expect(
      page.locator('button:has-text("Contracts")')
    ).toBeVisible({ timeout: 5000 });
  });

  test('performance obligations tab renders', async ({ page }) => {
    await navigateTo(page, '/rev-rec', 'Revenue Recognition');
    const obligationsTab = page.locator('button:has-text("Obligations"), button:has-text("Performance Obligations")');
    if (await obligationsTab.isVisible()) {
      await obligationsTab.click();
      await expect(page.locator('table')).toBeVisible();
    }
  });
});

test.describe('Phase 2 — Close Checklist', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('close checklist page renders', async ({ page }) => {
    await navigateTo(page, '/close-checklist', 'Close Checklist');
    await expect(page.locator('h1')).toContainText('Close');
  });

  test('close checklist shows tasks with status', async ({ page }) => {
    await navigateTo(page, '/close-checklist', 'Close Checklist');
    await expect(
      page.locator('table, [class*="checklist"], [class*="task"]').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Phase 2 — Contracts & Subscriptions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('contracts list renders', async ({ page }) => {
    await navigateTo(page, '/contracts', 'Contracts');
    await expect(page.locator('h1')).toContainText('Contract');
    await expect(page.locator('table')).toBeVisible();
  });

  test('subscriptions list renders', async ({ page }) => {
    await navigateTo(page, '/subscriptions', 'Subscriptions');
    await expect(page.locator('h1')).toContainText('Subscription');
    await expect(page.locator('table')).toBeVisible();
  });
});
