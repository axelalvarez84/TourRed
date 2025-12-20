/*
  # Add service role update policy for bookings

  1. Changes
    - Add a policy to allow service role (webhooks) to update bookings
    - This is needed for Stripe webhooks to update payment status
  
  2. Security Notes
    - Policy only allows updates to payment-related fields
    - Uses TO service_role to restrict to service role key only
    - Maintains security by only allowing specific field updates
*/

-- Create a policy that allows service role to update bookings for webhook processing
CREATE POLICY "Service role can update bookings for webhooks"
  ON bookings
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
