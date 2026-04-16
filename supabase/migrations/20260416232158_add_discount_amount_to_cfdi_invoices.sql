/*
  # Agregar columna discount_amount a cfdi_invoices

  ## Cambios
  - Nueva columna `discount_amount` (numeric, nullable) en la tabla `cfdi_invoices`
    para almacenar el descuento total aplicado en la factura (con IVA incluido).
    Se usa para reservas con códigos de descuento y para membresías con cupones de Stripe.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cfdi_invoices' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE cfdi_invoices ADD COLUMN discount_amount numeric DEFAULT NULL;
  END IF;
END $$;
