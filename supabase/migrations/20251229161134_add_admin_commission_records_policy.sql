/*
  # Add Admin Access to Commission Records

  1. Changes
    - Add SELECT policy for admins to read all commission records
    - Admins need this to display agency statistics in the admin panel
  
  2. Security
    - Policy checks user.role = 'admin' from users table
    - Only affects SELECT operations
*/

-- Allow admins to read all commission records
CREATE POLICY "Admins can read all commission records"
  ON commission_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
