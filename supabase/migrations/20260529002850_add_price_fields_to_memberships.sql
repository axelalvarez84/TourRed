/*
  # Agregar campos de precio a la tabla memberships

  ## Resumen
  Se agregan dos columnas para registrar los montos reales cobrados a cada suscriptor,
  permitiendo distinguir casos donde hubo descuentos o cambios de precio desde que se
  creó la membresía.

  ## Nuevas columnas en `memberships`
  - `price_paid` (numeric, default 0): Monto exacto cobrado al momento de suscribirse
    (precio inicial, puede incluir descuento de primer pago)
  - `renewal_amount` (numeric, default 0): Monto que se cobra en cada renovación
    recurrente (base para calcular el MRR real)

  ## Backfill de registros existentes
  - Membresías mensuales: $49 en ambas columnas
  - Membresías anuales: $490 en ambas columnas

  ## Notas
  - Los valores hardcodeados son los precios vigentes al momento de la migración
  - Si algún suscriptor tuvo un precio especial, los valores deben ajustarse manualmente
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memberships' AND column_name = 'price_paid'
  ) THEN
    ALTER TABLE memberships ADD COLUMN price_paid numeric DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memberships' AND column_name = 'renewal_amount'
  ) THEN
    ALTER TABLE memberships ADD COLUMN renewal_amount numeric DEFAULT 0;
  END IF;
END $$;

-- Backfill registros existentes con los precios históricos
UPDATE memberships
SET
  price_paid = CASE WHEN plan_type = 'monthly' THEN 49 ELSE 490 END,
  renewal_amount = CASE WHEN plan_type = 'monthly' THEN 49 ELSE 490 END
WHERE price_paid = 0 AND renewal_amount = 0;
