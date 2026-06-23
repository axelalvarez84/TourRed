
CREATE POLICY "Travelers can insert seat status for their own bookings"
  ON slot_seat_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    booking_id IS NOT NULL AND
    booking_id IN (
      SELECT id FROM bookings WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Travelers can update seat status for their own bookings"
  ON slot_seat_status
  FOR UPDATE
  TO authenticated
  USING (
    booking_id IS NOT NULL AND
    booking_id IN (
      SELECT id FROM bookings WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    booking_id IS NOT NULL AND
    booking_id IN (
      SELECT id FROM bookings WHERE user_id = (SELECT auth.uid())
    )
  );
