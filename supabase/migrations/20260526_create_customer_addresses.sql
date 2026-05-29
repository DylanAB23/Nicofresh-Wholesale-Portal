-- Create customer_addresses table for storing customer delivery addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company TEXT DEFAULT '',
  street1 TEXT NOT NULL,
  street2 TEXT DEFAULT '',
  city TEXT NOT NULL,
  state TEXT DEFAULT '',
  zip TEXT NOT NULL,
  country TEXT DEFAULT 'GB',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_customer_addresses_profile_id ON customer_addresses(profile_id);
CREATE INDEX idx_customer_addresses_is_default ON customer_addresses(profile_id, is_default);

-- Enable RLS
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/edit their own addresses
CREATE POLICY "Users can view their own addresses"
  ON customer_addresses FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own addresses"
  ON customer_addresses FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update their own addresses"
  ON customer_addresses FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own addresses"
  ON customer_addresses FOR DELETE
  USING (auth.uid() = profile_id);
