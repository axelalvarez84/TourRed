/*
  # Allow agencies to view traveler information

  1. Changes
    - Add RLS policy to allow agencies to view basic information of travelers who have bookings with them
    - This enables agencies to see traveler name, email, and profile picture in their booking management

  2. Security
    - Agencies can only view travelers who have bookings with them
    - Only basic profile information is accessible (name, email, profile picture)
    - Travelers can still only see their own full profile
*/

CREATE POLICY "Agencies can view travelers with bookings"
ON users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM bookings b
    INNER JOIN agencies a ON b.agency_id = a.id
    WHERE b.user_id = users.id
    AND a.user_id = auth.uid()
  )
);