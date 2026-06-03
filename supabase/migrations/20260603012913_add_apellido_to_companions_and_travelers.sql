/*
  # Agregar campo apellido a acompañantes frecuentes y viajeros de reserva

  ## Cambios
  - Agrega columna `apellido` (text, nullable) a `frequent_companions`
  - Agrega columna `apellido` (text, nullable) a `booking_travelers`

  ## Notas
  - Las columnas son nullable para no romper datos existentes
  - El apellido se capturará ahora de forma separada al nombre en el formulario
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frequent_companions' AND column_name = 'apellido'
  ) THEN
    ALTER TABLE frequent_companions ADD COLUMN apellido text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'apellido'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN apellido text;
  END IF;
END $$;
