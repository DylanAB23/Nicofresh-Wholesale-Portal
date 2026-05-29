/*
  # Payment Terms & Portal Settings

  ## Changes
  1. `orders` — add `payment_method` (net30 | upfront) and `payment_status` columns
  2. `profiles` — add `net30_limit` (max order value allowed on net30 terms) and `require_upfront` flag
  3. `portal_settings` — new table for admin-configurable global settings (e.g. minimum order value for net30)

  ## Security
  - portal_settings: authenticated users can read; only admins can write
*/

-- Add payment method tracking to orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_method') THEN
    ALTER TABLE orders ADD COLUMN payment_method text NOT NULL DEFAULT 'net30';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_status') THEN
    ALTER TABLE orders ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid';
  END IF;
END $$;

-- Add per-account net30 controls to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='net30_limit') THEN
    ALTER TABLE profiles ADD COLUMN net30_limit numeric(12,2) DEFAULT 1000.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='require_upfront') THEN
    ALTER TABLE profiles ADD COLUMN require_upfront boolean DEFAULT false;
  END IF;
END $$;

-- Global portal settings table
CREATE TABLE IF NOT EXISTS portal_settings (
  id text PRIMARY KEY DEFAULT 'global',
  net30_min_order numeric(12,2) DEFAULT 50.00,
  net30_enabled boolean DEFAULT true,
  default_net_terms integer DEFAULT 30,
  default_credit_limit numeric(12,2) DEFAULT 5000.00,
  default_net30_limit numeric(12,2) DEFAULT 1000.00,
  company_name text DEFAULT 'WholesaleHub',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON portal_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update settings"
  ON portal_settings FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert settings"
  ON portal_settings FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Seed default settings row
INSERT INTO portal_settings (id, net30_min_order, net30_enabled, default_net_terms, default_credit_limit, default_net30_limit, company_name)
VALUES ('global', 50.00, true, 30, 5000.00, 1000.00, 'WholesaleHub')
ON CONFLICT (id) DO NOTHING;
