/*
  # Agregar campo points_earned_at_checkin a bookings

  ## Descripcion
  Agrega la columna `points_earned_at_checkin` a la tabla `bookings` para registrar
  los puntos ToursRed acreditados al viajero cuando paga el saldo pendiente de su
  reserva con ToursRed Cash durante el check-in.

  Este campo es independiente de `points_earned` (que registra los puntos del pago
  inicial en checkout) y permite un registro auditado de puntos por tipo de pago.

  ## Cambios
  - `bookings`: nueva columna `points_earned_at_checkin` (integer, default 0)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'points_earned_at_checkin'
  ) THEN
    ALTER TABLE bookings ADD COLUMN points_earned_at_checkin integer NOT NULL DEFAULT 0;
  END IF;
END $$;
