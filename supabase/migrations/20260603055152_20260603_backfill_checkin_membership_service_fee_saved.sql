/*
  # Corregir membership_service_fee_saved acumulando ahorro del check-in

  ## Problema
  Cuando se cobra el wallet en check-in y se aplica exención de membresía,
  el ahorro queda registrado en `wallet_checkin_charges.membership_exemption_used`
  pero NO se sumaba a `bookings.membership_service_fee_saved`.
  Resultado: la reserva mostraba solo el ahorro del pago inicial, omitiendo el del check-in.

  ## Cambios
  Para todas las reservas que tienen registros en `wallet_checkin_charges` con
  `membership_exemption_used > 0`, se suma ese valor acumulado a
  `bookings.membership_service_fee_saved`.

  ## Notas
  - Solo afecta reservas donde ya hubo un check-in con exención de membresía
  - Se usa SUM por si hubiera múltiples cobros de check-in en la misma reserva
  - El campo `membership_service_fee_saved` ya tiene el ahorro del pago inicial;
    solo se agrega el delta del check-in
*/

DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT
      wcc.booking_id,
      SUM(wcc.membership_exemption_used) AS total_checkin_exemption
    FROM public.wallet_checkin_charges wcc
    WHERE wcc.membership_exemption_used > 0
    GROUP BY wcc.booking_id
  LOOP
    UPDATE public.bookings
    SET membership_service_fee_saved = COALESCE(membership_service_fee_saved, 0) + v_rec.total_checkin_exemption
    WHERE id = v_rec.booking_id;
  END LOOP;
END $$;
