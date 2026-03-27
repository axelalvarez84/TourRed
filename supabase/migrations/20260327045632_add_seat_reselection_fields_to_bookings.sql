/*
  # Agregar campos de re-selección de asientos a bookings

  ## Descripción
  Cuando un viajero acepta un reagendamiento de slot, sus asientos originales
  pueden ya estar ocupados en el nuevo slot. Este campo permite al sistema
  indicarle al viajero que debe seleccionar nuevos asientos.

  ## Cambios
  - `needs_seat_reselection` (boolean): true cuando el viajero aceptó un reagendamiento
    pero sus asientos originales ya no están disponibles en el nuevo slot.
  - `previous_selected_seats` (integer[]): guarda los asientos que tenía originalmente
    como referencia informativa para el viajero.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'needs_seat_reselection'
  ) THEN
    ALTER TABLE bookings ADD COLUMN needs_seat_reselection boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'previous_selected_seats'
  ) THEN
    ALTER TABLE bookings ADD COLUMN previous_selected_seats integer[];
  END IF;
END $$;
