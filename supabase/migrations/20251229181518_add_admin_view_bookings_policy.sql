/*
  # Agregar política para que administradores vean reservas

  1. Cambios
    - Agregar política RLS para que admins con permiso can_manage_travelers puedan ver todas las reservas
    - Esto permite generar estadísticas de viajeros en el panel de administración

  2. Seguridad
    - Solo administradores con el permiso específico pueden ver las reservas
    - Los super admins también tienen acceso completo
*/

-- Crear política para que administradores con permiso puedan ver todas las reservas
CREATE POLICY "Admins with manage travelers permission can view all bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (public.has_manage_travelers_permission());