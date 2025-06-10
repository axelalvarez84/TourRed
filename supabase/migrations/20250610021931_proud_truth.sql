/*
  # Preparación para Usuario Administrador

  1. Documentación
    - Instrucciones para crear usuario administrador
    - UUID reservado para el administrador

  2. Notas
    - El usuario debe crearse manualmente en Supabase Auth Dashboard
    - O usando la función de registro de la aplicación

  INSTRUCCIONES PARA CREAR USUARIO ADMINISTRADOR:

  Opción 1 - Desde Supabase Dashboard:
  1. Ve a Authentication → Users en Supabase Dashboard
  2. Crea un nuevo usuario con:
     - Email: admin@tourred.com
     - Password: Admin123!
     - User ID: 00000000-0000-0000-0000-000000000001
     - User Metadata: {"role": "admin"}
  3. El perfil se creará automáticamente en public.users

  Opción 2 - Desde la aplicación:
  1. Ve a /signup en la aplicación
  2. Registra un usuario con:
     - Email: admin@tourred.com
     - Password: Admin123!
     - Nombre: Super
     - Apellido: Admin
  3. Después del registro, actualiza el rol en la base de datos:
     UPDATE public.users SET role = 'admin' WHERE email = 'admin@tourred.com';
*/

-- Crear una vista para verificar si existe un administrador
CREATE OR REPLACE VIEW admin_status AS
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.users WHERE role = 'admin') 
    THEN 'Administrador configurado'
    ELSE 'Administrador pendiente de configuración'
  END as status,
  COUNT(*) FILTER (WHERE role = 'admin') as admin_count
FROM public.users;

-- Comentario en la tabla users para documentar el proceso
COMMENT ON TABLE public.users IS 'Tabla de perfiles de usuario. Para crear el administrador inicial, usar Supabase Auth Dashboard o la función de registro de la app.';

-- Función helper para verificar el estado del administrador
CREATE OR REPLACE FUNCTION check_admin_status()
RETURNS TABLE(
  has_admin boolean,
  admin_count bigint,
  instructions text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXISTS(SELECT 1 FROM public.users WHERE role = 'admin') as has_admin,
    COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
    CASE 
      WHEN EXISTS(SELECT 1 FROM public.users WHERE role = 'admin') 
      THEN 'Administrador ya configurado'
      ELSE 'Crear usuario admin@tourred.com en Supabase Auth Dashboard con metadata {"role": "admin"}'
    END as instructions
  FROM public.users;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar verificación inicial
SELECT * FROM check_admin_status();