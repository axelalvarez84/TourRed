/*
  # Corregir exención de membresía en reservas con aprobación automática

  ## Problema
  Las reservas pagadas completamente con ToursRed Points y/o ToursRed Cash
  (aprobación automática sin pasar por Stripe) no actualizaban el campo
  `service_fee_exemption_used` en la tabla `memberships`. El viajero veía
  su límite mensual intacto aunque ya hubiera usado parte de la exención.

  ## Cambios
  - Para cada booking confirmado con método de pago `toursred_cash`,
    `toursred_points` o `toursred_points_and_cash` donde:
      - `used_membership_benefit = false`
      - El viajero tiene membresía activa con `status = 'active'`
      - La exención usada calculada (fullServiceCharge - actualServiceCharge - codeDiscount) > 0
  - Se acumula esa exención en `memberships.service_fee_exemption_used`
  - Se marca el booking con `used_membership_benefit = true`

  ## Notas
  - Se usa la tasa del 5% como fallback si no hay registro en platform_settings
  - No se toca ningún monto monetario de bookings ni membresías, solo el contador de exención
*/

DO $$
DECLARE
  v_service_charge_rate numeric;
  v_rec record;
  v_full_service_charge numeric;
  v_actual_service_charge numeric;
  v_code_discount numeric;
  v_exemption_used numeric;
  v_membership_id uuid;
  v_current_exemption_used numeric;
BEGIN
  -- Obtener tasa de cargo por servicio configurada
  SELECT COALESCE(service_charge_percentage, 5)
  INTO v_service_charge_rate
  FROM public.platform_settings
  LIMIT 1;

  IF v_service_charge_rate IS NULL THEN
    v_service_charge_rate := 5;
  END IF;

  -- Iterar sobre reservas afectadas
  FOR v_rec IN
    SELECT
      b.id AS booking_id,
      b.user_id,
      b.total_price,
      b.service_charge,
      b.service_charge_discount
    FROM public.bookings b
    WHERE b.status = 'confirmed'
      AND b.payment_status = 'succeeded'
      AND b.payment_method IN ('toursred_cash', 'toursred_points', 'toursred_points_and_cash')
      AND (b.used_membership_benefit IS NULL OR b.used_membership_benefit = false)
      AND EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = b.user_id
          AND m.status = 'active'
      )
  LOOP
    v_full_service_charge   := (COALESCE(v_rec.total_price, 0) * v_service_charge_rate) / 100;
    v_actual_service_charge := COALESCE(v_rec.service_charge::numeric, 0);
    v_code_discount         := COALESCE(v_rec.service_charge_discount::numeric, 0);
    v_exemption_used        := v_full_service_charge - v_actual_service_charge - v_code_discount;

    IF v_exemption_used > 0 THEN
      -- Buscar membresía activa del viajero
      SELECT id, service_fee_exemption_used
      INTO v_membership_id, v_current_exemption_used
      FROM public.memberships
      WHERE user_id = v_rec.user_id
        AND status = 'active'
      ORDER BY current_period_end DESC
      LIMIT 1;

      IF v_membership_id IS NOT NULL THEN
        UPDATE public.memberships
        SET service_fee_exemption_used = COALESCE(v_current_exemption_used, 0) + v_exemption_used
        WHERE id = v_membership_id;
      END IF;

      -- Marcar booking para no procesarlo dos veces
      UPDATE public.bookings
      SET used_membership_benefit = true
      WHERE id = v_rec.booking_id;
    END IF;
  END LOOP;
END $$;
