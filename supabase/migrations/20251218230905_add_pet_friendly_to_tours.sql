/*
  # Agregar campo Pet Friendly a tours

  1. Cambios
    - Agregar columna `pet_friendly` a la tabla `tours`
      - Tipo: boolean
      - Default: false
      - Indica si el tour admite mascotas
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'pet_friendly'
  ) THEN
    ALTER TABLE tours ADD COLUMN pet_friendly boolean DEFAULT false NOT NULL;
  END IF;
END $$;