/*
  # Add agency booking update policy

  1. Security Changes
    - Add UPDATE policy allowing agencies to update bookings for their tours
    - Agencies can update approval_status, approval_notes, approved_at, and approved_by fields
    - This enables agencies to approve or reject booking requests
  
  2. Security Notes
    - Policy verifies that the booking belongs to the agency
    - Uses agency_id to ensure agencies only update their own bookings
*/

-- Create policy allowing agencies to update their bookings
CREATE POLICY "Agencies can update own tour bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies
      WHERE id = bookings.agency_id
      AND user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agencies
      WHERE id = bookings.agency_id
      AND user_id = (select auth.uid())
    )
  );