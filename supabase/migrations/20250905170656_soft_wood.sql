/*
  # Fix destinations RLS policies for admin access

  1. Security Updates
    - Add policy for admins to insert destinations
    - Add policy for admins to update destinations
    - Maintain existing agency and public read policies

  2. Changes
    - Allow admins to create new destinations
    - Allow admins to update existing destinations
    - Verify admin role through users table lookup
*/

-- Add policy for admins to insert destinations
CREATE POLICY "Admins can insert destinations"
  ON destinations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Add policy for admins to update destinations  
CREATE POLICY "Admins can update destinations"
  ON destinations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );