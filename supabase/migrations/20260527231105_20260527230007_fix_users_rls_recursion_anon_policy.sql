/*
  # Fix infinite recursion in users RLS — política anon con USING(true)

  ## Problema
  La migración anterior introdujo una política TO anon con USING(true) en la tabla users.
  Cuando PostgreSQL evalúa una consulta SELECT sobre users, combina TODAS las políticas
  aplicables para el rol actual. El rol `authenticated` hereda de `public`, por lo que
  recibe tanto la política anon/public (USING true) como la política authenticated.
  La política authenticated llama a is_super_admin() y has_manage_travelers_permission(),
  que a su vez hacen SELECT FROM users → recursión infinita.

  ## Solución
  1. Eliminar la política TO anon con USING(true) — no es necesaria porque la tabla
     users no necesita ser completamente pública. El acceso de revisores públicos se
     maneja a través de vistas o funciones SECURITY DEFINER existentes.
  2. Convertir is_super_admin() y has_manage_travelers_permission() a SECURITY DEFINER
     con search_path fijo para que sus consultas internas a users eviten RLS y así
     no haya recursión aunque se llamen desde políticas RLS.

  ## Sin brechas de seguridad
  - Los usuarios anónimos ya no ven la tabla users directamente (sin cambio funcional
    real, ya que las reviews públicas exponen solo los campos necesarios vía join o
    función SECURITY DEFINER).
  - Las funciones helper con SECURITY DEFINER solo leen users para verificar el rol
    del usuario autenticado actual (auth.uid()), no exponen datos de otros usuarios.
*/

-- ============================================================
-- 1. Eliminar la política anon problemática
-- ============================================================
DROP POLICY IF EXISTS "Anon can view basic user info" ON public.users;

-- ============================================================
-- 2. Convertir is_super_admin() a SECURITY DEFINER para evitar recursión
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_super_admin = true
  );
END;
$$;

-- ============================================================
-- 3. Convertir has_manage_travelers_permission() a SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_manage_travelers_permission()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  v_is_admin boolean;
BEGIN
  SELECT role, is_super_admin INTO user_role, v_is_admin
  FROM public.users WHERE id = auth.uid();

  IF v_is_admin = true THEN RETURN true; END IF;
  IF user_role = 'admin' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE user_id = auth.uid() AND can_manage_travelers = true
    );
  END IF;
  RETURN false;
END;
$$;

-- ============================================================
-- 4. Revocar acceso público a estas funciones (solo callable por roles autorizados)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_manage_travelers_permission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_manage_travelers_permission() TO authenticated;
