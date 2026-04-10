# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crud.spec.ts >> CRUD operations >> navigate between pages maintains auth state
- Location: tests/e2e/crud.spec.ts:67:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "/dashboard" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - button "DryDock DryDock Platform" [ref=e6] [cursor=pointer]:
      - img "DryDock" [ref=e7]
      - generic [ref=e8]:
        - text: DryDock
        - paragraph [ref=e9]: Platform
    - navigation [ref=e10]:
      - button "Dashboard +" [active] [ref=e12] [cursor=pointer]:
        - text: Dashboard
        - generic [ref=e13]: +
      - generic [ref=e14]:
        - button "CRM -" [ref=e15] [cursor=pointer]:
          - text: CRM
          - generic [ref=e16]: "-"
        - generic [ref=e17]:
          - button "Leads" [ref=e18] [cursor=pointer]
          - button "Opportunities" [ref=e19] [cursor=pointer]
          - button "Activities" [ref=e20] [cursor=pointer]
      - generic [ref=e21]:
        - button "Q2C -" [ref=e22] [cursor=pointer]:
          - text: Q2C
          - generic [ref=e23]: "-"
        - generic [ref=e24]:
          - button "Quotes" [ref=e25] [cursor=pointer]
          - button "Sales Orders" [ref=e26] [cursor=pointer]
          - button "Invoices" [ref=e27] [cursor=pointer]
          - button "Billing Plans" [ref=e28] [cursor=pointer]
      - generic [ref=e29]:
        - button "Master Data -" [ref=e30] [cursor=pointer]:
          - text: Master Data
          - generic [ref=e31]: "-"
        - generic [ref=e32]:
          - button "Customers" [ref=e33] [cursor=pointer]
          - button "Vendors" [ref=e34] [cursor=pointer]
          - button "Departments" [ref=e35] [cursor=pointer]
          - button "Employees" [ref=e36] [cursor=pointer]
          - button "Items" [ref=e37] [cursor=pointer]
          - button "Locations" [ref=e38] [cursor=pointer]
          - button "Projects" [ref=e39] [cursor=pointer]
      - generic [ref=e40]:
        - button "P2P -" [ref=e41] [cursor=pointer]:
          - text: P2P
          - generic [ref=e42]: "-"
        - generic [ref=e43]:
          - button "Requisitions" [ref=e44] [cursor=pointer]
          - button "Purchase Orders" [ref=e45] [cursor=pointer]
          - button "Receipts" [ref=e46] [cursor=pointer]
      - generic [ref=e47]:
        - button "AP -" [ref=e48] [cursor=pointer]:
          - text: AP
          - generic [ref=e49]: "-"
        - button "AP Console" [ref=e51] [cursor=pointer]
      - generic [ref=e52]:
        - button "Finance -" [ref=e53] [cursor=pointer]:
          - text: Finance
          - generic [ref=e54]: "-"
        - generic [ref=e55]:
          - button "GL Accounts" [ref=e56] [cursor=pointer]
          - button "Periods" [ref=e57] [cursor=pointer]
          - button "Journal Entries" [ref=e58] [cursor=pointer]
          - button "Trial Balance" [ref=e59] [cursor=pointer]
      - generic [ref=e60]:
        - button "Settings -" [ref=e61] [cursor=pointer]:
          - text: Settings
          - generic [ref=e62]: "-"
        - generic [ref=e63]:
          - button "Custom Fields" [ref=e64] [cursor=pointer]
          - button "Workflows" [ref=e65] [cursor=pointer]
    - link "API Docs →" [ref=e67] [cursor=pointer]:
      - /url: /docs
  - main [ref=e68]:
    - generic [ref=e69]:
      - generic [ref=e70]:
        - heading "Leads" [level=1] [ref=e71]
        - paragraph [ref=e72]: 5 total
      - button "+ New Lead" [ref=e73] [cursor=pointer]
    - generic [ref=e74]:
      - button "all" [ref=e75] [cursor=pointer]
      - button "new" [ref=e76] [cursor=pointer]
      - button "contacted" [ref=e77] [cursor=pointer]
      - button "qualified" [ref=e78] [cursor=pointer]
      - button "converted" [ref=e79] [cursor=pointer]
      - button "lost" [ref=e80] [cursor=pointer]
    - table [ref=e82]:
      - rowgroup [ref=e83]:
        - row "Name Email Company Source Status Created" [ref=e84]:
          - columnheader "Name" [ref=e85]
          - columnheader "Email" [ref=e86]
          - columnheader "Company" [ref=e87]
          - columnheader "Source" [ref=e88]
          - columnheader "Status" [ref=e89]
          - columnheader "Created" [ref=e90]
          - columnheader [ref=e91]
      - rowgroup [ref=e92]:
        - row "E2E Test Lead 1775852105139 e2e-1775852105139@test.com -- website new 4/10/2026" [ref=e93]:
          - cell "E2E Test Lead 1775852105139" [ref=e94]
          - cell "e2e-1775852105139@test.com" [ref=e95]
          - cell "--" [ref=e96]
          - cell "website" [ref=e97]
          - cell "new" [ref=e98]
          - cell "4/10/2026" [ref=e99]
          - cell [ref=e100]
        - row "E2E Test Lead 1775852094838 e2e-1775852094838@test.com -- website new 4/10/2026" [ref=e101]:
          - cell "E2E Test Lead 1775852094838" [ref=e102]
          - cell "e2e-1775852094838@test.com" [ref=e103]
          - cell "--" [ref=e104]
          - cell "website" [ref=e105]
          - cell "new" [ref=e106]
          - cell "4/10/2026" [ref=e107]
          - cell [ref=e108]
        - row "E2E Test Lead 1775852061655 e2e-1775852061655@test.com -- website new 4/10/2026" [ref=e109]:
          - cell "E2E Test Lead 1775852061655" [ref=e110]
          - cell "e2e-1775852061655@test.com" [ref=e111]
          - cell "--" [ref=e112]
          - cell "website" [ref=e113]
          - cell "new" [ref=e114]
          - cell "4/10/2026" [ref=e115]
          - cell [ref=e116]
        - row "E2E Test Lead 1775852048738 e2e-1775852048738@test.com -- website new 4/10/2026" [ref=e117]:
          - cell "E2E Test Lead 1775852048738" [ref=e118]
          - cell "e2e-1775852048738@test.com" [ref=e119]
          - cell "--" [ref=e120]
          - cell "website" [ref=e121]
          - cell "new" [ref=e122]
          - cell "4/10/2026" [ref=e123]
          - cell [ref=e124]
        - row "E2E Test Lead 1775851998409 e2e-1775851998409@test.com -- website new 4/10/2026" [ref=e125]:
          - cell "E2E Test Lead 1775851998409" [ref=e126]
          - cell "e2e-1775851998409@test.com" [ref=e127]
          - cell "--" [ref=e128]
          - cell "website" [ref=e129]
          - cell "new" [ref=e130]
          - cell "4/10/2026" [ref=e131]
          - cell [ref=e132]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login, navigateTo } from './helpers';
  3  | 
  4  | test.describe('CRUD operations', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await login(page);
  7  |   });
  8  | 
  9  |   test('create a new customer via modal, verify it appears in table', async ({ page }) => {
  10 |     await navigateTo(page, '/customers', 'Customers');
  11 |     await expect(page.locator('h1')).toHaveText('Customers');
  12 | 
  13 |     // Wait for initial table load
  14 |     await page.waitForSelector('table', { state: 'visible' });
  15 | 
  16 |     const uniqueName = `E2E Test Customer ${Date.now()}`;
  17 | 
  18 |     // Open create modal
  19 |     await page.click('button:has-text("+ New Customer")');
  20 | 
  21 |     // Modal should be visible
  22 |     await expect(page.locator('h2:has-text("New Customer")')).toBeVisible();
  23 | 
  24 |     // Fill out the form
  25 |     await page.fill('input[placeholder="Customer name"]', uniqueName);
  26 | 
  27 |     // Submit
  28 |     await page.click('button:has-text("Create Customer")');
  29 | 
  30 |     // Modal should close and customer should appear in table
  31 |     await expect(page.locator('h2:has-text("New Customer")')).not.toBeVisible({ timeout: 10000 });
  32 | 
  33 |     // Verify customer appears in the table
  34 |     await expect(page.locator(`td:has-text("${uniqueName}")`)).toBeVisible({ timeout: 10000 });
  35 |   });
  36 | 
  37 |   test('create a new lead, verify it appears in leads table', async ({ page }) => {
  38 |     await navigateTo(page, '/leads', 'Leads');
  39 |     await expect(page.locator('h1')).toHaveText('Leads');
  40 | 
  41 |     // Wait for initial table load
  42 |     await page.waitForSelector('table', { state: 'visible' });
  43 | 
  44 |     const uniqueName = `E2E Test Lead ${Date.now()}`;
  45 |     const uniqueEmail = `e2e-${Date.now()}@test.com`;
  46 | 
  47 |     // Open create modal
  48 |     await page.click('button:has-text("+ New Lead")');
  49 | 
  50 |     // Modal should be visible
  51 |     await expect(page.locator('h2:has-text("New Lead")')).toBeVisible();
  52 | 
  53 |     // Fill out the form
  54 |     await page.fill('input[placeholder="Full name"]', uniqueName);
  55 |     await page.fill('input[placeholder="email@example.com"]', uniqueEmail);
  56 | 
  57 |     // Submit
  58 |     await page.click('button:has-text("Create Lead")');
  59 | 
  60 |     // Modal should close
  61 |     await expect(page.locator('h2:has-text("New Lead")')).not.toBeVisible({ timeout: 10000 });
  62 | 
  63 |     // Verify lead appears in the table
  64 |     await expect(page.locator(`td:has-text("${uniqueName}")`)).toBeVisible({ timeout: 10000 });
  65 |   });
  66 | 
  67 |   test('navigate between pages maintains auth state', async ({ page }) => {
  68 |     // Start on dashboard
  69 |     await expect(page.locator('h1')).toContainText('Welcome,');
  70 | 
  71 |     // Navigate to customers via sidebar
  72 |     await navigateTo(page, '/customers', 'Customers');
  73 |     await expect(page.locator('h1')).toHaveText('Customers');
  74 | 
  75 |     // Navigate to leads via sidebar
  76 |     await navigateTo(page, '/leads', 'Leads');
  77 |     await expect(page.locator('h1')).toHaveText('Leads');
  78 | 
  79 |     // Auth persisted across navigation — still on a protected page, not /login
  80 |     expect(page.url()).not.toContain('/login');
  81 |   });
> 82 | });
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  83 | 
```