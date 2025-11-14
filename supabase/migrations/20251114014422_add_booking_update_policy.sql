/*
  # Add UPDATE policy for bookings table

  1. Security Changes
    - Add UPDATE policy allowing users to update their own bookings
    - This is needed to update payment status after successful Stripe checkout
*/

CREATE POLICY "Users can update own bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
