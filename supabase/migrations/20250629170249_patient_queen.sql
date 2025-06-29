/*
  # Add fiscal and banking information to agencies table

  1. New Columns
    - `rfc` - Registro Federal de Contribuyentes
    - `razon_social` - Legal business name
    - `regimen_fiscal` - Tax regime code
    - `domicilio_fiscal` - Tax address
    - `banco` - Bank name
    - `cuenta_clabe` - Bank account number (CLABE)
    - `titular_cuenta` - Account holder name
*/

-- Add fiscal information columns to agencies table
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS rfc text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS razon_social text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS regimen_fiscal text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS domicilio_fiscal text;

-- Add banking information columns to agencies table
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS banco text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS cuenta_clabe text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS titular_cuenta text;

-- Add comment to explain the purpose of these fields
COMMENT ON COLUMN agencies.rfc IS 'Registro Federal de Contribuyentes (RFC) para facturación';
COMMENT ON COLUMN agencies.razon_social IS 'Nombre legal de la empresa para facturación';
COMMENT ON COLUMN agencies.regimen_fiscal IS 'Código del régimen fiscal (ej: 601, 612, 625)';
COMMENT ON COLUMN agencies.domicilio_fiscal IS 'Dirección fiscal completa';
COMMENT ON COLUMN agencies.banco IS 'Nombre del banco para transferencias';
COMMENT ON COLUMN agencies.cuenta_clabe IS 'Número de cuenta CLABE (18 dígitos)';
COMMENT ON COLUMN agencies.titular_cuenta IS 'Nombre del titular de la cuenta bancaria';