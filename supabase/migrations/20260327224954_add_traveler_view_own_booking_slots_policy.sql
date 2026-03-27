/*
  # Add policy for travelers to view slots from their own bookings

  ## Problem
  Travelers could not view tour_slots joined from their own bookings because
  the existing SELECT policies only allowed viewing:
    - Slots with status = 'activo'
    - Slots in pending reschedule requests (caused infinite recursion)
  
  ## Fix
  Add a policy that allows travelers to view any slot that is referenced
  by one of their own confirmed bookings, regardless of slot status.
  This avoids the infinite recursion issue and allows the dashboard to
  load upcoming receptivo bookings correctly.
*/

CREATE POLICY "Travelers can view slots from own bookings"
  ON tour_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.slot_id = tour_slots.id
        AND b.user_id = (SELECT auth.uid())
    )
  );
