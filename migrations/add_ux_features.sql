-- Adds the columns used by the newer features:
--   utangs.paid_amount          -> partial payments
--   inventory_items.low_stock_level -> a low-stock number per item (empty = 5)
--   inventory_items.expiry_date -> expiry warnings (YYYY-MM-DD)
--   inventory_items.is_favorite -> favorite items shown first in POS
-- Only needed if your database was created BEFORE these columns existed.
-- Running it twice errors with "duplicate column name" -- that just means it's already applied.

ALTER TABLE utangs ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;
UPDATE utangs SET paid_amount = amount WHERE status = 'PAID';

ALTER TABLE inventory_items ADD COLUMN low_stock_level INTEGER;
ALTER TABLE inventory_items ADD COLUMN expiry_date TEXT;
ALTER TABLE inventory_items ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
