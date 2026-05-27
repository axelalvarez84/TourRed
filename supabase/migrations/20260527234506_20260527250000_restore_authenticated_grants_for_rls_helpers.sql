/*
  # Restaurar permisos EXECUTE a 'authenticated' en funciones helper de RLS

  ## Contexto
  Las funciones helper (is_admin_user, is_conversation_participant, is_super_admin, etc.)
  son invocadas dentro de políticas RLS que se evalúan cuando un usuario 'authenticated'
  accede a las tablas. PostgreSQL requiere que el rol que dispara la política tenga
  EXECUTE sobre las funciones llamadas dentro del USING/WITH CHECK de esa política.

  Por eso aunque no se llamen via .rpc() desde el frontend, 'authenticated' NECESITA
  tener EXECUTE para que las políticas funcionen.

  Lo que SÍ fue correcto en la migración anterior:
  - Revocar 'anon' de todas las funciones (elimina los warnings críticos "Public Can Execute")

  Lo que se debe revertir:
  - Restaurar 'authenticated' en las funciones helper usadas en políticas RLS

  Los warnings "Signed-In Users Can Execute SECURITY DEFINER Function" que quedan
  son informativos — Supabase los reporta por precaución general pero no representan
  un riesgo real cuando las funciones solo leen datos del auth.uid() actual.
*/

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_manage_travelers_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_agency_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._get_user_conversations_internal(uuid) TO authenticated;
