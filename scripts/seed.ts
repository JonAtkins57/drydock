import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import bcrypt from 'bcrypt';
import * as schema from '../src/db/schema/index.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function seed() {
  console.log('Seeding DryDock...\n');

  // ── Tenants ────────────────────────────────────────────────────────
  console.log('Creating tenants...');

  const [tillster] = await db.insert(schema.tenants).values({
    name: 'Tillster',
    slug: 'tillster',
    settings: {
      currency: 'USD',
      fiscalYearStart: 1,
      timezone: 'America/Los_Angeles',
      industry: 'Restaurant Technology',
    },
    isActive: true,
  }).returning();

  const [atkinsps] = await db.insert(schema.tenants).values({
    name: 'Atkins Professional Services',
    slug: 'atkinsps',
    settings: {
      currency: 'USD',
      fiscalYearStart: 1,
      timezone: 'America/New_York',
      industry: 'Professional Services / Technology',
    },
    isActive: true,
  }).returning();

  console.log(`  Tillster: ${tillster!.id}`);
  console.log(`  AtkinsPS: ${atkinsps!.id}`);

  // ── Roles ──────────────────────────────────────────────────────────
  console.log('Creating roles...');

  const allPermissions = [
    'core.*', 'master.*', 'gl.*', 'crm.*', 'q2c.*', 'p2p.*', 'ap.*',
    'integration.*', 'audit.*', 'workflow.*', 'reporting.*', 'admin.*',
  ];

  const [tillsterAdminRole] = await db.insert(schema.roles).values({
    tenantId: tillster!.id,
    name: 'System Admin',
    description: 'Full access to all modules',
    permissions: allPermissions,
    isSystemRole: true,
  }).returning();

  const [atkinsAdminRole] = await db.insert(schema.roles).values({
    tenantId: atkinsps!.id,
    name: 'System Admin',
    description: 'Full access to all modules',
    permissions: allPermissions,
    isSystemRole: true,
  }).returning();

  // Standard roles for Tillster
  const [tillsterApRole] = await db.insert(schema.roles).values({
    tenantId: tillster!.id,
    name: 'AP Clerk',
    description: 'Accounts Payable processing',
    permissions: ['ap.invoice.create', 'ap.invoice.update', 'ap.invoice.view', 'ap.coding.*', 'master.vendor.view', 'gl.account.view'],
    isSystemRole: false,
  }).returning();

  const [tillsterGlRole] = await db.insert(schema.roles).values({
    tenantId: tillster!.id,
    name: 'GL Accountant',
    description: 'General Ledger and financial reporting',
    permissions: ['gl.*', 'master.*.view', 'reporting.*'],
    isSystemRole: false,
  }).returning();

  const [tillsterSalesRole] = await db.insert(schema.roles).values({
    tenantId: tillster!.id,
    name: 'Sales Rep',
    description: 'CRM and quote-to-cash',
    permissions: ['crm.*', 'q2c.quote.*', 'q2c.order.view', 'master.customer.*', 'master.contact.*', 'master.item.view'],
    isSystemRole: false,
  }).returning();

  // ── Users ──────────────────────────────────────────────────────────
  console.log('Creating users...');

  const passwordHash = await bcrypt.hash('drydock2026', 12);

  const [jonAtkinsUser] = await db.insert(schema.users).values({
    tenantId: atkinsps!.id,
    email: 'jon@atkinsps.com',
    passwordHash,
    firstName: 'Jon',
    lastName: 'Atkins',
    isActive: true,
  }).returning();

  const [jonTillsterUser] = await db.insert(schema.users).values({
    tenantId: tillster!.id,
    email: 'jon@atkinsps.com',
    passwordHash,
    firstName: 'Jon',
    lastName: 'Atkins',
    isActive: true,
  }).returning();

  const [mlakierUser] = await db.insert(schema.users).values({
    tenantId: tillster!.id,
    email: 'mlakier@tillster.com',
    passwordHash: await bcrypt.hash('tillster2026', 12),
    firstName: 'Matt',
    lastName: 'Lakier',
    isActive: true,
  }).returning();

  // Assign roles
  await db.insert(schema.userRoles).values([
    { userId: jonAtkinsUser!.id, roleId: atkinsAdminRole!.id },
    { userId: jonTillsterUser!.id, roleId: tillsterAdminRole!.id },
    { userId: mlakierUser!.id, roleId: tillsterAdminRole!.id },
  ]);

  console.log(`  jon@atkinsps.com → AtkinsPS admin + Tillster admin`);
  console.log(`  mlakier@tillster.com → Tillster admin`);

  // ── Chart of Accounts (Tillster) ───────────────────────────────────
  console.log('Creating chart of accounts (Tillster)...');

  const coaData = [
    { accountNumber: '1000', name: 'Cash', accountType: 'asset', accountSubtype: 'current', normalBalance: 'debit' },
    { accountNumber: '1100', name: 'Accounts Receivable', accountType: 'asset', accountSubtype: 'current', normalBalance: 'debit' },
    { accountNumber: '1200', name: 'Prepaid Expenses', accountType: 'asset', accountSubtype: 'current', normalBalance: 'debit' },
    { accountNumber: '1300', name: 'Other Current Assets', accountType: 'asset', accountSubtype: 'current', normalBalance: 'debit' },
    { accountNumber: '1500', name: 'Fixed Assets', accountType: 'asset', accountSubtype: 'non_current', normalBalance: 'debit' },
    { accountNumber: '1510', name: 'Accumulated Depreciation', accountType: 'asset', accountSubtype: 'contra', normalBalance: 'credit' },
    { accountNumber: '2000', name: 'Accounts Payable', accountType: 'liability', accountSubtype: 'current', normalBalance: 'credit' },
    { accountNumber: '2100', name: 'Accrued Liabilities', accountType: 'liability', accountSubtype: 'current', normalBalance: 'credit' },
    { accountNumber: '2200', name: 'Deferred Revenue', accountType: 'liability', accountSubtype: 'current', normalBalance: 'credit' },
    { accountNumber: '2500', name: 'Long-Term Debt', accountType: 'liability', accountSubtype: 'non_current', normalBalance: 'credit' },
    { accountNumber: '3000', name: 'Common Stock', accountType: 'equity', normalBalance: 'credit' },
    { accountNumber: '3100', name: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit' },
    { accountNumber: '4000', name: 'Revenue - SaaS', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '4100', name: 'Revenue - Services', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '4200', name: 'Revenue - Licensing', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '4900', name: 'Other Income', accountType: 'revenue', normalBalance: 'credit' },
    { accountNumber: '5000', name: 'Cost of Revenue', accountType: 'expense', accountSubtype: 'cogs', normalBalance: 'debit' },
    { accountNumber: '6000', name: 'Salaries & Wages', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6100', name: 'Benefits & Payroll Tax', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6200', name: 'Rent & Facilities', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6300', name: 'Software & Subscriptions', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6400', name: 'Professional Services', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6500', name: 'Travel & Entertainment', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6600', name: 'Marketing & Advertising', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6700', name: 'Insurance', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6800', name: 'Depreciation & Amortization', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '6900', name: 'Other Expenses', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '7000', name: 'Interest Expense', accountType: 'expense', normalBalance: 'debit' },
    { accountNumber: '8000', name: 'Tax Expense', accountType: 'expense', normalBalance: 'debit' },
  ];

  await db.insert(schema.accounts).values(
    coaData.map(a => ({ ...a, tenantId: tillster!.id, isPostingAccount: true, isActive: true }))
  );
  console.log(`  ${coaData.length} accounts created`);

  // ── Accounting Periods (Tillster FY2026) ───────────────────────────
  console.log('Creating accounting periods (Tillster FY2026)...');

  const periods = [];
  for (let month = 0; month < 12; month++) {
    const start = new Date(2026, month, 1);
    const end = new Date(2026, month + 1, 0, 23, 59, 59);
    periods.push({
      tenantId: tillster!.id,
      periodName: `FY2026-${String(month + 1).padStart(2, '0')}`,
      startDate: start,
      endDate: end,
      fiscalYear: 2026,
      periodNumber: month + 1,
      status: month < 4 ? 'open' : 'open', // All open for now
    });
  }

  await db.insert(schema.accountingPeriods).values(periods);
  console.log(`  12 monthly periods created (Jan-Dec 2026)`);

  // ── Legal Entity (Tillster) ────────────────────────────────────────
  console.log('Creating master data (Tillster)...');

  const [tillsterEntity] = await db.insert(schema.legalEntities).values({
    tenantId: tillster!.id,
    name: 'Tillster, Inc.',
    code: 'TILL-US',
    currency: 'USD',
    address: { line1: '6320 Canoga Ave', city: 'Woodland Hills', state: 'CA', zip: '91367', country: 'US' },
    isActive: true,
  }).returning();

  // Departments
  await db.insert(schema.departments).values([
    { tenantId: tillster!.id, entityId: tillsterEntity!.id, name: 'Engineering', code: 'ENG', isActive: true },
    { tenantId: tillster!.id, entityId: tillsterEntity!.id, name: 'Finance', code: 'FIN', isActive: true },
    { tenantId: tillster!.id, entityId: tillsterEntity!.id, name: 'Sales', code: 'SALES', isActive: true },
    { tenantId: tillster!.id, entityId: tillsterEntity!.id, name: 'Operations', code: 'OPS', isActive: true },
    { tenantId: tillster!.id, entityId: tillsterEntity!.id, name: 'Product', code: 'PROD', isActive: true },
  ]);

  // Payment Terms
  await db.insert(schema.paymentTerms).values([
    { tenantId: tillster!.id, name: 'Net 30', daysDue: 30, isActive: true },
    { tenantId: tillster!.id, name: 'Net 60', daysDue: 60, isActive: true },
    { tenantId: tillster!.id, name: 'Net 15', daysDue: 15, isActive: true },
    { tenantId: tillster!.id, name: '2/10 Net 30', daysDue: 30, discountDays: 10, discountPercent: '2.00', isActive: true },
  ]);

  // Sample Customers
  await db.insert(schema.customers).values([
    { tenantId: tillster!.id, name: 'Burger King Corp', customerNumber: 'CUS-000001', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
    { tenantId: tillster!.id, name: 'Popeyes Louisiana Kitchen', customerNumber: 'CUS-000002', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
    { tenantId: tillster!.id, name: 'KFC Guatemala', customerNumber: 'CUS-000003', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
  ]);

  // Sample Vendors
  await db.insert(schema.vendors).values([
    { tenantId: tillster!.id, name: 'Amazon Web Services', vendorNumber: 'VEN-000001', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
    { tenantId: tillster!.id, name: 'Atkins Professional Services', vendorNumber: 'VEN-000002', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
    { tenantId: tillster!.id, name: 'Google Cloud Platform', vendorNumber: 'VEN-000003', entityId: tillsterEntity!.id, status: 'active', currency: 'USD', isActive: true },
  ]);

  // ── Workflow Definitions ───────────────────────────────────────────
  console.log('Creating workflow definitions...');

  // AP Invoice Workflow
  const [apWorkflow] = await db.insert(schema.workflowDefinitions).values({
    tenantId: tillster!.id,
    entityType: 'ap_invoice',
    name: 'AP Invoice Approval',
    description: 'Standard AP invoice processing workflow',
    isActive: true,
  }).returning();

  const apStates = await db.insert(schema.workflowStates).values([
    { workflowId: apWorkflow!.id, stateKey: 'draft', displayName: 'Draft', sortOrder: 1, isInitial: true, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'ocr_pending', displayName: 'OCR Pending', sortOrder: 2, isInitial: false, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'review', displayName: 'Review Required', sortOrder: 3, isInitial: false, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'coding', displayName: 'GL Coding', sortOrder: 4, isInitial: false, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'approval', displayName: 'Pending Approval', sortOrder: 5, isInitial: false, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'approved', displayName: 'Approved', sortOrder: 6, isInitial: false, isTerminal: false },
    { workflowId: apWorkflow!.id, stateKey: 'posted', displayName: 'Posted', sortOrder: 7, isInitial: false, isTerminal: true },
    { workflowId: apWorkflow!.id, stateKey: 'rejected', displayName: 'Rejected', sortOrder: 8, isInitial: false, isTerminal: true },
  ]).returning();

  // Journal Entry Workflow
  const [jeWorkflow] = await db.insert(schema.workflowDefinitions).values({
    tenantId: tillster!.id,
    entityType: 'journal_entry',
    name: 'Journal Entry Approval',
    description: 'Standard journal entry approval and posting workflow',
    isActive: true,
  }).returning();

  await db.insert(schema.workflowStates).values([
    { workflowId: jeWorkflow!.id, stateKey: 'draft', displayName: 'Draft', sortOrder: 1, isInitial: true, isTerminal: false },
    { workflowId: jeWorkflow!.id, stateKey: 'pending_approval', displayName: 'Pending Approval', sortOrder: 2, isInitial: false, isTerminal: false },
    { workflowId: jeWorkflow!.id, stateKey: 'approved', displayName: 'Approved', sortOrder: 3, isInitial: false, isTerminal: false },
    { workflowId: jeWorkflow!.id, stateKey: 'posted', displayName: 'Posted', sortOrder: 4, isInitial: false, isTerminal: true },
    { workflowId: jeWorkflow!.id, stateKey: 'reversed', displayName: 'Reversed', sortOrder: 5, isInitial: false, isTerminal: true },
  ]);

  // PO Workflow
  const [poWorkflow] = await db.insert(schema.workflowDefinitions).values({
    tenantId: tillster!.id,
    entityType: 'purchase_order',
    name: 'Purchase Order Approval',
    description: 'PO approval routing based on amount thresholds',
    isActive: true,
  }).returning();

  await db.insert(schema.workflowStates).values([
    { workflowId: poWorkflow!.id, stateKey: 'draft', displayName: 'Draft', sortOrder: 1, isInitial: true, isTerminal: false },
    { workflowId: poWorkflow!.id, stateKey: 'pending_approval', displayName: 'Pending Approval', sortOrder: 2, isInitial: false, isTerminal: false },
    { workflowId: poWorkflow!.id, stateKey: 'approved', displayName: 'Approved', sortOrder: 3, isInitial: false, isTerminal: false },
    { workflowId: poWorkflow!.id, stateKey: 'dispatched', displayName: 'Dispatched', sortOrder: 4, isInitial: false, isTerminal: false },
    { workflowId: poWorkflow!.id, stateKey: 'received', displayName: 'Received', sortOrder: 5, isInitial: false, isTerminal: true },
    { workflowId: poWorkflow!.id, stateKey: 'cancelled', displayName: 'Cancelled', sortOrder: 6, isInitial: false, isTerminal: true },
  ]);

  // ── Numbering Sequences ────────────────────────────────────────────
  console.log('Creating numbering sequences...');

  await db.insert(schema.numberingSequences).values([
    { tenantId: tillster!.id, entityType: 'customer', prefix: 'CUS-', currentValue: 3, padWidth: 6 },
    { tenantId: tillster!.id, entityType: 'vendor', prefix: 'VEN-', currentValue: 3, padWidth: 6 },
    { tenantId: tillster!.id, entityType: 'journal_entry', prefix: 'JE-', currentValue: 0, padWidth: 6 },
    { tenantId: tillster!.id, entityType: 'invoice', prefix: 'INV-', currentValue: 0, padWidth: 6 },
    { tenantId: tillster!.id, entityType: 'purchase_order', prefix: 'PO-', currentValue: 0, padWidth: 6 },
    { tenantId: tillster!.id, entityType: 'quote', prefix: 'QUO-', currentValue: 0, padWidth: 6 },
    { tenantId: atkinsps!.id, entityType: 'customer', prefix: 'CUS-', currentValue: 0, padWidth: 6 },
    { tenantId: atkinsps!.id, entityType: 'vendor', prefix: 'VEN-', currentValue: 0, padWidth: 6 },
    { tenantId: atkinsps!.id, entityType: 'journal_entry', prefix: 'JE-', currentValue: 0, padWidth: 6 },
    { tenantId: atkinsps!.id, entityType: 'invoice', prefix: 'INV-', currentValue: 0, padWidth: 6 },
  ]);

  // ── Done ───────────────────────────────────────────────────────────
  console.log('\n✓ Seed complete!\n');
  console.log('Tenants:');
  console.log(`  Tillster (${tillster!.id}) — slug: tillster`);
  console.log(`  AtkinsPS (${atkinsps!.id}) — slug: atkinsps`);
  console.log('\nUsers:');
  console.log('  jon@atkinsps.com / drydock2026 → both tenants (admin)');
  console.log('  mlakier@tillster.com / tillster2026 → Tillster (admin)');
  console.log('\nLogin:');
  console.log('  curl -X POST https://drydock.shipyardopsai.com/api/v1/auth/login \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"email":"jon@atkinsps.com","password":"drydock2026"}\'');

  await pool.end();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
