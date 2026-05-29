/*
  # Add INSERT policy for opayo_transactions

  Allows authenticated users to insert their own transaction records.
*/

CREATE POLICY "Users can insert own opayo transactions"
  ON opayo_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);
