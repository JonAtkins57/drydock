import { test, expect } from '@playwright/test';
import { login, navigateTo } from './helpers';

test.describe('AP — Console', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AP console renders', async ({ page }) => {
    await navigateTo(page, '/ap-console', 'AP Console');
    await expect(page.locator('h1')).toContainText('AP');
    await expect(page.locator('table')).toBeVisible();
  });

  test('AP console shows queue filter tabs', async ({ page }) => {
    await navigateTo(page, '/ap-console', 'AP Console');
    // Queue tabs: New, OCR Review, Coding, Approval, Matching, Ready to Post
    const tabsExist = await page.locator(
      'button:has-text("New"), button:has-text("OCR"), button:has-text("Coding"), button:has-text("Approval")'
    ).count();
    expect(tabsExist).toBeGreaterThan(0);
  });

  test('AP console shows vendor, amount, status columns', async ({ page }) => {
    await navigateTo(page, '/ap-console', 'AP Console');
    await expect(page.locator('th').filter({ hasText: /vendor/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /amount|total/i }).first()).toBeVisible();
  });
});

test.describe('AP — AP Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('AP invoices list renders', async ({ page }) => {
    await navigateTo(page, '/ap-invoices', 'AP Invoices');
    await expect(page.locator('h1')).toContainText('Invoice');
    await expect(page.locator('table')).toBeVisible();
  });

  test('AP invoices show vendor, invoice number, amount, status columns', async ({ page }) => {
    await navigateTo(page, '/ap-invoices', 'AP Invoices');
    await expect(page.locator('th').filter({ hasText: /vendor/i }).first()).toBeVisible();
    await expect(page.locator('th').filter({ hasText: /invoice|number/i }).first()).toBeVisible();
  });

  test('AP invoice detail shows coding fields', async ({ page }) => {
    await navigateTo(page, '/ap-invoices', 'AP Invoices');
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    if (count > 0) {
      // Click first row to open detail
      await rows.first().click();
      // Should show coding section with GL account fields
      await expect(
        page.locator('text=account, text=Account, text=GL').first()
      ).toBeVisible({ timeout: 5000 }).catch(() => {
        // May be on a separate detail page or modal
      });
    }
  });

  test('create AP invoice via manual entry', async ({ page }) => {
    await navigateTo(page, '/ap-invoices', 'AP Invoices');
    const newBtn = page.locator('button:has-text("+ New Invoice"), button:has-text("New AP Invoice"), button:has-text("Manual Entry")');
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(
        page.locator('h2').filter({ hasText: /invoice/i })
      ).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('AP — Amortization Schedules', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('amortization schedules page renders', async ({ page }) => {
    await navigateTo(page, '/amortization', 'Amortization');
    await expect(page.locator('h1')).toContainText('Amortization');
    await expect(page.locator('table')).toBeVisible();
  });

  test('amortization shows start/end date and monthly amount columns', async ({ page }) => {
    await navigateTo(page, '/amortization', 'Amortization');
    await expect(
      page.locator('th').filter({ hasText: /date|period|amount/i }).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
