/*
  # Corregir funciones de exención de membresía para respetar cancel_at_period_end

  ## Problema
  Las funciones get_available_service_fee_exemption y get_remaining_service_fee_exemption
  solo reconocen membresías con status = 'active'. Una membresía con cancel_at_period_end = true
  tiene status = 'active' pero aun puede haber casos donde el status quede como 'cancelled'
  mientras el periodo sigue vigente (current_period_end > now()).

  ## Cambios
  - Ambas funciones ahora también reconocen membresías cuyo current_period_end > now(),
    independientemente del status, siempre que no sean 'expired'.
  - Esto garantiza que un usuario que canceló la renovación automática pero pagó por un
    periodo siga teniendo sus beneficios hasta que ese periodo expire.
*/

CREATE OR REPLACE FUNCTION public.get_available_service_fee_exemption(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exemption_used decimal;
  v_reset_date timestamptz;
  v_membership_id uuid;
BEGIN
  SELECT
    id,
    service_fee_exemption_used,
    service_fee_exemption_reset_date
  INTO
    v_membership_id,
    v_exemption_used,
    v_reset_date
  FROM public.memberships
  WHERE user_id = p_user_id
    AND status <> 'expired'
    AND current_period_end > now()
  ORDER BY current_period_end DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF now() >= v_reset_date THEN
    UPDATE public.memberships
    SET
      service_fee_exemption_used = 0,
      service_fee_exemption_reset_date = date_trunc('month', now() + interval '1 month')
    WHERE id = v_membership_id;

    RETURN 500;
  END IF;

  RETURN GREATEST(0, 500 - v_exemption_used);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_remaining_service_fee_exemption(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exemption_used decimal;
  v_reset_date timestamptz;
BEGIN
  SELECT
    service_fee_exemption_used,
    service_fee_exemption_reset_date
  INTO
    v_exemption_used,
    v_reset_date
  FROM public.memberships
  WHERE user_id = p_user_id
    AND status <> 'expired'
    AND current_period_end > now()
  ORDER BY current_period_end DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF now() >= v_reset_date THEN
    RETURN 500;
  END IF;

  RETURN GREATEST(0, 500 - v_exemption_used);
END;
$function$;
