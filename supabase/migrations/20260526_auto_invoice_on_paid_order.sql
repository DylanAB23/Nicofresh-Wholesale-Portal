-- Create function to auto-generate invoice when order is paid
CREATE OR REPLACE FUNCTION create_invoice_for_paid_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create invoice if payment_status changed to 'paid' and invoice doesn't already exist
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    -- Check if invoice already exists for this order
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE order_id = NEW.id) THEN
      INSERT INTO invoices (
        order_id,
        profile_id,
        status,
        amount_due,
        amount_paid,
        issued_date,
        due_date,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        NEW.profile_id,
        'paid',
        NEW.total,
        NEW.total,
        NOW(),
        NOW() + INTERVAL '30 days',
        NOW(),
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (to allow re-running migration)
DROP TRIGGER IF EXISTS trigger_create_invoice_on_order_paid ON orders;

-- Create trigger on orders table
CREATE TRIGGER trigger_create_invoice_on_order_paid
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION create_invoice_for_paid_order();

-- For orders that are already paid but don't have invoices yet
INSERT INTO invoices (
  order_id,
  profile_id,
  status,
  amount_due,
  amount_paid,
  issued_date,
  due_date,
  created_at,
  updated_at
)
SELECT
  o.id,
  o.profile_id,
  'paid',
  o.total,
  o.total,
  NOW(),
  NOW() + INTERVAL '30 days',
  NOW(),
  NOW()
FROM orders o
WHERE o.payment_status = 'paid'
AND NOT EXISTS (SELECT 1 FROM invoices WHERE order_id = o.id)
ON CONFLICT DO NOTHING;
