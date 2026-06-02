/*
  # Agregar campos de contacto de emergencia y documento a perfil y acompañantes

  ## Cambios

  ### Tabla `users`
  - `emergency_contact_name` (text, nullable) — nombre del contacto de emergencia del viajero
  - `emergency_contact_phone` (text, nullable) — teléfono del contacto de emergencia

  ### Tabla `booking_travelers`
  - `documento_tipo` (text, nullable) — tipo de documento: 'curp' o 'pasaporte'
  - `documento_numero` (text, nullable) — número del documento
  - `emergency_contact_name` (text, nullable) — contacto de emergencia por viajero
  - `emergency_contact_phone` (text, nullable) — teléfono contacto de emergencia

  ### Tabla `frequent_companions`
  - Mismos 4 campos que booking_travelers para pre-llenar en futuras reservas

  ## Notas
  - Todos los campos son opcionales (nullable) para no romper registros existentes
  - Los campos de documento permiten registrar tanto CURP (mexicanos) como pasaporte (extranjeros)
  - Se usan para emitir pólizas de seguro de viajero con Universal Assistance / Assist Card
*/

-- Campos de contacto de emergencia en la tabla users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE users ADD COLUMN emergency_contact_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE users ADD COLUMN emergency_contact_phone text;
  END IF;
END $$;

-- Campos de documento y contacto de emergencia en booking_travelers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'documento_tipo'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN documento_tipo text CHECK (documento_tipo IN ('curp', 'pasaporte'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'documento_numero'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN documento_numero text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN emergency_contact_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN emergency_contact_phone text;
  END IF;
END $$;

-- Campos de documento y contacto de emergencia en frequent_companions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frequent_companions' AND column_name = 'documento_tipo'
  ) THEN
    ALTER TABLE frequent_companions ADD COLUMN documento_tipo text CHECK (documento_tipo IN ('curp', 'pasaporte'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frequent_companions' AND column_name = 'documento_numero'
  ) THEN
    ALTER TABLE frequent_companions ADD COLUMN documento_numero text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frequent_companions' AND column_name = 'emergency_contact_name'
  ) THEN
    ALTER TABLE frequent_companions ADD COLUMN emergency_contact_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frequent_companions' AND column_name = 'emergency_contact_phone'
  ) THEN
    ALTER TABLE frequent_companions ADD COLUMN emergency_contact_phone text;
  END IF;
END $$;
