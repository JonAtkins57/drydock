import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Auth flow', () => {
  test('login page renders with DryDock logo and sign in form', async ({ page }) => {
    await page.goto('/login');

    // Logo present
    const logo = page.locator('img[alt="DryDock"]');
    await expect(logo).toBeVisible();

    // "Sign in" heading
    await expect(page.locator('h2')).toHaveText('Sign in');

    // Email and password inputs
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Submit button
    await expect(page.locator('button[type="submit"]')).toHaveText('Sign in');
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await login(page);
    expect(page.url()).toContain('/dashboard');
  });

  test('dashboard shows user name and stat cards', async ({ page }) => {
    await login(page);

    // Welcome message with first name
    await expect(page.locator('h1')).toContainText('Welcome,');

    // Stat cards: Customers, Vendors, GL Accounts, Periods
    const statLabels = ['Customers', 'Vendors', 'GL Accounts', 'Periods'];
    for (const label of statLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }
  });

  test('logout returns to login page', async ({ page }) => {
    await login(page);

    // Click sign out
    await page.click('button:has-text("Sign out")');
    await page.waitForURL('/login');
    expect(page.url()).toContain('/login');
  });

  test('accessing /dashboard without auth redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    // The app checks user state and redirects to /login
    await page.waitForURL('/login');
    expect(page.url()).toContain('/login');
  });
});
