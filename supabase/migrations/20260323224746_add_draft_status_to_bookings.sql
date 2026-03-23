/*
  # Add 'draft' status to bookings check constraint

  ## Problem
  The bookings table has a CHECK constraint that only allows:
  pending, confirmed, cancelled, completed, payment_not_received

  The booking form uses 'draft' as an initial status before payment is processed,
  but this value was never added to the constraint, causing insert failures.

  ## Changes
  - Drop the existing bookings_status_check constraint
  - Recreate it including 'draft' as a valid status value
*/

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'pending'::text,
    'confirmed'::text,
    'cancelled'::text,
    'completed'::text,
    'payment_not_received'::text
  ]));
