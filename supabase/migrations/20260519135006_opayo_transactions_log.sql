/*
  # Opayo Transaction Log

  1. New Tables
    - `opayo_transactions`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, references profiles)
      - `order_id` (uuid, nullable, references orders)
      - `invoice_id` (uuid, nullable, references invoices)
      - `opayo_transaction_id` (text) - Opayo's transaction reference
      - `vendor_tx_code` (text) - our unique reference sent to Opayo
      - `amount` (numeric) - amount in GBP
      - `status` (text) - Ok, Declined, etc.
      - `status_code` (text) - Opayo status code
      - `status_detail` (text) - Opayo status detail message
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Authenticated users can view their own transactions
    - No insert/update from client side (written by edge function via service role)
*/

CREATE TABLE IF NOT EXISTS opayo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  opayo_transaction_id text,
  vendor_tx_code text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unknown',
  status_code text,
  status_detail text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE opayo_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own opayo transactions"
  ON opayo_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = profile_id);
