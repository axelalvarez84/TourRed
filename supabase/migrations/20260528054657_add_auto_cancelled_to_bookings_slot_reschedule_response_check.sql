/*
  # Agregar auto_cancelled al CHECK constraint de bookings.slot_reschedule_response

  Necesario para que process_expired_slot_reschedules() pueda escribir
  'auto_cancelled' en la columna slot_reschedule_response de bookings.
*/

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_slot_reschedule_response_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_slot_reschedule_response_check
  CHECK (slot_reschedule_response = ANY (ARRAY[
    'accepted',
    'rejected',
    'auto_accepted',
    'auto_cancelled',
    'accepted_no_availability',
    'auto_accepted_no_availability'
  ]));
