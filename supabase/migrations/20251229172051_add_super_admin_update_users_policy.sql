/*
  # Add Super Admin Policy to Update Users

  1. Changes
    - Add UPDATE policy for super admins to update user information (including is_active status)
  
  2. Security
    - Only super admins can update user records
    - This allows managing user active/inactive status from admin panel
*/

-- Add policy for super admins to update users
CREATE POLICY "Super admins can update users"
  ON users
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
