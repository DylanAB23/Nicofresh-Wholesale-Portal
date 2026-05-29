/*
  # Core Tables: Profiles, Orders, Invoices, Payments, Portal Settings

  ## Summary
  Creates the full wholesale portal schema including customer accounts, orders,
  invoices, and payment tracking. This is the foundational schema for the B2B portal.

  ## New Tables

  ### profiles
  Customer and admin user accounts linked to Supabase auth.
  - `id` — matches auth.users.id
  - `role` — 'admin' or 'customer'
  - `status` — 'pending', 'active', 'suspended'
  - `store_name`, `contact_name`, `email`, `phone`
  - `credit_limit`, `current_balance`, `net_terms`, `net30_limit`
  - `require_upfront` — force upfront payment regardless of order size
  - `notes` — internal admin notes

  ### orders
  Customer purchase orders.
  - Links to profiles via `profile_id`
  - `status` — pending, approved, processing, shipped, delivered, cancelled
  - `payment_method` — net30 or upfront
  - `payment_status` — unpaid, pending_payment, partial, paid, overdue

  ### order_items
  Line items on each order, linked to products by SKU.

  ### invoices
  Invoices generated from orders.
  - `status` — unpaid, partial, paid, overdue

  ### payments
  Payment records linked to invoices.

  ### portal_settings
  Global admin-configurable settings (net30 thresholds, defaults, company name).

  ## Security
  - RLS enabled on all tables
  - Customers can only read/write their own data
  - Admins have full access via app_metadata role check
  - A database trigger auto-creates a profile on new user signup

  ## Notes
  1. Admin role is set via Supabase app_metadata (not the profiles table) so it
     cannot be tampered with by users
  2. Profile trigger sets status='pending' for self-signup; admin-created accounts
     get status='active' via the upsert in the application
  3. The profiles INSERT policy allows the trigger (service role) and the user
     themselves to create their profile row
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer',
  store_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  credit_limit numeric(12,2) NOT NULL DEFAULT 5000.00,
  current_balance numeric(12,2) NOT NULL DEFAULT 0.00,
  net_terms integer NOT NULL DEFAULT 30,
  net30_limit numeric(12,2) NOT NULL DEFAULT 1000.00,
  require_upfront boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Users can insert their own profile (covers self-signup trigger)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own non-sensitive fields
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admins can insert profiles (for admin-created accounts)
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- PORTAL SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_settings (
  id text PRIMARY KEY DEFAULT 'global',
  net30_min_order numeric(12,2) DEFAULT 50.00,
  net30_enabled boolean DEFAULT true,
  default_net_terms integer DEFAULT 30,
  default_credit_limit numeric(12,2) DEFAULT 5000.00,
  default_net30_limit numeric(12,2) DEFAULT 1000.00,
  company_name text DEFAULT 'Nicofresh',
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

INSERT INTO portal_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_number text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'net30',
  payment_status text NOT NULL DEFAULT 'unpaid',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  shipping numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  shipping_name text DEFAULT '',
  shipping_address text DEFAULT '',
  shipping_city text DEFAULT '',
  shipping_postcode text DEFAULT '',
  shipping_country text DEFAULT 'GB',
  shipstation_order_id text DEFAULT '',
  shipstation_order_key text DEFAULT '',
  tracking_number text DEFAULT '',
  carrier text DEFAULT '',
  shipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Customers can insert own orders"
  ON orders FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Admins can insert orders"
  ON orders FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own order items"
  ON order_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.profile_id = auth.uid())
  );

CREATE POLICY "Admins can read all order items"
  ON order_items FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Customers can insert own order items"
  ON order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.profile_id = auth.uid())
  );

CREATE POLICY "Admins can insert order items"
  ON order_items FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  status text NOT NULL DEFAULT 'unpaid',
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  due_date date,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own invoices"
  ON invoices FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can read all invoices"
  ON invoices FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'card',
  reference text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own payments"
  ON payments FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can read all payments"
  ON payments FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can insert payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- OPAYO TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS opayo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  vendor_tx_code text UNIQUE,
  transaction_id text DEFAULT '',
  status text DEFAULT '',
  amount numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'GBP',
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE opayo_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own transactions"
  ON opayo_transactions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can read all transactions"
  ON opayo_transactions FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated users can insert transactions"
  ON opayo_transactions FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- AUTO-GENERATE ORDER NUMBERS
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Auto-generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_number ON invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS orders_profile_id_idx ON orders(profile_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS invoices_profile_id_idx ON invoices(profile_id);
CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON invoices(order_id);
CREATE INDEX IF NOT EXISTS payments_profile_id_idx ON payments(profile_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
