/*
  # Agregar política para que administradores vean viajeros

  1. Cambios
    - Crear función para verificar si el usuario tiene permiso can_manage_travelers
    - Agregar política RLS para que admins con este permiso puedan ver usuarios de tipo traveler

  2. Seguridad
    - La función usa SECURITY DEFINER para evitar recursión
    - Solo permite ver usuarios con role = 'traveler'
    - Los administradores solo pueden ver viajeros si tienen el permiso específico
*/

-- Crear función para verificar si el usuario tiene permiso para gestionar viajeros
CREATE OR REPLACE FUNCTION public.has_manage_travelers_permission()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_role text;
  is_admin boolean;
BEGIN
  -- Obtener el rol del usuario actual
  SELECT role, is_super_admin INTO user_role, is_admin
  FROM public.users
  WHERE id = auth.uid();

  -- Si es super admin, tiene todos los permisos
  IF is_admin = true THEN
    RETURN true;
  END IF;

  -- Si es admin regular, verificar permisos específicos
  IF user_role = 'admin' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.admin_permissions
      WHERE user_id = auth.uid()
      AND can_manage_travelers = true
    );
  END IF;

  RETURN false;
END;
$$;

-- Crear política para que administradores con permiso puedan ver viajeros
CREATE POLICY "Admins with permission can view travelers"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    public.has_manage_travelers_permission()
    AND role = 'traveler'
  );