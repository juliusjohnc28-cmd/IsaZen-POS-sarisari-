-- Turns every existing customer name into ALL CAPS (new names are saved in caps automatically).
-- Safe to run more than once. If two spellings only differ by capital letters
-- (e.g. "juan" and "Juan"), they end up as one customer.

UPDATE OR IGNORE customers SET name = UPPER(TRIM(name));
DELETE FROM customers WHERE name != UPPER(TRIM(name));
UPDATE utangs SET customer_name = UPPER(TRIM(customer_name));
