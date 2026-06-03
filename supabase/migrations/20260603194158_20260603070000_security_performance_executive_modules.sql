/*
  # Correcciones de seguridad y performance — módulos ejecutivos y funciones internas

  ## Resumen
  Esta migración aborda todos los warnings del Security Advisor y Performance Advisor
  de Supabase relacionados con el sistema de ejecutivos de cuenta, comisiones, wallet
  check-in y notificaciones.

  ## Correcciones de SEGURIDAD

  ### 1. Revocar EXECUTE de funciones que no deben ser llamadas externamente
  PostgreSQL otorga EXECUTE a PUBLIC por defecto al crear funciones. Se revoca de
  PUBLIC (cubre tanto anon como authenticated) en:
    - Trigger functions: handle_agency_approved, handle_booking_paid, handle_tour_published,
      sync_agency_approval_to_user, sync_user_approval_to_agency
    - Funciones internas (solo llamadas desde otras funciones SECURITY DEFINER):
      notify_executive_by_email, get_effective_commission_rates (ambas versiones),
      calculate_executive_platform_commissions, create_accounting_entry_for_manual_cfdi
    - Función de cron: process_expired_slot_reschedules
    - Función obsoleta: generate_executive_platform_commissions
    - Función de debug eliminada: test_jwt_role (DROP)

  ### 2. Funciones que mantienen GRANT a authenticated
  is_admin_with_executive_permission, get_executive_id_for_user, current_user_has_role,
  _get_user_conversations_internal, get_garbage_bookings, generate_and_notify_platform_commissions.

  ## Correcciones de PERFORMANCE

  ### 3. Auth RLS Initialization Plan (auth.uid() re-evaluado por fila)
  - is_admin_with_executive_permission: cambia auth.uid() interno a (SELECT auth.uid())
  - get_executive_id_for_user: cambia internamente para recibir (SELECT auth.uid()) en callers
  - account_executives "Executives can view own record": user_id = auth.uid() → (SELECT auth.uid())
  - executive_commission_settings "Executives can view": EXISTS con auth.uid() → (SELECT auth.uid())
  - executive_bonus_rules "Executives can view active": EXISTS con auth.uid() → (SELECT auth.uid())

  ### 4. Multiple Permissive Policies (consolidar SELECT/UPDATE para mismo rol)
  Se consolidan en una sola política con condiciones OR para:
    - account_executives: 2 SELECT → 1
    - agency_leads: 2 SELECT → 1; 2 UPDATE → 1
    - executive_bonus_awards: 2 SELECT → 1
    - executive_bonus_rules: 2 SELECT → 1
    - executive_commission_settings: 2 SELECT → 1
    - executive_commissions: 2 SELECT → 1; 2 UPDATE → 1
    - notifications: todas las SELECT → 1 limpia
    - wallet_checkin_charges: 3 SELECT → 1
    - agencies: 2 UPDATE (ejecutivo) → 1
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1: REVOCAR EXECUTE DE FUNCIONES INTERNAS Y DE TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Trigger functions: solo el motor de triggers las llama
REVOKE EXECUTE ON FUNCTION handle_agency_approved() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_booking_paid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_tour_published() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sync_agency_approval_to_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sync_user_approval_to_agency() FROM PUBLIC;

-- Funciones internas: llamadas desde otras SECURITY DEFINER (corren como postgres)
REVOKE EXECUTE ON FUNCTION notify_executive_by_email(jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_effective_commission_rates'
      AND n.nspname = 'public'
      AND p.pronargs = 1
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION get_effective_commission_rates(uuid) FROM PUBLIC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'get_effective_commission_rates'
      AND n.nspname = 'public'
      AND p.pronargs = 2
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION get_effective_commission_rates(uuid, uuid) FROM PUBLIC';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION calculate_executive_platform_commissions(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_accounting_entry_for_manual_cfdi(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION process_expired_slot_reschedules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_executive_platform_commissions(integer, integer) FROM PUBLIC;

DROP FUNCTION IF EXISTS test_jwt_role();


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2: RECREAR is_admin_with_executive_permission CON (SELECT auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_admin_with_executive_permission()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN admin_permissions ap ON ap.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND u.role IN ('admin', 'super_admin')
      AND (u.is_super_admin = true OR ap.can_manage_executives = true)
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin_with_executive_permission() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3: account_executives — consolidar 2 SELECT en 1, fijar auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all account executives" ON account_executives;
DROP POLICY IF EXISTS "Executives can view own record" ON account_executives;

CREATE POLICY "Admins and executives can view account executives"
  ON account_executives FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR user_id = (SELECT auth.uid())
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4: executive_commission_settings — consolidar 2 SELECT en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view commission settings" ON executive_commission_settings;
DROP POLICY IF EXISTS "Executives can view commission settings" ON executive_commission_settings;

CREATE POLICY "Admins and executives can view commission settings"
  ON executive_commission_settings FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR EXISTS (
      SELECT 1 FROM account_executives ae
      WHERE ae.user_id = (SELECT auth.uid()) AND ae.is_active = true
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5: executive_bonus_rules — consolidar 2 SELECT en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can manage bonus rules" ON executive_bonus_rules;
DROP POLICY IF EXISTS "Executives can view active bonus rules" ON executive_bonus_rules;

CREATE POLICY "Admins and executives can view bonus rules"
  ON executive_bonus_rules FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR (
      is_active = true
      AND EXISTS (
        SELECT 1 FROM account_executives ae
        WHERE ae.user_id = (SELECT auth.uid()) AND ae.is_active = true
      )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 6: agency_leads — consolidar 2 SELECT en 1 y 2 UPDATE en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all leads" ON agency_leads;
DROP POLICY IF EXISTS "Executives can view own leads" ON agency_leads;

CREATE POLICY "Admins and executives can view leads"
  ON agency_leads FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR executive_id = get_executive_id_for_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Executives can insert own leads" ON agency_leads;

CREATE POLICY "Executives can insert own leads"
  ON agency_leads FOR INSERT
  TO authenticated
  WITH CHECK (
    executive_id = get_executive_id_for_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Executives can update own leads" ON agency_leads;
DROP POLICY IF EXISTS "Admins can update any lead" ON agency_leads;

CREATE POLICY "Admins and executives can update leads"
  ON agency_leads FOR UPDATE
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR executive_id = get_executive_id_for_user((SELECT auth.uid()))
  )
  WITH CHECK (
    is_admin_with_executive_permission()
    OR executive_id = get_executive_id_for_user((SELECT auth.uid()))
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 7: executive_commissions — consolidar 2 SELECT en 1 y 2 UPDATE en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all executive commissions" ON executive_commissions;
DROP POLICY IF EXISTS "Executives can view own commissions" ON executive_commissions;

CREATE POLICY "Admins and executives can view commissions"
  ON executive_commissions FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR executive_id = get_executive_id_for_user((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Executives can update own commissions to upload CFDI" ON executive_commissions;
DROP POLICY IF EXISTS "Admins can update executive commissions for approval" ON executive_commissions;

CREATE POLICY "Admins and executives can update commissions"
  ON executive_commissions FOR UPDATE
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR (
      executive_id = get_executive_id_for_user((SELECT auth.uid()))
      AND status = 'pending'
    )
  )
  WITH CHECK (
    is_admin_with_executive_permission()
    OR (
      executive_id = get_executive_id_for_user((SELECT auth.uid()))
      AND status IN ('pending', 'invoiced')
    )
  );

DROP POLICY IF EXISTS "System can insert executive commissions" ON executive_commissions;

CREATE POLICY "Admins can insert executive commissions"
  ON executive_commissions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_with_executive_permission());


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 8: executive_bonus_awards — consolidar 2 SELECT en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can view all bonus awards" ON executive_bonus_awards;
DROP POLICY IF EXISTS "Executives can view own bonus awards" ON executive_bonus_awards;

CREATE POLICY "Admins and executives can view bonus awards"
  ON executive_bonus_awards FOR SELECT
  TO authenticated
  USING (
    is_admin_with_executive_permission()
    OR executive_id = get_executive_id_for_user((SELECT auth.uid()))
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 9: notifications — limpiar TODAS las SELECT y crear una sola
-- ═══════════════════════════════════════════════════════════════════════════════

-- Eliminar TODAS las variantes posibles de políticas SELECT existentes
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can view all notifications" ON notifications;
DROP POLICY IF EXISTS "Users and admins can view their notifications" ON notifications;
DROP POLICY IF EXISTS "Users and admins can view notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users can view their own notifications" ON notifications;

CREATE POLICY "Users and admins can view notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 10: wallet_checkin_charges — consolidar 3 SELECT en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Traveler can view own checkin charges" ON wallet_checkin_charges;
DROP POLICY IF EXISTS "Agency can view their checkin charges" ON wallet_checkin_charges;
DROP POLICY IF EXISTS "Admin can view all checkin charges" ON wallet_checkin_charges;

CREATE POLICY "Authorized users can view checkin charges"
  ON wallet_checkin_charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = wallet_checkin_charges.booking_id
        AND b.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM bookings b
      JOIN agencies ag ON ag.id = b.agency_id
      WHERE b.id = wallet_checkin_charges.booking_id
        AND ag.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 11: agencies — consolidar 2 UPDATE de ejecutivos en 1
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Executive can approve own registered agencies" ON agencies;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agencies'
      AND policyname = 'Executives can update their registered agencies'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Executives can update their registered agencies"
        ON agencies FOR UPDATE
        TO authenticated
        USING (
          account_executive_id IN (
            SELECT ae.id FROM account_executives ae
            WHERE ae.user_id = (SELECT auth.uid()) AND ae.is_active = true
          )
        )
        WITH CHECK (
          account_executive_id IN (
            SELECT ae.id FROM account_executives ae
            WHERE ae.user_id = (SELECT auth.uid()) AND ae.is_active = true
          )
        )
    $policy$;
  END IF;
END $$;

-- Consolidar las 2 políticas de storage (admin + ejecutivo → 1 sola)
DROP POLICY IF EXISTS "Admins can upload signed contracts" ON storage.objects;
DROP POLICY IF EXISTS "Executives can upload signed contracts for their agencies" ON storage.objects;

CREATE POLICY "Admins and executives can upload signed contracts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signed-contracts'
    AND (
      is_admin_with_executive_permission()
      OR EXISTS (
        SELECT 1 FROM account_executives ae
        WHERE ae.user_id = (SELECT auth.uid()) AND ae.is_active = true
      )
    )
  );
