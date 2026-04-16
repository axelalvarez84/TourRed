/*
  # Campos fiscales para extranjeros y soporte CFDI de membresías

  ## Resumen
  Esta migración agrega los campos necesarios para emitir CFDIs correctos para
  viajeros extranjeros según las reglas del SAT, y extiende la tabla cfdi_invoices
  para soportar facturas de tipo "membership".

  ## Cambios

  ### Tabla: users
  - `num_reg_id_trib` (text, nullable): Número de registro fiscal en el país de origen
    del viajero extranjero. Permite que deduzca el gasto en su país.
  - `residencia_fiscal` (text, nullable): Clave del país de residencia fiscal según
    catálogo del SAT (ej. "USA", "ESP", "CAN"). Requerido cuando se proporciona
    num_reg_id_trib.

  ### Tabla: cfdi_invoices
  - Actualiza el CHECK constraint de `invoice_type` para incluir 'membership'
  - `membership_id` (uuid, nullable, FK → memberships.id): Vincula la factura a una
    membresía específica de ToursRed Plus.
  - `stripe_invoice_id` (text, nullable): ID del invoice de Stripe, útil para
    identificar el período de una renovación automática e implementar idempotencia.
  - Índice en `membership_id` para consultas eficientes.
  - Política RLS para que el viajero pueda ver sus facturas de membresía.

  ## Seguridad
  - RLS existente en cfdi_invoices cubre el nuevo tipo 'membership' gracias a la
    política por booking_id; se agrega política adicional por membership_id.
  - Los nuevos campos en users solo son actualizables por el propio usuario (RLS
    existente de UPDATE aplica).
*/

-- 1. Agregar campos fiscales para extranjeros en tabla users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'num_reg_id_trib'
  ) THEN
    ALTER TABLE users ADD COLUMN num_reg_id_trib text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'residencia_fiscal'
  ) THEN
    ALTER TABLE users ADD COLUMN residencia_fiscal text;
  END IF;
END $$;

-- 2. Actualizar CHECK constraint de invoice_type en cfdi_invoices para incluir 'membership'
DO $$
BEGIN
  ALTER TABLE cfdi_invoices DROP CONSTRAINT IF EXISTS cfdi_invoices_invoice_type_check;
  ALTER TABLE cfdi_invoices ADD CONSTRAINT cfdi_invoices_invoice_type_check
    CHECK (invoice_type IN ('booking', 'commission', 'membership'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 3. Agregar membership_id a cfdi_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cfdi_invoices' AND column_name = 'membership_id'
  ) THEN
    ALTER TABLE cfdi_invoices ADD COLUMN membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Agregar stripe_invoice_id a cfdi_invoices para idempotencia en renovaciones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cfdi_invoices' AND column_name = 'stripe_invoice_id'
  ) THEN
    ALTER TABLE cfdi_invoices ADD COLUMN stripe_invoice_id text;
  END IF;
END $$;

-- 5. Índice para búsquedas por membership_id
CREATE INDEX IF NOT EXISTS idx_cfdi_invoices_membership_id ON cfdi_invoices(membership_id);

-- 6. Índice para idempotencia por stripe_invoice_id
CREATE INDEX IF NOT EXISTS idx_cfdi_invoices_stripe_invoice_id ON cfdi_invoices(stripe_invoice_id);

-- 7. Política RLS: el viajero puede ver sus propias facturas de membresía
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cfdi_invoices' AND policyname = 'Travelers can view their membership cfdi invoices'
  ) THEN
    CREATE POLICY "Travelers can view their membership cfdi invoices"
      ON cfdi_invoices FOR SELECT
      TO authenticated
      USING (
        membership_id IN (
          SELECT id FROM memberships
          WHERE user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;
