CREATE SCHEMA IF NOT EXISTS drydock_project_mgmt;

CREATE TYPE drydock_project_mgmt.project_mgmt_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE drydock_project_mgmt.project_phase_status AS ENUM ('not_started', 'in_progress', 'completed', 'cancelled');
CREATE TYPE drydock_project_mgmt.project_task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'cancelled');
CREATE TYPE drydock_project_mgmt.project_task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE drydock_project_mgmt.project_resource_type AS ENUM ('employee', 'contractor', 'equipment', 'material');

CREATE TABLE drydock_project_mgmt.projects_mgmt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status drydock_project_mgmt.project_mgmt_status NOT NULL DEFAULT 'planning',
  customer_id UUID,
  manager_employee_id UUID,
  department_id UUID,
  start_date DATE,
  end_date DATE,
  budget_cents INTEGER,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE drydock_project_mgmt.project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES drydock_project_mgmt.projects_mgmt(id),
  name TEXT NOT NULL,
  description TEXT,
  status drydock_project_mgmt.project_phase_status NOT NULL DEFAULT 'not_started',
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE drydock_project_mgmt.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES drydock_project_mgmt.projects_mgmt(id),
  phase_id UUID REFERENCES drydock_project_mgmt.project_phases(id),
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_date DATE,
  is_billable BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE drydock_project_mgmt.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES drydock_project_mgmt.projects_mgmt(id),
  phase_id UUID REFERENCES drydock_project_mgmt.project_phases(id),
  milestone_id UUID REFERENCES drydock_project_mgmt.project_milestones(id),
  title TEXT NOT NULL,
  description TEXT,
  status drydock_project_mgmt.project_task_status NOT NULL DEFAULT 'todo',
  priority drydock_project_mgmt.project_task_priority NOT NULL DEFAULT 'normal',
  assigned_to_employee_id UUID,
  estimated_hours INTEGER,
  actual_hours INTEGER,
  due_date DATE,
  completed_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE drydock_project_mgmt.project_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES drydock_project_mgmt.projects_mgmt(id),
  resource_type drydock_project_mgmt.project_resource_type NOT NULL,
  employee_id UUID,
  name TEXT NOT NULL,
  role TEXT,
  allocation_percent INTEGER,
  start_date DATE,
  end_date DATE,
  hourly_rate_cents INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_projects_mgmt_tenant_id ON drydock_project_mgmt.projects_mgmt(tenant_id);
CREATE INDEX idx_projects_mgmt_status ON drydock_project_mgmt.projects_mgmt(status);
CREATE INDEX idx_project_phases_tenant_id ON drydock_project_mgmt.project_phases(tenant_id);
CREATE INDEX idx_project_phases_project_id ON drydock_project_mgmt.project_phases(project_id);
CREATE INDEX idx_project_milestones_tenant_id ON drydock_project_mgmt.project_milestones(tenant_id);
CREATE INDEX idx_project_milestones_project_id ON drydock_project_mgmt.project_milestones(project_id);
CREATE INDEX idx_project_tasks_tenant_id ON drydock_project_mgmt.project_tasks(tenant_id);
CREATE INDEX idx_project_tasks_project_id ON drydock_project_mgmt.project_tasks(project_id);
CREATE INDEX idx_project_resources_tenant_id ON drydock_project_mgmt.project_resources(tenant_id);
CREATE INDEX idx_project_resources_project_id ON drydock_project_mgmt.project_resources(project_id);
