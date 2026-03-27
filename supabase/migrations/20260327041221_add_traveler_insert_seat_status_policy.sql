/*
  # Permitir a viajeros insertar y actualizar estado de asientos al reservar

  ## Problema
  La política INSERT de slot_seat_status solo permitía agencias y admins.
  Cuando un viajero creaba una reserva e intentaba marcar asientos como 'reservado',
  la operación upsert era bloqueada silenciosamente por RLS, dejando los asientos
  sin marcar aunque el booking se creaba correctamente.

  ## Cambios
  - Nueva política INSERT: viajeros autenticados pueden insertar filas de asiento
    siempre que el booking_id referenciado les pertenezca
  - Nueva política UPDATE: viajeros pueden actualizar asientos de sus propias reservas
    (necesario para el upsert cuando el asiento ya existe y hay conflicto)

  ## Seguridad
  - El viajero solo puede insertar asientos vinculados a bookings de su propiedad
  - No puede modificar asientos de otras reservas
*/

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
