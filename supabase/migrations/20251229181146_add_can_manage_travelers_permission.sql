/*
  # Agregar permiso para gestionar viajeros

  1. Cambios
    - Agregar columna `can_manage_travelers` a la tabla `admin_permissions`
    - Establecer valor predeterminado como `false`
    - Permitir que el super admin y otros usuarios con este permiso accedan a la sección de viajeros

  2. Notas
    - Los administradores existentes no tendrán este permiso hasta que se les asigne manualmente
    - El super admin siempre tiene acceso completo sin necesidad de permisos específicos
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_travelers'
  ) THEN
    ALTER TABLE admin_permissions 
    ADD COLUMN can_manage_travelers boolean DEFAULT false;
  END IF;
END $$;