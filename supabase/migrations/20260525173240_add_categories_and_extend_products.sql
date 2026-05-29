/*
  # Add Categories Table and Extend Products

  1. New Tables
    - `categories` - product categories with name, slug, description, sort_order

  2. Modified Tables
    - `products` - add missing columns:
      - `category_id` (uuid FK to categories)
      - `short_description`, `gallery_urls`, `categories_raw`
      - `wholesale_price`, `msrp`, `case_quantity`, `min_order_quantity`
      - `unit_of_measure`, `weight`, `is_active`, `updated_at`

  3. Security
    - Enable RLS on categories
    - Add INSERT/UPDATE/DELETE policies on products (admin only via jwt app_metadata)
    - Authenticated users can read all categories
*/

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_key UNIQUE (name),
  CONSTRAINT categories_slug_key UNIQUE (slug)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Seed default categories
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Disposables', 'disposables', 'Ready-to-use disposables, cigars and pre-filled pods', 1),
  ('E-Liquids', 'e-liquids', 'Nicotine salts, shortfills and nic shots', 2),
  ('Devices', 'devices', 'Pod kits, starter kits and vape mods', 3),
  ('Replacements', 'replacements', 'Coils, pods, tanks, batteries and accessories', 4)
ON CONFLICT (name) DO NOTHING;

-- Add missing columns to products
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
    ALTER TABLE products ADD COLUMN category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='short_description') THEN
    ALTER TABLE products ADD COLUMN short_description text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='gallery_urls') THEN
    ALTER TABLE products ADD COLUMN gallery_urls text[] NOT NULL DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='categories_raw') THEN
    ALTER TABLE products ADD COLUMN categories_raw text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='wholesale_price') THEN
    ALTER TABLE products ADD COLUMN wholesale_price numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='msrp') THEN
    ALTER TABLE products ADD COLUMN msrp numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='case_quantity') THEN
    ALTER TABLE products ADD COLUMN case_quantity int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='min_order_quantity') THEN
    ALTER TABLE products ADD COLUMN min_order_quantity int NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='unit_of_measure') THEN
    ALTER TABLE products ADD COLUMN unit_of_measure text NOT NULL DEFAULT 'each';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='weight') THEN
    ALTER TABLE products ADD COLUMN weight numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_active') THEN
    ALTER TABLE products ADD COLUMN is_active bool NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='updated_at') THEN
    ALTER TABLE products ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (category_id);
CREATE INDEX IF NOT EXISTS products_parent_sku_idx ON products (parent_sku);
CREATE INDEX IF NOT EXISTS products_is_active_idx ON products (is_active);
CREATE INDEX IF NOT EXISTS products_type_idx ON products (type);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku);

-- Add write policies to products (read policies already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Admins can insert products') THEN
    CREATE POLICY "Admins can insert products"
      ON products FOR INSERT
      TO authenticated
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Admins can update products') THEN
    CREATE POLICY "Admins can update products"
      ON products FOR UPDATE
      TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Admins can delete products') THEN
    CREATE POLICY "Admins can delete products"
      ON products FOR DELETE
      TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END $$;
