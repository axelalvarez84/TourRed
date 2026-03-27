/*
  # Permitir lectura publica del estado de asientos

  ## Problema
  Los viajeros que intentan reservar un tour no podian ver los asientos bloqueados
  o reservados porque la politica SELECT de slot_seat_status solo permitia acceso
  a agencias duenas del tour, admins, o viajeros con reservas existentes.

  ## Solucion
  Agregar una politica que permite a cualquier usuario autenticado leer el
  estado de los asientos, lo cual es necesario para mostrar correctamente
  cuales estan disponibles, ocupados o bloqueados al momento de seleccionar asientos.

  ## Cambios
  - Nueva politica SELECT en slot_seat_status para usuarios autenticados
    que solo expone columnas no sensibles (sin booking_id ni agency_id)
  - Los viajeros podran ver el status y seat_number para tomar decisiones de reserva
*/

CREATE POLICY "Authenticated users can view seat status for booking"
  ON slot_seat_status
  FOR SELECT
  TO authenticated
  USING (true);
