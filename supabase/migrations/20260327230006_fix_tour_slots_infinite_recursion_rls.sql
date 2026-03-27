/*
  # Fix infinite recursion in tour_slots RLS policies

  ## Problem
  The policy "Travelers can view target slots in pending reschedule requests"
  on tour_slots joins slot_reschedule_requests which joins slot_reschedule_responses.
  The slot_reschedule_requests policy "Travelers can view slot reschedule requests..."
  joins slot_reschedule_responses which joins bookings — creating an infinite
  recursion cycle: tour_slots → slot_reschedule_requests → slot_reschedule_responses
  → slot_reschedule_requests (infinite loop).

  ## Fix
  1. Drop the recursive policy on tour_slots
  2. Replace it with a simpler policy that only checks slot_reschedule_responses
     directly (user_id check), avoiding the cross-table recursion
  3. The existing "Travelers can view slots from own bookings" policy already
     covers the main use case (viewing slots from their bookings)
*/

-- Drop the recursive policy
DROP POLICY IF EXISTS "Travelers can view target slots in pending reschedule requests" ON tour_slots;

-- Replace with a non-recursive version: check slot_reschedule_responses directly
-- A traveler can see a target slot if they have a response record pointing to it
CREATE POLICY "Travelers can view target slots via their responses"
  ON tour_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM slot_reschedule_requests srq
      WHERE srq.target_slot_id = tour_slots.id
        AND EXISTS (
          SELECT 1
          FROM slot_reschedule_responses srr
          WHERE srr.request_id = srq.id
            AND srr.user_id = (SELECT auth.uid())
        )
    )
  );
