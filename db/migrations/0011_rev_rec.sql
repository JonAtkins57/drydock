CREATE TYPE drydock_q2c.rev_rec_contract_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE drydock_q2c.rev_rec_obligation_status AS ENUM ('not_started', 'in_progress', 'satisfied', 'cancelled');
CREATE TYPE drydock_q2c.rev_rec_schedule_status AS ENUM ('scheduled', 'recognized', 'cancelled');

CREATE TABLE drydock_q2c.rev_rec_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contract_number text NOT NULL,
  customer_id uuid NOT NULL,
  order_id uuid,
  status drydock_q2c.rev_rec_contract_status NOT NULL DEFAULT 'draft',
  total_transaction_price bigint NOT NULL DEFAULT 0,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE TABLE drydock_q2c.rev_rec_performance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES drydock_q2c.rev_rec_contracts(id),
  description text NOT NULL,
  recognition_method text NOT NULL CHECK (recognition_method IN ('point_in_time', 'over_time')),
  status drydock_q2c.rev_rec_obligation_status NOT NULL DEFAULT 'not_started',
  allocated_price bigint NOT NULL DEFAULT 0,
  recognized_to_date bigint NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drydock_q2c.rev_rec_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  obligation_id uuid NOT NULL REFERENCES drydock_q2c.rev_rec_performance_obligations(id),
  period_id uuid,
  scheduled_date timestamptz NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  scheduled_amount bigint NOT NULL DEFAULT 0,
  recognized_amount bigint NOT NULL DEFAULT 0,
  status drydock_q2c.rev_rec_schedule_status NOT NULL DEFAULT 'scheduled',
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
