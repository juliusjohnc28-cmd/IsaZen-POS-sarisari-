-- Lets the app work out capital and profit on utang, and count utang payments in the daily sales and profit.
--   utangs.cost       -> capital (puhunan) of the goods given on utang
--   transactions.cost -> for a utang payment: the part of it that pays back your capital
-- Only needed if your database was created BEFORE these columns existed.
-- Running it twice errors with "duplicate column name" -- that just means it's already applied.

ALTER TABLE utangs ADD COLUMN cost REAL;
ALTER TABLE transactions ADD COLUMN cost REAL;
