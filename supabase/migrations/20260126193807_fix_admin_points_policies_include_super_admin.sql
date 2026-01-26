/*
  # Fix Admin Points Policies to Include Super Admin
  
  ## Changes
  This migration updates the admin policies for points wallets and transactions
  to include both 'admin' and 'super_admin' roles.
  
  ## Policies Updated
  1. "Admins can view all points wallets" - now includes super_admin
  2. "Admins can view all points transactions" - now includes super_admin
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all points wallets" ON toursred_points_wallets;
DROP POLICY IF EXISTS "Admins can view all points transactions" ON toursred_points_transactions;

-- Recreate policy: Admins can view all points wallets
CREATE POLICY "Admins can view all points wallets"
  ON toursred_points_wallets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );

-- Recreate policy: Admins can view all points transactions
CREATE POLICY "Admins can view all points transactions"
  ON toursred_points_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
