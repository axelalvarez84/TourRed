/*
  # Agregar proveedor contable interno (Mini ERP ToursRed)

  Agrega 'internal' al constraint CHECK del campo accounting_provider
  en platform_settings para soportar el Mini ERP nativo de la plataforma.
*/

ALTER TABLE platform_settings DROP CONSTRAINT IF EXISTS platform_settings_accounting_provider_check;

ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_accounting_provider_check
  CHECK (accounting_provider IN ('none', 'internal', 'zoho_books', 'odoo', 'quickbooks', 'contpaqi_cloud'));
