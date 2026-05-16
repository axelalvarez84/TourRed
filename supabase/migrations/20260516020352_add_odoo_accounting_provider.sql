/*
  # Agregar soporte para Odoo como proveedor contable

  1. Cambios en platform_settings
    - `odoo_url` (text) — URL de la instancia Odoo (ej. https://toursred.odoo.com)
    - `odoo_api_key_encrypted` (text) — API key de Odoo (bearer token JSON-2 API)
    - `odoo_database` (text) — Nombre de la base de datos Odoo (header X-Odoo-Database)

  2. Constraint actualizado
    - Se extiende accounting_provider para aceptar 'odoo' además de 'none', 'zoho_books', 'quickbooks'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'odoo_url'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN odoo_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'odoo_api_key_encrypted'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN odoo_api_key_encrypted text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'odoo_database'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN odoo_database text DEFAULT '';
  END IF;
END $$;

-- Actualizar constraint de accounting_provider para incluir odoo
ALTER TABLE platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_accounting_provider_check;

ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_accounting_provider_check
  CHECK (accounting_provider IN ('none', 'zoho_books', 'quickbooks', 'odoo'));
