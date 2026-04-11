-- Migrate acquisition_cost and salvage_value from integer to bigint
ALTER TABLE drydock_asset.fixed_assets
  ALTER COLUMN acquisition_cost TYPE bigint,
  ALTER COLUMN salvage_value TYPE bigint;

-- Add new columns to fixed_assets
ALTER TABLE drydock_asset.fixed_assets
  ADD COLUMN IF NOT EXISTS accumulated_depreciation bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_book_value bigint,
  ADD COLUMN IF NOT EXISTS disposal_date timestamptz,
  ADD COLUMN IF NOT EXISTS disposal_proceeds bigint;

-- Initialize net_book_value for existing rows
UPDATE drydock_asset.fixed_assets
SET net_book_value = acquisition_cost - accumulated_depreciation
WHERE net_book_value IS NULL;

-- Make net_book_value NOT NULL after initialization
ALTER TABLE drydock_asset.fixed_assets
  ALTER COLUMN net_book_value SET NOT NULL;
