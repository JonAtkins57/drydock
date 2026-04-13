-- Seed real Tillster projects from Signals Jira project list
-- Tenant: Tillster (38657f1e-b861-43e1-a419-37090947c802)
-- Source: Signals MySQL → jira_project_names (37 projects)
-- Run: psql $DATABASE_URL -f scripts/seed-tillster-projects.sql

DO $$
DECLARE
  tid UUID := '38657f1e-b861-43e1-a419-37090947c802';

  -- Customer ID lookups (matched from customers we just seeded)
  cust_bk_us    UUID;
  cust_popeyes  UUID;
  cust_br_us    UUID;
  cust_jfc      UUID;
  cust_bk_kw    UUID;
  cust_bk_nc    UUID;
  cust_bp       UUID;
  cust_bk_ca    UUID;
  cust_applegr  UUID;
  cust_eatnpark UUID;

BEGIN
  SELECT id INTO cust_bk_us    FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Burger King US';
  SELECT id INTO cust_popeyes  FROM drydock_master.customers WHERE tenant_id = tid AND name ILIKE 'Popeyes%' LIMIT 1;
  SELECT id INTO cust_br_us    FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Baskin Robbins - US';
  SELECT id INTO cust_jfc      FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:JFC';
  SELECT id INTO cust_bk_kw    FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Burger King Kuwait';
  SELECT id INTO cust_bk_nc    FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Burger King New Caledonia';
  SELECT id INTO cust_bp       FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Boston Pizza';
  SELECT id INTO cust_bk_ca    FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Burger King Canada';
  SELECT id INTO cust_applegr  FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Applegreen';
  SELECT id INTO cust_eatnpark FROM drydock_master.customers WHERE tenant_id = tid AND external_id = 'harvest:Eat''n Park';

  INSERT INTO drydock_master.projects (
    tenant_id, project_number, name, customer_id, status, project_type, is_active
  )
  SELECT p.tenant_id, p.project_number, p.name, p.customer_id, p.status, p.project_type, true
  FROM (VALUES
    (tid, 'AGAAS',   'SPI: Aggregator as a Service',       NULL,           'active', 'engineering'),
    (tid, 'AGUS',    'Applegreen Platform',                 cust_applegr,   'active', 'client'),
    (tid, 'BK',      'BK App',                              cust_bk_us,     'active', 'client'),
    (tid, 'BKCASD',  'Burger King Canada Service Desk',     cust_bk_ca,     'active', 'support'),
    (tid, 'BKKWSD',  'Burger King Kuwait Service Desk',     cust_bk_kw,     'active', 'support'),
    (tid, 'BKMIO',   'BK Mobile International Ordering',    cust_bk_us,     'active', 'client'),
    (tid, 'BKMKW',   'Burger King Kuwait Mobile',           cust_bk_kw,     'active', 'client'),
    (tid, 'BKNCSD',  'Burger King New Caledonia Service Desk', cust_bk_nc,  'active', 'support'),
    (tid, 'BKUSASD', 'Burger King USA Service Desk',        cust_bk_us,     'active', 'support'),
    (tid, 'BKWKW',   'Burger King Kuwait Web',              cust_bk_kw,     'active', 'client'),
    (tid, 'BOSS',    'SPI: Back Office Support Service',    NULL,           'active', 'engineering'),
    (tid, 'BPCA',    'Boston Pizza Canada',                 cust_bp,        'active', 'client'),
    (tid, 'BPCASD',  'Boston Pizza Service Desk',           cust_bp,        'active', 'support'),
    (tid, 'BRA',     'Baskin Robbins App',                  cust_br_us,     'active', 'client'),
    (tid, 'BRUSSD',  'Baskin Robbins US Service Desk',      cust_br_us,     'active', 'support'),
    (tid, 'CC',      'Call Center',                         NULL,           'active', 'internal'),
    (tid, 'CCE',     'Call Center Escalations',             NULL,           'active', 'internal'),
    (tid, 'CHOW',    'Chowking',                            cust_jfc,       'active', 'client'),
    (tid, 'CHOWSD',  'Chowking Service Desk',               cust_jfc,       'active', 'support'),
    (tid, 'CKMPH',   'Chowking Mobile PH',                  cust_jfc,       'active', 'client'),
    (tid, 'CRM',     'CRM',                                 NULL,           'active', 'internal'),
    (tid, 'DA',      'Driver App',                          NULL,           'active', 'engineering'),
    (tid, 'DAS',     'Data Analytics Services',             NULL,           'active', 'engineering'),
    (tid, 'DM',      'Delivery Manager',                    NULL,           'active', 'engineering'),
    (tid, 'DO',      'DevOps Projects',                     NULL,           'active', 'internal'),
    (tid, 'EMS',     'External Menu Service',               NULL,           'active', 'engineering'),
    (tid, 'EPHBUS',  'Eat''n Park and Hello Bistro',        cust_eatnpark,  'active', 'client'),
    (tid, 'EPUSSD',  'Eat''n Park Service Desk',            cust_eatnpark,  'active', 'support'),
    (tid, 'GFP',     'Godfather''s Pizza',                  NULL,           'active', 'client'),
    (tid, 'HBUSSD',  'Hello Bistro Service Desk',           NULL,           'active', 'support'),
    (tid, 'IN',      'Infrastructure',                      NULL,           'active', 'internal'),
    (tid, 'INT',     'Internal',                            NULL,           'active', 'internal'),
    (tid, 'ITSECUR', 'IT Security',                         NULL,           'active', 'internal'),
    (tid, 'JBMPH',   'Jollibee Mobile PH',                  cust_jfc,       'active', 'client'),
    (tid, 'JBPH',    'Jollibee Philippines',                cust_jfc,       'active', 'client'),
    (tid, 'JBPHSD',  'Jollibee Philippines Service Desk',   cust_jfc,       'active', 'support')
  ) AS p(tenant_id, project_number, name, customer_id, status, project_type)
  WHERE NOT EXISTS (
    SELECT 1 FROM drydock_master.projects ex
    WHERE ex.tenant_id = p.tenant_id AND ex.project_number = p.project_number
  );

  RAISE NOTICE 'Tillster projects seeded successfully.';
END $$;

SELECT COUNT(*) as total_projects FROM drydock_master.projects WHERE tenant_id = '38657f1e-b861-43e1-a419-37090947c802';
SELECT project_number, name, project_type FROM drydock_master.projects WHERE tenant_id = '38657f1e-b861-43e1-a419-37090947c802' ORDER BY project_number LIMIT 20;
