/*
  # Add Super Admin Policy to View All Users

  1. Changes
    - Add SELECT policy for super admins to view all users in the system
  
  2. Security
    - Only users with is_super_admin = true can view all users
    - This enables the admin panel to display and manage all admin users
*/

-- Add policy for super admins to view all users
CREATE POLICY "Super admins can view all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_super_admin = true
    )
  );
