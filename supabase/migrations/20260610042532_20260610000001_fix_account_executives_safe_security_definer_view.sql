/*
  # Fix account_executives_safe Security Definer View

  La vista account_executives_safe usa SECURITY DEFINER (el default), lo que significa
  que corre con los permisos del owner (superuser) y puede bypassear RLS.
  Se convierte a SECURITY INVOKER para que respete las políticas RLS del usuario que consulta.
*/

CREATE OR REPLACE VIEW public.account_executives_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  first_name,
  last_name,
  email,
  phone,
  is_active,
  notes,
  hired_at,
  terminated_at,
  created_by,
  created_at,
  updated_at,
  facturapi_organization_id,
  facturapi_configured_at,
  tax_regimen_fiscal,
  tax_uso_cfdi,
  tax_withhold_isr,
  tax_name,
  tax_rfc,
  tax_address,
  tax_zip,
  bank_beneficiary,
  bank_name,
  bank_account_number,
  bank_clabe,
  profile_photo_url,
  (facturapi_api_key_encrypted IS NOT NULL) AS facturapi_configured
FROM account_executives;
