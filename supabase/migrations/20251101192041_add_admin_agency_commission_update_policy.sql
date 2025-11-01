/*
  # Add Admin Commission Update Policy

  ## Summary
  Allows admin users to update agency commission rates from the admin panel.
  
  ## Changes Made
  
  ### New RLS Policy:
  - "Admins can update agency commission"
    - Allows admin role users to update commission_rate field on any agency
    - Only admins (role = 'admin') can perform this action
*/

-- Add policy for admins to update commission_rate
CREATE POLICY "Admins can update agency commission"
  ON agencies FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );