/*
  # Revocar acceso anon de funciones SECURITY DEFINER internas

  ## Problema
  La migración anterior usó REVOKE FROM PUBLIC, pero Supabase auto-otorga EXECUTE
  a los roles 'anon' y 'authenticated' individualmente al crear funciones en el schema
  public. REVOKE FROM PUBLIC elimina el grant genérico pero los grants individuales a
  'anon' persisten. Supabase Security Advisor detecta esto como "Public Can Execute".

  ## Correcciones

  ### Grupo A — Sin acceso externo de ningún tipo (revocar de anon Y authenticated)
  Funciones solo llamadas por: triggers, pg_cron, o desde otras funciones SECURITY
  DEFINER que corren como postgres. Ningún usuario externo las necesita:
    - calculate_executive_platform_commissions  (llamada desde generate_and_notify)
    - create_accounting_entry_for_manual_cfdi   (llamada desde edge function con service_role)
    - generate_executive_platform_commissions   (obsoleta, reemplazada)
    - get_effective_commission_rates (1 y 2 args) (llamadas desde funciones de comisiones)
    - handle_agency_approved                    (trigger function)
    - handle_booking_paid                       (trigger function)
    - handle_tour_published                     (trigger function)
    - notify_executive_by_email                 (helper interno de triggers)
    - process_expired_slot_reschedules          (cron, pg_cron usa superuser)
    - sync_agency_approval_to_user              (trigger function)
    - sync_user_approval_to_agency              (trigger function)

  ### Grupo B — Solo authenticated (revocar anon, conservar authenticated)
  Funciones usadas en RLS policies o llamadas desde React con usuario autenticado:
    - is_admin_with_executive_permission  (condición de RLS en tablas de ejecutivos)
    - get_executive_id_for_user           (condición de RLS en agency_leads etc.)
    - generate_and_notify_platform_commissions (React admin, tiene guard de rol interno)
    - get_garbage_bookings                (React admin, tiene guard de rol interno)

  ### Grupo C — Parches de seguridad adicionales en funciones críticas
  generate_executive_platform_commissions: aunque es obsoleta y se revoca, se le agrega
  un guard de rol admin por defensa en profundidad (belt+suspenders).
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRUPO A: Revocar de anon Y authenticated
-- ═══════════════════════════════════════════════════════════════════════════════

-- Trigger functions
REVOKE EXECUTE ON FUNCTION handle_agency_approved() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_booking_paid() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_tour_published() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_agency_approval_to_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION sync_user_approval_to_agency() FROM anon, authenticated;

-- Helpers internos
REVOKE EXECUTE ON FUNCTION notify_executive_by_email(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION calculate_executive_platform_commissions(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_executive_platform_commissions(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION create_accounting_entry_for_manual_cfdi(uuid) FROM anon, authenticated;

-- Función de cron
REVOKE EXECUTE ON FUNCTION process_expired_slot_reschedules() FROM anon, authenticated;

-- get_effective_commission_rates (ambas variantes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_effective_commission_rates'
      AND n.nspname = 'public' AND p.pronargs = 1
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION get_effective_commission_rates(uuid) FROM anon, authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_effective_commission_rates'
      AND n.nspname = 'public' AND p.pronargs = 2
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION get_effective_commission_rates(uuid, uuid) FROM anon, authenticated';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRUPO B: Revocar de anon solamente, conservar authenticated
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION is_admin_with_executive_permission() FROM anon;
REVOKE EXECUTE ON FUNCTION get_executive_id_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_and_notify_platform_commissions(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION get_garbage_bookings(integer) FROM anon;

-- Re-confirmar grants a authenticated para las funciones del grupo B
-- (por si REVOKE FROM PUBLIC de la migración anterior los afectó)
GRANT EXECUTE ON FUNCTION is_admin_with_executive_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION get_executive_id_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_and_notify_platform_commissions(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_garbage_bookings(integer) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- GRUPO C: Guard de admin en generate_executive_platform_commissions (obsoleta)
-- Defensa en profundidad: aunque está revocada, si alguien re-otorga acceso
-- en el futuro la función misma rechazará usuarios no-admin.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_executive_platform_commissions(
  p_month INTEGER,
  p_year  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings executive_commission_settings%ROWTYPE;
  v_count    INTEGER := 0;
  v_rec      RECORD;
BEGIN
  -- Guard: solo administradores pueden ejecutar esta función
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
  END IF;

  SELECT * INTO v_settings FROM executive_commission_settings WHERE is_current = true LIMIT 1;

  FOR v_rec IN
    SELECT * FROM calculate_executive_platform_commissions(p_month, p_year)
    WHERE NOT already_exists AND commission_amount > 0
  LOOP
    INSERT INTO executive_commissions (
      executive_id,
      agency_id,
      commission_type,
      amount,
      period_month,
      period_year,
      status,
      commission_settings_snapshot
    ) VALUES (
      v_rec.executive_id,
      v_rec.agency_id,
      'platform_period',
      v_rec.commission_amount,
      p_month,
      p_year,
      'pending',
      jsonb_build_object(
        'platform_revenue',      v_rec.platform_revenue,
        'commission_percentage', v_rec.commission_percentage,
        'settings_id',           v_settings.id
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- No GRANT: la función queda accesible solo para postgres (el owner)
