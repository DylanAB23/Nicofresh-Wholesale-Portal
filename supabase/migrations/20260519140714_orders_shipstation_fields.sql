/*
  # Add ShipStation sync fields to orders

  1. Modified Tables
    - `orders`
      - `shipstation_order_id` (text, nullable) - ShipStation's assigned order ID
      - `shipstation_synced_at` (timestamptz, nullable) - when the order was last pushed to ShipStation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipstation_order_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN shipstation_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipstation_synced_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN shipstation_synced_at timestamptz;
  END IF;
END $$;
