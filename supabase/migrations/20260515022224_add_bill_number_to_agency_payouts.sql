/*
  # Agregar bill_number a agency_payouts

  ## Descripción
  Agrega un campo `bill_number` a la tabla `agency_payouts` que sirve como número
  de factura/referencia único para sincronizar con Zoho Books (bill_number del vendor bill).
  
  ## Cambios
  - `agency_payouts.bill_number` (text, nullable, unique) — referencia de factura proveedor,
    p.ej. "P1", "P2", capturado manualmente al procesar el pago.
  
  ## Notas
  - No se genera automáticamente para mantener control manual del admin.
  - La restricción UNIQUE garantiza que no se repita en Zoho Books.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agency_payouts' AND column_name = 'bill_number'
  ) THEN
    ALTER TABLE agency_payouts ADD COLUMN bill_number text;
    ALTER TABLE agency_payouts ADD CONSTRAINT agency_payouts_bill_number_unique UNIQUE (bill_number);
  END IF;
END $$;
