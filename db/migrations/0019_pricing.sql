-- Pricing / Rate Cards master data in drydock_pricing schema

CREATE SCHEMA IF NOT EXISTS drydock_pricing;

CREATE TABLE IF NOT EXISTS drydock_pricing.rate_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  name             text NOT NULL,
  description      text,
  currency         text NOT NULL DEFAULT 'USD',
  is_active        boolean NOT NULL DEFAULT true,
  effective_from   timestamptz,
  effective_to     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid
);

CREATE INDEX IF NOT EXISTS idx_rate_cards_tenant
  ON drydock_pricing.rate_cards (tenant_id)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS drydock_pricing.rate_card_tiers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  rate_card_id      uuid NOT NULL REFERENCES drydock_pricing.rate_cards(id),
  min_quantity      integer NOT NULL DEFAULT 0,
  max_quantity      integer,
  unit_price_cents  integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);

CREATE INDEX IF NOT EXISTS idx_rate_card_tiers_card
  ON drydock_pricing.rate_card_tiers (rate_card_id, min_quantity);

CREATE TABLE IF NOT EXISTS drydock_pricing.pricing_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  customer_id       uuid NOT NULL,
  rate_card_id      uuid NOT NULL REFERENCES drydock_pricing.rate_cards(id),
  unit_price_cents  integer NOT NULL,
  effective_from    timestamptz,
  effective_to      timestamptz,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid
);

CREATE INDEX IF NOT EXISTS idx_pricing_overrides_lookup
  ON drydock_pricing.pricing_overrides (tenant_id, customer_id, rate_card_id)
  WHERE is_active = true;
