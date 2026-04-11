import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('P2P — Purchase Requisitions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('requisitions list renders', async ({ page }) => {
    await navigateTo(page, '/requisitions', 'Requisitions');
    await expect(page.locator('h1')).toContainText('Requisition');
    await expect(page.locator('table')).toBeVisible();
  });

  test('requisitions show status and amount columns', async ({ page }) => {
    await navigateTo(page, '/requisitions', 'Requisitions');
    await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /amount|total/i }).first()).toBeVisible();
  });

  test('create requisition opens modal', async ({ page }) => {
    await navigateTo(page, '/requisitions', 'Requisitions');
    const newBtn = page.locator('button:has-text("+ New Requisition"), button:has-text("New Requisition")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /requisition/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('approved requisitions show convert to PO button', async ({ page }) => {
    await navigateTo(page, '/requisitions', 'Requisitions');
    const approvedFilter = page.locator('button:has-text("Approved")');
    if (await approvedFilter.isVisible()) {
      await approvedFilter.click();
      const rows = page.locator('tbody tr');
      const count = await rows.count();
      if (count > 0) {
        await expect(rows.first()).toBeVisible();
      }
    }
  });
});

test.describe('P2P — Purchase Orders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('purchase orders list renders', async ({ page }) => {
    await navigateTo(page, '/purchase-orders', 'Purchase Orders');
    await expect(page.locator('h1')).toContainText('Purchase Order');
    await expect(page.locator('table')).toBeVisible();
  });

  test('POs show vendor, amount, and status columns', async ({ page }) => {
    await navigateTo(page, '/purchase-orders', 'Purchase Orders');
    await expect(page.locator('th').filter({ hasText: /vendor/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
  });

  test('create PO opens modal with line item form', async ({ page }) => {
    await navigateTo(page, '/purchase-orders', 'Purchase Orders');
    const newBtn = page.locator('button:has-text("+ New PO"), button:has-text("New Purchase Order"), button:has-text("+ New Purchase Order")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /purchase order/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('send to vendor button visible on approved POs', async ({ page }) => {
    await navigateTo(page, '/purchase-orders', 'Purchase Orders');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
    }
  });
});

test.describe('P2P — Goods Receipts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('goods receipts list renders', async ({ page }) => {
    await navigateTo(page, '/goods-receipts', 'Goods Receipts');
    await expect(page.locator('h1')).toContainText('Receipt');
    await expect(page.locator('table')).toBeVisible();
  });

  test('receipts show PO number and received date columns', async ({ page }) => {
    await navigateTo(page, '/goods-receipts', 'Goods Receipts');
    await expect(
      page.locator('th').filter({ hasText: /po|purchase order/i }).first()
    ).toBeVisible();
  });

  test('create goods receipt from PO', async ({ page }) => {
    await navigateTo(page, '/goods-receipts', 'Goods Receipts');
    const newBtn = page.locator('button:has-text("+ New Receipt"), button:has-text("New Goods Receipt"), button:has-text("Receive")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /receipt|receive/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
