/*
  # Agregar service_role_key a email_settings

  Permite que funciones SQL del cron puedan invocar edge functions
  via net.http_post sin depender de app.settings (que requiere ALTER DATABASE).

  La columna se llama internal_service_key y solo es accesible por service_role.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_settings' AND column_name = 'internal_service_key'
  ) THEN
    ALTER TABLE email_settings ADD COLUMN internal_service_key text;
  END IF;
END $$;
