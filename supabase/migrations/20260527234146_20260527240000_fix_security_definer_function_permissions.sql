/*
  # Fix Security Advisor warnings — SECURITY DEFINER function permissions

  ## Problema
  Dos categorías de warnings en Security Advisor:

  1. "Public Can Execute SECURITY DEFINER Function" (CRÍTICO)
     _get_user_conversations_internal, get_user_conversations y current_user_has_role
     tienen permiso EXECUTE para el rol 'anon' (usuarios no autenticados).
     Esto fue introducido accidentalmente al recrear las funciones con DROP+CREATE,
     ya que PostgreSQL hereda permisos del esquema por defecto (incluye anon en Supabase).

  2. "Signed-In Users Can Execute SECURITY DEFINER Function" (MENOR)
     Funciones helper de RLS (is_admin_user, is_conversation_participant, is_super_admin,
     has_manage_travelers_permission, get_current_user_agency_id, current_user_is_admin,
     current_user_has_role) tienen EXECUTE para 'authenticated'.
     Solo get_user_conversations se llama via .rpc() desde el frontend.
     Las demás solo se usan internamente en políticas RLS y no necesitan el grant a 'authenticated'.

  ## Solución
  - Revocar 'anon' de todas las funciones que lo tienen (elimina warnings críticos)
  - Revocar 'authenticated' de funciones que no son llamadas via RPC desde el cliente
    (elimina warnings menores, no afecta funcionalidad porque las políticas RLS
     se evalúan en contexto postgres/service_role, no en contexto del usuario)
  - Mantener 'authenticated' solo en get_user_conversations() que sí es RPC pública

  ## Sin impacto en funcionalidad
  Las políticas RLS que invocan estas funciones son evaluadas por el planificador
  de PostgreSQL en contexto del owner de la función (SECURITY DEFINER), no requieren
  que el rol 'authenticated' tenga EXECUTE explícito sobre las funciones helper.
*/

-- ============================================================
-- PASO 1: Revocar 'anon' de todas las funciones que lo tienen
--         (elimina los 3 warnings "Public Can Execute")
-- ============================================================

REVOKE EXECUTE ON FUNCTION public._get_user_conversations_internal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_conversations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(text[]) FROM anon;

-- ============================================================
-- PASO 2: Revocar 'authenticated' de funciones helper internas
--         que solo se usan en políticas RLS, no via RPC cliente
--         (elimina los warnings "Signed-In Users Can Execute")
-- ============================================================

-- is_admin_user() — solo usada en políticas RLS de conversations y message_participants
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM authenticated;

-- is_conversation_participant() — solo usada en política RLS de message_participants
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid) FROM authenticated;

-- is_super_admin() — solo usada en políticas RLS internas
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM authenticated;

-- has_manage_travelers_permission() — solo usada en políticas RLS
REVOKE EXECUTE ON FUNCTION public.has_manage_travelers_permission() FROM authenticated;

-- get_current_user_agency_id() — solo usada en políticas RLS
REVOKE EXECUTE ON FUNCTION public.get_current_user_agency_id() FROM authenticated;

-- current_user_is_admin() — solo usada en políticas RLS
REVOKE EXECUTE ON FUNCTION public.current_user_is_admin() FROM authenticated;

-- current_user_has_role() — solo usada en políticas RLS
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(text[]) FROM authenticated;

-- ============================================================
-- PASO 3: Mantener 'authenticated' SOLO en get_user_conversations
--         que es la única llamada via .rpc() desde el frontend
-- ============================================================
-- (ya tiene authenticated=X, no se modifica)

-- Verificación: _get_user_conversations_internal tampoco debe ser accesible
-- desde el cliente (es función interna, el cliente solo llama get_user_conversations)
REVOKE EXECUTE ON FUNCTION public._get_user_conversations_internal(uuid) FROM authenticated;
