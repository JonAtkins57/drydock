CREATE SCHEMA IF NOT EXISTS drydock_lease;

CREATE TYPE drydock_lease.lease_type AS ENUM ('operating', 'finance');
CREATE TYPE drydock_lease.lease_status AS ENUM ('draft', 'active', 'terminated', 'expired');
CREATE TYPE drydock_lease.payment_frequency AS ENUM ('monthly', 'quarterly', 'annual');
CREATE TYPE drydock_lease.lease_payment_status AS ENUM ('scheduled', 'paid', 'missed');

CREATE TABLE drydock_lease.lease_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lease_number text NOT NULL,
  lessor_name text,
  asset_description text NOT NULL,
  lease_type drydock_lease.lease_type NOT NULL DEFAULT 'operating',
  status drydock_lease.lease_status NOT NULL DEFAULT 'draft',
  commencement_date timestamptz NOT NULL,
  lease_end_date timestamptz NOT NULL,
  lease_term_months integer NOT NULL,
  payment_amount integer NOT NULL,
  payment_frequency drydock_lease.payment_frequency NOT NULL DEFAULT 'monthly',
  discount_rate integer NOT NULL DEFAULT 0,
  rou_asset_amount integer NOT NULL DEFAULT 0,
  lease_liability_amount integer NOT NULL DEFAULT 0,
  rou_account_id uuid,
  liability_account_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE TABLE drydock_lease.lease_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lease_contract_id uuid NOT NULL REFERENCES drydock_lease.lease_contracts(id),
  payment_number integer NOT NULL,
  payment_date timestamptz NOT NULL,
  payment_amount integer NOT NULL,
  principal_portion integer NOT NULL,
  interest_portion integer NOT NULL,
  opening_balance integer NOT NULL,
  closing_balance integer NOT NULL,
  status drydock_lease.lease_payment_status NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drydock_lease.lease_amortization_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lease_contract_id uuid NOT NULL REFERENCES drydock_lease.lease_contracts(id),
  period_date timestamptz NOT NULL,
  beginning_liability integer NOT NULL,
  payment_amount integer NOT NULL,
  interest_expense integer NOT NULL,
  principal_reduction integer NOT NULL,
  ending_liability integer NOT NULL,
  rou_amortization integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lease_contracts_tenant ON drydock_lease.lease_contracts(tenant_id);
CREATE INDEX idx_lease_payments_contract ON drydock_lease.lease_payments(lease_contract_id);
CREATE INDEX idx_lease_amortization_contract ON drydock_lease.lease_amortization_schedule(lease_contract_id);
