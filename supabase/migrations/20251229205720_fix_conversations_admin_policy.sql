/*
  # Corregir política de administradores para conversaciones

  1. Cambios
    - Eliminar la política que causa recursión consultando directamente la tabla users
    - Crear nueva política usando la función is_super_admin() que evita recursión
    - Agregar política para admins con permiso can_manage_messages

  2. Seguridad
    - Solo super admins y admins con permiso específico pueden ver todas las conversaciones
    - Se evita recursión usando funciones SECURITY DEFINER
*/

-- Eliminar la política problemática
DROP POLICY IF EXISTS "Admins can view all conversations" ON conversations;

-- Crear función para verificar permiso de gestionar mensajes
CREATE OR REPLACE FUNCTION public.has_manage_messages_permission()
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
      AND can_manage_messages = true
    );
  END IF;

  RETURN false;
END;
$$;

-- Crear nueva política sin recursión
CREATE POLICY "Admins can view all conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (public.has_manage_messages_permission());