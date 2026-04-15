/*
  # Agregar campo platform_commission_amount a agency_payouts

  ## Cambios
  - Agrega columna `platform_commission_amount` para registrar cuanto cobro la plataforma
  - Este es el monto que se factura a la agencia (el CFDI de comision)
  - `amount` y `net_amount` siguen siendo el ingreso neto que recibe la agencia
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agency_payouts' AND column_name = 'platform_commission_amount'
  ) THEN
    ALTER TABLE agency_payouts ADD COLUMN platform_commission_amount numeric DEFAULT 0;
  END IF;
END $$;
