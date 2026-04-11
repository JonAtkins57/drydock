CREATE SCHEMA IF NOT EXISTS drydock_asset;

CREATE TYPE drydock_asset.asset_class AS ENUM (
  'land', 'building', 'equipment', 'vehicle', 'furniture', 'software', 'other'
);

CREATE TYPE drydock_asset.depreciation_method AS ENUM (
  'straight_line', 'declining_balance', 'units_of_production'
);

CREATE TYPE drydock_asset.asset_status AS ENUM (
  'active', 'disposed', 'fully_depreciated'
);

CREATE TYPE drydock_asset.book_type AS ENUM (
  'tax', 'gaap', 'internal'
);

CREATE TYPE drydock_asset.disposal_type AS ENUM (
  'sale', 'scrap', 'donation', 'write_off'
);

CREATE TABLE drydock_asset.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_number text NOT NULL,
  name text NOT NULL,
  description text,
  asset_class drydock_asset.asset_class NOT NULL,
  status drydock_asset.asset_status NOT NULL DEFAULT 'active',
  acquisition_date timestamptz NOT NULL,
  acquisition_cost integer NOT NULL,
  salvage_value integer NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL,
  depreciation_method drydock_asset.depreciation_method NOT NULL,
  location_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_fixed_assets_tenant_id ON drydock_asset.fixed_assets (tenant_id);
CREATE UNIQUE INDEX idx_fixed_assets_tenant_asset_number ON drydock_asset.fixed_assets (tenant_id, asset_number);

CREATE TABLE drydock_asset.asset_depreciation_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES drydock_asset.fixed_assets(id),
  book_type drydock_asset.book_type NOT NULL,
  depreciation_method drydock_asset.depreciation_method NOT NULL,
  useful_life_months integer NOT NULL,
  salvage_value integer NOT NULL DEFAULT 0,
  accumulated_depreciation integer NOT NULL DEFAULT 0,
  net_book_value integer NOT NULL,
  last_depreciation_date timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX idx_asset_depreciation_books_tenant_id ON drydock_asset.asset_depreciation_books (tenant_id);

CREATE TABLE drydock_asset.asset_disposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES drydock_asset.fixed_assets(id),
  disposal_type drydock_asset.disposal_type NOT NULL,
  disposal_date timestamptz NOT NULL,
  proceeds_amount integer NOT NULL DEFAULT 0,
  net_book_value_at_disposal integer NOT NULL,
  gain_loss integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_asset_disposals_tenant_id ON drydock_asset.asset_disposals (tenant_id);
