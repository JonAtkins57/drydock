import { Page } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'jon@atkinsps.com');
  await page.fill('input[type="password"]', 'drydock2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

/**
 * Navigate to an authenticated page. Uses client-side routing via sidebar
 * to avoid the race condition where page.goto() causes a full reload and
 * the component's useEffect redirects to /login before init() resolves.
 */
export async function navigateTo(page: Page, path: string, linkText: string) {
  await page.click(`aside button:has-text("${linkText}")`);
  await page.waitForURL(path);
}
