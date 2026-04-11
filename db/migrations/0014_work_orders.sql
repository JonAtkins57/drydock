CREATE SCHEMA IF NOT EXISTS drydock_project;

CREATE TYPE drydock_project.work_order_type AS ENUM ('maintenance', 'installation', 'repair');
CREATE TYPE drydock_project.work_order_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE drydock_project.work_order_status AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'invoiced');

CREATE TABLE drydock_project.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type drydock_project.work_order_type NOT NULL,
  priority drydock_project.work_order_priority NOT NULL DEFAULT 'normal',
  status drydock_project.work_order_status NOT NULL DEFAULT 'open',
  assigned_to_employee_id UUID,
  assigned_team TEXT,
  location_id UUID,
  customer_id UUID,
  scheduled_date TIMESTAMPTZ,
  completed_date TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE drydock_project.work_order_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_id UUID NOT NULL REFERENCES drydock_project.work_orders(id),
  item_id UUID,
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE TABLE drydock_project.work_order_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_id UUID NOT NULL REFERENCES drydock_project.work_orders(id),
  employee_id UUID,
  logged_date DATE NOT NULL,
  hours_worked INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX idx_work_orders_tenant_id ON drydock_project.work_orders(tenant_id);
CREATE INDEX idx_work_orders_status ON drydock_project.work_orders(status);
CREATE INDEX idx_work_order_parts_work_order_id ON drydock_project.work_order_parts(work_order_id);
CREATE INDEX idx_work_order_time_logs_work_order_id ON drydock_project.work_order_time_logs(work_order_id);
