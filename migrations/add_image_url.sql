-- Adds the image_url column to an existing inventory_items table.
-- Only needed if your database was created BEFORE this column was added
-- to schema.sql. Running this twice on the same database will error
-- with "duplicate column name" — that's fine, it just means it's already applied.

ALTER TABLE inventory_items ADD COLUMN image_url TEXT;
