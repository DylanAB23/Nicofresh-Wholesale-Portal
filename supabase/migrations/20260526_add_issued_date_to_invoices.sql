-- Add issued_date column to invoices table if it doesn't exist
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS issued_date date DEFAULT CURRENT_DATE;
