-- Adds the expenses table to an existing database.
-- Only needed if your database was created BEFORE this table was added
-- to schema.sql. Safe to run even if it already exists (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
