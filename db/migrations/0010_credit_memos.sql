CREATE TABLE drydock_q2c.credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_id uuid,
  memo_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  reason text,
  total_amount integer NOT NULL DEFAULT 0,
  ar_account_id uuid,
  approved_at timestamptz,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drydock_q2c.credit_memo_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id uuid NOT NULL REFERENCES drydock_q2c.credit_memos(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  amount integer NOT NULL,
  description text,
  line_number integer NOT NULL
);
