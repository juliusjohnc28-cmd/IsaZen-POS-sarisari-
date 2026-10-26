-- Adds a place to save the store logo (the picture shown at the top-left of the app).
-- Only needed if your database was created BEFORE this column existed.
-- Running it twice errors with "duplicate column name" -- that just means it's already applied.

ALTER TABLE store_settings ADD COLUMN logo_url TEXT DEFAULT '';
