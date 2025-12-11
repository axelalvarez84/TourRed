/*
  # Fix booking update policy

  1. Changes
    - Drop the restrictive update policy
    - Create a new policy that allows users to update their own bookings
    - Remove the WITH CHECK constraint that was causing 403 errors
    
  2. Security
    - Users can still only update their own bookings (verified by user_id)
    - This allows payment status updates after Stripe checkout
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can update own bookings" ON bookings;

-- Create a more permissive policy for updates
-- This allows authenticated users to update their own bookings
-- The USING clause ensures they can only update bookings they own
CREATE POLICY "Users can update own bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
