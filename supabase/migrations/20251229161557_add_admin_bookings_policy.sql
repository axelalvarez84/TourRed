/*
  # Add Admin Access to Bookings

  1. Changes
    - Add SELECT policy for admins to read all bookings
    - Admins need this to display booking statistics in the admin panel
  
  2. Security
    - Policy checks user.role = 'admin' from users table
    - Only affects SELECT operations
*/

-- Allow admins to read all bookings
CREATE POLICY "Admins can read all bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
