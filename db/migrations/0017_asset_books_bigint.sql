-- Migrate monetary columns in asset_depreciation_books from integer to bigint
ALTER TABLE drydock_asset.asset_depreciation_books
  ALTER COLUMN beginning_book_value TYPE bigint,
  ALTER COLUMN depreciation_expense TYPE bigint,
  ALTER COLUMN accumulated_depreciation TYPE bigint,
  ALTER COLUMN ending_book_value TYPE bigint;

-- Migrate monetary columns in asset_disposals from integer to bigint
ALTER TABLE drydock_asset.asset_disposals
  ALTER COLUMN proceeds_amount TYPE bigint,
  ALTER COLUMN net_book_value_at_disposal TYPE bigint,
  ALTER COLUMN gain_loss_amount TYPE bigint;
