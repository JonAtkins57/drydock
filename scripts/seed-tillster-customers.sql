-- Seed real Tillster customers from Harvest/Signals data
-- Tenant: Tillster (38657f1e-b861-43e1-a419-37090947c802)
-- Source: Signals MySQL → harvest_time_entries.client_name (distinct, external clients only)
-- Run: psql $DATABASE_URL -f scripts/seed-tillster-customers.sql

DO $$
DECLARE
  tid UUID := '38657f1e-b861-43e1-a419-37090947c802';
  seq INT;
BEGIN
  -- Get current max sequence to avoid collision with existing CUS-* numbers
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(customer_number, '[^0-9]', '', 'g') AS INT)), 0)
  INTO seq
  FROM drydock_master.customers
  WHERE tenant_id = tid;

  -- Insert only clients not already present (match on name)
  WITH new_clients(name, ext_id) AS (VALUES
    ('Pollo Campero', 'harvest:Pollo Campero'),
    ('Baskin Robbins US', 'harvest:Baskin Robbins - US'),
    ('Baskin Robbins Canada', 'harvest:Baskin Robbins - Canada'),
    ('JFC - Jollibee Food Corporation', 'harvest:JFC'),
    ('Burger King US', 'harvest:Burger King US'),
    ('Burger King Spain', 'harvest:Burger King Spain'),
    ('Burger King Kuwait', 'harvest:Burger King Kuwait'),
    ('Burger King Germany', 'harvest:Burger King Germany'),
    ('Burger King Colombia', 'harvest:Burger King Colombia'),
    ('Burger King Portugal', 'harvest:Burger King Portugal'),
    ('Burger King Costa Rica', 'harvest:Burger King Costa Rica'),
    ('Burger King Uruguay', 'harvest:Burger King Uruguay'),
    ('Burger King Canada', 'harvest:Burger King Canada'),
    ('Burger King Austria', 'harvest:Burger King Austria'),
    ('Burger King Venezuela', 'harvest:Burger King Venezuela'),
    ('Burger King Switzerland', 'harvest:Burger King Switzerland'),
    ('Burger King Dominican Republic', 'harvest:Burger King Dominican Republic'),
    ('Burger King UK', 'harvest:Burger King UK'),
    ('Burger King Saudi Arabia UAE', 'harvest:BK Saudi Arabia/UAE'),
    ('Burger King Ecuador', 'harvest:Burger King Ecuador'),
    ('Burger King Ivory Coast', 'harvest:Burger King Ivory Coast'),
    ('Burger King New Caledonia', 'harvest:Burger King New Caledonia'),
    ('Burger King Tahiti', 'harvest:Burger King Tahiti'),
    ('Burger King El Salvador', 'harvest:Burger King El Salvador'),
    ('Porto''s Bakery', 'harvest:Porto''s Bakery'),
    ('Boston Pizza', 'harvest:Boston Pizza'),
    ('Tropical Smoothie Cafe', 'harvest:Tropical Smoothie Cafe'),
    ('AppleGreen', 'harvest:Applegreen'),
    ('Eat''n Park', 'harvest:Eat''n Park'),
    ('Hello Bistro', 'harvest:Hello Bistro'),
    ('Subway Kuwait', 'harvest:Subway Kuwait'),
    ('Firehouse Subs', 'harvest:Firehouse Subs'),
    ('Avolta', 'harvest:Avolta'),
    ('Tim Hortons', 'harvest:Tim Horton''s'),
    ('Raising Cane''s', 'harvest:Raising Cane''s'),
    ('Chopstix TGB', 'harvest:Chopstix/TGB'),
    ('Papa John''s', 'harvest:Papa John''s'),
    ('Godfather''s Pizza', 'harvest:Godfather''s Pizza'),
    ('Coffee Shop Co', 'harvest:Coffee Shop Co'),
    ('Pollo Granjero', 'harvest:Pollo Granjero')
  )
  INSERT INTO drydock_master.customers (
    tenant_id, name, customer_number, status, currency, external_id, is_active
  )
  SELECT
    tid,
    nc.name,
    'CUS-' || LPAD((seq + ROW_NUMBER() OVER (ORDER BY nc.name))::TEXT, 6, '0'),
    'active',
    'USD',
    nc.ext_id,
    true
  FROM new_clients nc
  WHERE NOT EXISTS (
    SELECT 1 FROM drydock_master.customers c
    WHERE c.tenant_id = tid AND c.external_id = nc.ext_id
  );

  RAISE NOTICE 'Tillster customers seeded successfully.';
END $$;

-- Report
SELECT COUNT(*) as total_customers FROM drydock_master.customers WHERE tenant_id = '38657f1e-b861-43e1-a419-37090947c802';
