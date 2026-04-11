CREATE TABLE IF NOT EXISTS drydock_q2c.credit_memo_applications (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  credit_memo_id uuid        NOT NULL REFERENCES drydock_q2c.credit_memos(id) ON DELETE RESTRICT,
  invoice_id     uuid        NOT NULL REFERENCES drydock_q2c.invoices(id) ON DELETE RESTRICT,
  amount         integer     NOT NULL CHECK (amount > 0),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  applied_by     uuid        NOT NULL,
  CONSTRAINT credit_memo_applications_pkey PRIMARY KEY (id)
);

-- Remaining-balance guard is enforced at the application layer (service validates that
-- sum of applied amounts does not exceed credit_memos.total_amount before insert).

CREATE INDEX IF NOT EXISTS idx_cma_tenant_id
  ON drydock_q2c.credit_memo_applications (tenant_id);

CREATE INDEX IF NOT EXISTS idx_cma_credit_memo_id
  ON drydock_q2c.credit_memo_applications (credit_memo_id);

CREATE INDEX IF NOT EXISTS idx_cma_invoice_id
  ON drydock_q2c.credit_memo_applications (invoice_id);
