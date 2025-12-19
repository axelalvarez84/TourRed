/*
  # Agregar campo de precio para mascotas

  1. Cambios
    - Agregar columna `precio_mascota` a la tabla `tours`
      - Tipo: decimal(10,2)
      - Nullable: true
      - Descripción: Precio adicional por mascota si el tour es pet friendly
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'precio_mascota'
  ) THEN
    ALTER TABLE tours ADD COLUMN precio_mascota decimal(10,2);
  END IF;
END $$;