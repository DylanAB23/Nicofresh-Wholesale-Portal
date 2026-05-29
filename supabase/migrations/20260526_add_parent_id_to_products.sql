/*
  # Add Parent ID for Product Variations

  ## Summary
  Adds proper parent-child relationship support for product variations.
  Instead of relying on fragile parent_sku (text) matching, we now use
  parent_id (uuid foreign key) to link variations to their parent products.

  ## Changes
  1. Add parent_id column to products table
  2. Create index on parent_id for query performance
  3. Existing parent_sku column is kept for reference/audit purposes
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='parent_id') THEN
    ALTER TABLE products ADD COLUMN parent_id uuid REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_parent_id_idx ON products(parent_id);
