/*
  # Agregar política para que administradores vean membresías

  1. Cambios
    - Agregar política RLS para que admins con permiso can_manage_travelers puedan ver todas las membresías
    - Esto permite mostrar información de membresías de viajeros en el panel de administración

  2. Seguridad
    - Solo administradores con el permiso específico pueden ver las membresías
    - Los super admins también tienen acceso completo
*/

-- Crear política para que administradores con permiso puedan ver todas las membresías
CREATE POLICY "Admins with manage travelers permission can view all memberships"
  ON memberships
  FOR SELECT
  TO authenticated
  USING (public.has_manage_travelers_permission());