/*
  # Soporte de CFDI para cobros wallet en check-in

  ## Cambios
  
  ### Tabla: cfdi_invoices
  - Se agrega el valor 'checkin_wallet' al constraint cfdi_invoices_invoice_type_check
    para permitir registrar facturas de cobros de wallet realizados durante el check-in.
  - Se agrega columna checkin_charge_id (uuid, nullable) con FK a wallet_checkin_charges(id),
    usada para deduplicar y asociar el CFDI al cobro específico de check-in.
  - Se crea índice en checkin_charge_id para búsquedas eficientes.

  ## Notas
  - Los CFDIs de tipo 'checkin_wallet' usan forma de pago "17" (Compensación SAT)
    ya que ToursRed Cash es un saldo interno de plataforma, no un monedero financiero regulado.
  - La factura se emite al momento del cobro, no cuando se genera el saldo.
*/

-- 1. Ampliar el check constraint de invoice_type para incluir 'checkin_wallet'
ALTER TABLE cfdi_invoices
  DROP CONSTRAINT IF EXISTS cfdi_invoices_invoice_type_check;

ALTER TABLE cfdi_invoices
  ADD CONSTRAINT cfdi_invoices_invoice_type_check
  CHECK (invoice_type = ANY (ARRAY[
    'booking'::text,
    'commission'::text,
    'membership'::text,
    'manual'::text,
    'checkin_wallet'::text
  ]));

-- 2. Agregar columna checkin_charge_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cfdi_invoices' AND column_name = 'checkin_charge_id'
  ) THEN
    ALTER TABLE cfdi_invoices
      ADD COLUMN checkin_charge_id uuid NULL
        REFERENCES wallet_checkin_charges(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Índice para búsquedas de deduplicación por cobro de check-in
CREATE INDEX IF NOT EXISTS idx_cfdi_invoices_checkin_charge_id
  ON cfdi_invoices (checkin_charge_id)
  WHERE checkin_charge_id IS NOT NULL;
