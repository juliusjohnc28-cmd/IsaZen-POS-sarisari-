-- Lets you add, rename and delete product categories.
-- Creates the list of categories and fills it with the usual sari-sari store shelves.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  builtin_key TEXT,            -- which standard shelf this started as (so Auto-sort still works after a rename)
  position INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO categories (id, name, builtin_key, position) VALUES
  ('cat-canned-goods', 'Canned Goods', 'Canned Goods', 1),
  ('cat-noodles', 'Noodles', 'Noodles', 2),
  ('cat-alcohol', 'Alcohol', 'Alcohol', 3),
  ('cat-cigarettes', 'Cigarettes', 'Cigarettes', 4),
  ('cat-drinks', 'Drinks', 'Drinks', 5),
  ('cat-snacks', 'Snacks', 'Snacks', 6),
  ('cat-candies', 'Candies', 'Candies', 7),
  ('cat-condiments-cooking', 'Condiments & Cooking', 'Condiments & Cooking', 8),
  ('cat-rice-grains', 'Rice & Grains', 'Rice & Grains', 9),
  ('cat-medicine', 'Medicine', 'Medicine', 10),
  ('cat-toiletries', 'Toiletries', 'Toiletries', 11),
  ('cat-household-cleaning', 'Household & Cleaning', 'Household & Cleaning', 12),
  ('cat-eggs-frozen', 'Eggs & Frozen', 'Eggs & Frozen', 13),
  ('cat-school-supplies', 'School Supplies', 'School Supplies', 14);
