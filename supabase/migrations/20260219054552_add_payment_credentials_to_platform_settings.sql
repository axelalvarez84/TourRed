/*
  # Add payment provider credentials to platform_settings

  ## Changes
  - Adds `paypal_client_secret` column to store PayPal secret key securely in DB
  - Adds `mercadopago_access_token` column to store MercadoPago access token in DB

  ## Purpose
  Allows admins to configure payment provider credentials directly from the admin UI
  instead of requiring manual Supabase secret configuration.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'paypal_client_secret'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN paypal_client_secret text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'mercadopago_access_token'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN mercadopago_access_token text DEFAULT '';
  END IF;
END $$;
