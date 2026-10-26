-- Adds a category to every product (Canned Goods, Drinks, Snacks, ...).
-- Only needed if your database was created BEFORE this column existed.
-- Running it twice errors with "duplicate column name" -- that just means it's already applied.

ALTER TABLE inventory_items ADD COLUMN category TEXT;
