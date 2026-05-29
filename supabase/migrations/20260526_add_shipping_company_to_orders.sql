-- Add shipping_company column to orders table
ALTER TABLE orders ADD COLUMN shipping_company TEXT DEFAULT '';

-- Add shipping_state column for state/province (was missing, causing empty state_province in ShipStation)
ALTER TABLE orders ADD COLUMN shipping_state TEXT DEFAULT '';
