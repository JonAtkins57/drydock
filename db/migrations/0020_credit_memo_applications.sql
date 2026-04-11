CREATE TABLE IF NOT EXISTS drydock_q2c.credit_memo_applications (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  credit_memo_id uuid        NOT NULL REFERENCES drydock_q2c.credit_memos(id) ON DELETE RESTRICT,
  invoice_id     uuid        NOT NULL,
  amount         integer     NOT NULL CHECK (amount > 0),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  applied_by     uuid        NOT NULL,
  CONSTRAINT credit_memo_applications_pkey PRIMARY KEY (id)
);
