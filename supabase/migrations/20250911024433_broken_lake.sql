/*
  # Add RNT field to agencies table

  1. Changes
    - Add `rnt` column to agencies table for Registro Nacional de Turismo
    - This field is optional as not all agencies have RNT registration

  2. Security
    - No changes to existing RLS policies needed
    - Field follows same access patterns as other agency fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agencies' AND column_name = 'rnt'
  ) THEN
    ALTER TABLE agencies ADD COLUMN rnt text;
    COMMENT ON COLUMN agencies.rnt IS 'Registro Nacional de Turismo (opcional)';
  END IF;
END $$;