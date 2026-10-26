-- Sari-Sari Store D1 schema

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  parent_id TEXT,
  pieces_per_parent INTEGER,
  image_url TEXT,
  barcode TEXT,
  low_stock_level INTEGER,
  expiry_date TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  category TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN','OUT','UTANG','PAYMENT')),
  quantity INTEGER NOT NULL,
  total_price REAL NOT NULL,
  timestamp TEXT NOT NULL,
  cost REAL            -- for a utang PAYMENT: the part of it that pays back your capital (the rest is profit)
);

CREATE TABLE IF NOT EXISTS utangs (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  items_description TEXT,
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  cost REAL,           -- capital (puhunan) of the goods given on utang; empty = not known yet
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('UNPAID','PAID'))
);

CREATE TABLE IF NOT EXISTS customers (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'Sari-Sari Store',
  owner_name TEXT DEFAULT '',
  security_pin TEXT DEFAULT '',
  logo_url TEXT DEFAULT ''
);

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

INSERT OR IGNORE INTO store_settings (id, store_name, owner_name, security_pin)
VALUES (1, 'Nanay''s Sari-Sari Store', '', '');

CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_utangs_status ON utangs(status);
CREATE INDEX IF NOT EXISTS idx_items_parent ON inventory_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_barcode ON inventory_items(barcode) WHERE barcode IS NOT NULL;
