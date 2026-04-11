/**
 * seed-atkinsps.ts
 * Demo tenant for atkinsps — rich fake data for Playwright tests and demos.
 * Idempotent: skips if 'atkinsps' tenant already exists.
 *
 * Usage:
 *   npx tsx db/seeds/seed-atkinsps.ts
 */

import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set');
  process.exit(1);
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import bcrypt from 'bcrypt';
import * as schema from '../../src/db/schema/index.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function seed() {
  // ── Idempotency guard ──────────────────────────────────────────────
  const existing = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'atkinsps')).limit(1);
  if (existing.length > 0) {
    console.log('atkinsps tenant already exists — skipping.');
    await pool.end();
    return;
  }

  console.log('Seeding atkinsps demo tenant...\n');

  // ── Tenant ─────────────────────────────────────────────────────────
  const [tenant] = await db.insert(schema.tenants).values({
    name: 'Atkins Professional Services',
    slug: 'atkinsps',
    settings: {
      currency: 'USD',
      fiscalYearStart: 1,
      timezone: 'America/Chicago',
      industry: 'Professional Services',
    },
    isActive: true,
  }).returning();
  const tenantId = tenant!.id;
  console.log(`  Tenant: ${tenantId}`);

  // ── Roles ──────────────────────────────────────────────────────────
  const [adminRole] = await db.insert(schema.roles).values({
    tenantId,
    name: 'System Admin',
    description: 'Full access',
    permissions: ['core.*','master.*','gl.*','crm.*','q2c.*','p2p.*','ap.*','integration.*','audit.*','workflow.*','reporting.*','admin.*'],
    isSystemRole: true,
  }).returning();

  // ── Users ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('demo2026', 10);
  const [demoUser] = await db.insert(schema.users).values({
    tenantId,
    email: 'demo@atkinsps.com',
    passwordHash,
    firstName: 'Demo',
    lastName: 'Admin',
    roleIds: [adminRole!.id],
    isActive: true,
  }).returning();

  await db.insert(schema.users).values({
    tenantId,
    email: 'finance@atkinsps.com',
    passwordHash: await bcrypt.hash('finance2026', 10),
    firstName: 'Finance',
    lastName: 'User',
    roleIds: [adminRole!.id],
    isActive: true,
  });
  console.log(`  Users: demo@atkinsps.com / demo2026`);

  // ── Legal Entity ───────────────────────────────────────────────────
  const [entity] = await db.insert(schema.legalEntities).values({
    tenantId,
    name: 'Atkins PS LLC',
    code: 'APS',
    currency: 'USD',
    address: { street: '100 Main St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
    taxId: '87-1234567',
    isActive: true,
  }).returning();

  // ── Departments ────────────────────────────────────────────────────
  const [engDept] = await db.insert(schema.departments).values({ tenantId, entityId: entity!.id, name: 'Engineering', code: 'ENG', isActive: true }).returning();
  const [finDept] = await db.insert(schema.departments).values({ tenantId, entityId: entity!.id, name: 'Finance', code: 'FIN', isActive: true }).returning();
  await db.insert(schema.departments).values({ tenantId, entityId: entity!.id, name: 'Sales', code: 'SAL', isActive: true });
  await db.insert(schema.departments).values({ tenantId, entityId: entity!.id, name: 'Operations', code: 'OPS', isActive: true });

  // ── Payment Terms ──────────────────────────────────────────────────
  const [net30] = await db.insert(schema.paymentTerms).values({ tenantId, name: 'Net 30', daysDue: 30, discountDays: 0, discountPercent: 0, isActive: true }).returning();
  await db.insert(schema.paymentTerms).values({ tenantId, name: 'Net 60', daysDue: 60, discountDays: 0, discountPercent: 0, isActive: true });
  await db.insert(schema.paymentTerms).values({ tenantId, name: 'Net 15', daysDue: 15, discountDays: 0, discountPercent: 0, isActive: true });

  // ── GL Accounts ────────────────────────────────────────────────────
  const glAccounts = [
    // Assets
    { accountNumber: '1000', name: 'Cash - Operating', accountType: 'asset', normalBalance: 'debit' },
    { accountNumber: '1100', name: 'Accounts Receivable', accountType: 'asset', normalBalance: 'debit' },
    { accountNumber: '1200', name: 'Prepaid Expenses', accountType: 'asset', normalBalance: 'debit' },
    { accountNumber: '1500', name: 'Fixed Assets', accountType: 'asset', normalBalance: 'debit' },
    { accountNumber: '1510', name: 'Accumulated Depreciation', accountType: 'asset', normalBalance: 'credit' },
    // Liabilities
    { accountNumber: '2000', name: 'Accounts Payable', accountType: 'liability', normalBalance: 'credit' },
    { accountNumber: '2100', name: 'Accrued Liabilities', accountType: 'liability', normalBalance: 'credit' },
    { accountNumber: '2200', name: 'Deferred Revenue', accountType: 'liability', normalBalance: 'credit' },
    { accountNumber: '2300', name: 'Lease Liability', accountType: 'liability', normalBalance: 'credit' },
    // Equity
    { accountNumber: '3000', name: "Owner's Equity", accountType: 'equity', normalBalance: 'credit' },
    { accountNumber: '3100', name: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit' },
    // Revenue
    { accountNumber: '4000', name: 'Service Revenue', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '4100', name: 'Consulting Revenue', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '4200', name: 'SaaS Revenue', accountType: 'revenue', normalBalance: 'credit' },
    // Expenses
    { accountNumber: '5000', name: 'Salaries & Wages', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '5100', name: 'Software Subscriptions', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '5200', name: 'Travel & Entertainment', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '5300', name: 'Rent Expense', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '5400', name: 'Depreciation Expense', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '5500', name: 'Cost of Services', accountType: 'expense', normalBalance: 'debit' },
  ];
  const insertedAccounts: Record<string, string> = {};
  for (const acct of glAccounts) {
    const [inserted] = await db.insert(schema.accounts).values({
      tenantId,
      ...acct,
      accountSubtype: null,
      isPostingAccount: true,
      isActive: true,
    } as typeof schema.accounts.$inferInsert).returning();
    insertedAccounts[acct.accountNumber] = inserted!.id;
  }
  console.log(`  GL Accounts: ${glAccounts.length}`);

  // ── Accounting Periods ─────────────────────────────────────────────
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const periods: typeof schema.accountingPeriods.$inferInsert[] = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(2026, i, 1);
    const end = new Date(2026, i + 1, 0, 23, 59, 59);
    periods.push({
      tenantId,
      entityId: entity!.id,
      periodName: `${months[i]} 2026`,
      startDate: start,
      endDate: end,
      fiscalYear: 2026,
      periodNumber: i + 1,
      status: i < 3 ? 'closed' : i === 3 ? 'open' : 'open',
    });
  }
  const insertedPeriods = await db.insert(schema.accountingPeriods).values(periods).returning();
  const openPeriod = insertedPeriods.find(p => p.status === 'open')!;
  console.log(`  Periods: 12 (FY2026)`);

  // ── Customers ──────────────────────────────────────────────────────
  const customerData = [
    { name: 'Acme Corp', customerNumber: 'CUST-001', status: 'active', creditLimit: 5000000 },
    { name: 'Globex Industries', customerNumber: 'CUST-002', status: 'active', creditLimit: 2500000 },
    { name: 'Initech LLC', customerNumber: 'CUST-003', status: 'active', creditLimit: 1000000 },
    { name: 'Umbrella Corp', customerNumber: 'CUST-004', status: 'active', creditLimit: 10000000 },
    { name: 'Stark Industries', customerNumber: 'CUST-005', status: 'active', creditLimit: 20000000 },
    { name: 'Wayne Enterprises', customerNumber: 'CUST-006', status: 'active', creditLimit: 15000000 },
    { name: 'Pied Piper Inc', customerNumber: 'CUST-007', status: 'prospect', creditLimit: 500000 },
    { name: 'Hooli Corp', customerNumber: 'CUST-008', status: 'inactive', creditLimit: 3000000 },
  ];
  const insertedCustomers: typeof schema.customers.$inferSelect[] = [];
  for (const c of customerData) {
    const [cust] = await db.insert(schema.customers).values({
      tenantId,
      entityId: entity!.id,
      paymentTermsId: net30!.id,
      currency: 'USD',
      ...c,
      billingAddress: { street: '1 Business Ave', city: 'Austin', state: 'TX', zip: '78701' },
      isActive: true,
    } as typeof schema.customers.$inferInsert).returning();
    insertedCustomers.push(cust!);
  }
  console.log(`  Customers: ${customerData.length}`);

  // ── Vendors ────────────────────────────────────────────────────────
  const vendorData = [
    { name: 'AWS Inc', vendorNumber: 'VEND-001', defaultExpenseAccountId: insertedAccounts['5100'] },
    { name: 'Microsoft Azure', vendorNumber: 'VEND-002', defaultExpenseAccountId: insertedAccounts['5100'] },
    { name: 'Office Depot', vendorNumber: 'VEND-003', defaultExpenseAccountId: insertedAccounts['5200'] },
    { name: 'CBRE Real Estate', vendorNumber: 'VEND-004', defaultExpenseAccountId: insertedAccounts['5300'] },
    { name: 'Delta Airlines', vendorNumber: 'VEND-005', defaultExpenseAccountId: insertedAccounts['5200'] },
    { name: 'Salesforce', vendorNumber: 'VEND-006', defaultExpenseAccountId: insertedAccounts['5100'] },
  ];
  const insertedVendors: typeof schema.vendors.$inferSelect[] = [];
  for (const v of vendorData) {
    const [vend] = await db.insert(schema.vendors).values({
      tenantId,
      entityId: entity!.id,
      paymentTermsId: net30!.id,
      currency: 'USD',
      status: 'active',
      taxId: '12-3456789',
      remitToAddress: { street: '100 Vendor Way', city: 'Seattle', state: 'WA', zip: '98101' },
      isActive: true,
      ...v,
    } as typeof schema.vendors.$inferInsert).returning();
    insertedVendors.push(vend!);
  }
  console.log(`  Vendors: ${vendorData.length}`);

  // ── Leads ──────────────────────────────────────────────────────────
  const leadData = [
    { firstName: 'Alice', lastName: 'Johnson', email: 'alice@futureacme.com', company: 'Future Acme', status: 'new', estimatedValue: 150000 },
    { firstName: 'Bob', lastName: 'Smith', email: 'bsmith@techcorp.com', company: 'Tech Corp', status: 'contacted', estimatedValue: 75000 },
    { firstName: 'Carol', lastName: 'Williams', email: 'carol@bigbiz.com', company: 'Big Biz', status: 'qualified', estimatedValue: 320000 },
    { firstName: 'Dave', lastName: 'Brown', email: 'dave@startup.io', company: 'Startup IO', status: 'new', estimatedValue: 50000 },
    { firstName: 'Eve', lastName: 'Davis', email: 'eve@enterprise.net', company: 'Enterprise Net', status: 'converted', estimatedValue: 500000 },
  ];
  for (const l of leadData) {
    await db.insert(schema.leads).values({
      tenantId,
      ...l,
      source: 'website',
      isActive: true,
    } as typeof schema.leads.$inferInsert);
  }
  console.log(`  Leads: ${leadData.length}`);

  // ── Opportunities ──────────────────────────────────────────────────
  const oppData = [
    { name: 'Acme Platform Integration', customerId: insertedCustomers[0]!.id, stage: 'proposal', amount: 280000, probability: 60, expectedCloseDate: new Date('2026-06-30') },
    { name: 'Globex ERP Rollout', customerId: insertedCustomers[1]!.id, stage: 'discovery', amount: 150000, probability: 30, expectedCloseDate: new Date('2026-08-15') },
    { name: 'Initech Data Migration', customerId: insertedCustomers[2]!.id, stage: 'negotiation', amount: 95000, probability: 80, expectedCloseDate: new Date('2026-05-30') },
    { name: 'Umbrella Compliance Suite', customerId: insertedCustomers[3]!.id, stage: 'closed_won', amount: 500000, probability: 100, expectedCloseDate: new Date('2026-04-01') },
    { name: 'Stark DevOps Consulting', customerId: insertedCustomers[4]!.id, stage: 'proposal', amount: 200000, probability: 55, expectedCloseDate: new Date('2026-07-01') },
  ];
  for (const o of oppData) {
    await db.insert(schema.opportunities).values({
      tenantId,
      ...o,
      ownerId: demoUser!.id,
      isActive: true,
    } as typeof schema.opportunities.$inferInsert);
  }
  console.log(`  Opportunities: ${oppData.length}`);

  // ── Items ──────────────────────────────────────────────────────────
  const [svcItem] = await db.insert(schema.items).values({
    tenantId,
    itemNumber: 'SVC-001',
    name: 'Professional Services',
    description: 'Hourly consulting',
    itemType: 'service',
    unitOfMeasure: 'hour',
    listPrice: 25000, // $250.00/hr in cents
    standardCost: 15000,
    revenueAccountId: insertedAccounts['4100'],
    isActive: true,
  } as typeof schema.items.$inferInsert).returning();

  await db.insert(schema.items).values({
    tenantId,
    itemNumber: 'SVC-002',
    name: 'SaaS License',
    description: 'Monthly SaaS subscription',
    itemType: 'service',
    unitOfMeasure: 'month',
    listPrice: 500000,
    revenueAccountId: insertedAccounts['4200'],
    isActive: true,
  } as typeof schema.items.$inferInsert);
  console.log('  Items: 2');

  // ── Journal Entries ────────────────────────────────────────────────
  const [je1] = await db.insert(schema.journalEntries).values({
    tenantId,
    entityId: entity!.id,
    journalNumber: 'JE-2026-001',
    journalType: 'manual',
    periodId: openPeriod.id,
    postingDate: new Date('2026-04-05'),
    description: 'April accrued revenue',
    status: 'posted',
    createdBy: demoUser!.id,
    postedBy: demoUser!.id,
    postedAt: new Date('2026-04-05'),
  }).returning();

  await db.insert(schema.journalEntryLines).values([
    {
      journalEntryId: je1!.id,
      lineNumber: 1,
      accountId: insertedAccounts['1100']!,
      debitAmount: 1500000,
      creditAmount: 0,
      description: 'AR - Acme Corp',
      departmentId: engDept!.id,
    },
    {
      journalEntryId: je1!.id,
      lineNumber: 2,
      accountId: insertedAccounts['4000']!,
      debitAmount: 0,
      creditAmount: 1500000,
      description: 'Service revenue - April',
      departmentId: engDept!.id,
    },
  ]);

  await db.insert(schema.journalEntries).values({
    tenantId,
    entityId: entity!.id,
    journalNumber: 'JE-2026-002',
    journalType: 'manual',
    periodId: openPeriod.id,
    postingDate: new Date('2026-04-10'),
    description: 'Cloud infrastructure - April',
    status: 'draft',
    createdBy: demoUser!.id,
  });
  console.log('  Journal Entries: 2 (1 posted, 1 draft)');

  // ── Leases ─────────────────────────────────────────────────────────
  if (schema.leaseContracts) {
    await db.insert(schema.leaseContracts).values({
      tenantId,
      leaseNumber: 'LEASE-001',
      lessorName: 'Austin Office REIT',
      assetDescription: '3rd Floor Office Space, 100 Main St Austin TX',
      leaseType: 'operating',
      commencementDate: new Date('2025-01-01'),
      leaseTermMonths: 36,
      leaseEndDate: new Date('2027-12-31'),
      paymentAmount: 850000, // $8,500/mo in cents
      paymentFrequency: 'monthly',
      discountRate: 0.055,
      rouAssetAmount: 27230000,
      leaseLiabilityAmount: 27230000,
      status: 'active',
      isActive: true,
    } as typeof schema.leaseContracts.$inferInsert);

    await db.insert(schema.leaseContracts).values({
      tenantId,
      leaseNumber: 'LEASE-002',
      lessorName: 'Enterprise Vehicle Leasing',
      assetDescription: '2024 Ford F-150 — Fleet Vehicle',
      leaseType: 'finance',
      commencementDate: new Date('2026-01-01'),
      leaseTermMonths: 48,
      leaseEndDate: new Date('2029-12-31'),
      paymentAmount: 75000,
      paymentFrequency: 'monthly',
      discountRate: 0.065,
      rouAssetAmount: 3200000,
      leaseLiabilityAmount: 3200000,
      status: 'active',
      isActive: true,
    } as typeof schema.leaseContracts.$inferInsert);
    console.log('  Lease Contracts: 2');
  }

  // ── Fixed Assets ───────────────────────────────────────────────────
  if (schema.fixedAssets) {
    await db.insert(schema.fixedAssets).values({
      tenantId,
      assetNumber: 'FA-001',
      name: 'Development Server Array',
      description: 'On-prem development compute cluster',
      assetClass: 'equipment',
      acquisitionDate: new Date('2025-03-15'),
      acquisitionCost: 4500000,
      salvageValue: 450000,
      usefulLifeMonths: 60,
      depreciationMethod: 'straight_line',
      status: 'active',
      departmentId: engDept!.id,
      isActive: true,
    } as typeof schema.fixedAssets.$inferInsert);

    await db.insert(schema.fixedAssets).values({
      tenantId,
      assetNumber: 'FA-002',
      name: 'Office Furniture - Austin HQ',
      description: 'Desks, chairs, conference tables',
      assetClass: 'furniture',
      acquisitionDate: new Date('2025-01-01'),
      acquisitionCost: 1200000,
      salvageValue: 100000,
      usefulLifeMonths: 84,
      depreciationMethod: 'straight_line',
      status: 'active',
      departmentId: finDept!.id,
      isActive: true,
    } as typeof schema.fixedAssets.$inferInsert);
    console.log('  Fixed Assets: 2');
  }

  console.log('\n✅ atkinsps demo seed complete.');
  console.log('   Login: demo@atkinsps.com / demo2026');
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
