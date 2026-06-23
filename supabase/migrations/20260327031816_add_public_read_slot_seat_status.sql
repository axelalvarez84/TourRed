
CREATE POLICY "Authenticated users can view seat status for booking"
  ON slot_seat_status
  FOR SELECT
  TO authenticated
  USING (true);
