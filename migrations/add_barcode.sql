-- Adds a barcode column to an existing inventory_items table so items can be
-- found by scanning (phone camera or handheld scanner).
-- Only needed if your database was created BEFORE this column was added to
-- schema.sql. Running it twice errors with "duplicate column name" -- that
-- just means it's already applied.

ALTER TABLE inventory_items ADD COLUMN barcode TEXT;

-- Two items can't share a barcode (empty/NULL barcodes are allowed many times).
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_barcode ON inventory_items(barcode) WHERE barcode IS NOT NULL;
