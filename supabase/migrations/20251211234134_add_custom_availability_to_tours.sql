/*
  # Agregar disponibilidad personalizada a tours

  1. Cambios
    - Agregar campo `available_spots` a la tabla `tours`
      - Campo opcional (nullable) de tipo integer
      - Permite a las agencias controlar manualmente cuántos lugares están disponibles
      - Si no está configurado, se usa `max_travelers` como antes
      - Si está configurado, prevalece sobre `max_travelers` para la disponibilidad real

  2. Notas
    - Este campo es independiente de `max_travelers`
    - Útil cuando la agencia tiene restricciones adicionales (hoteles, transporte, etc.)
    - La agencia puede ajustarlo en cualquier momento desde su panel
*/

-- Agregar campo available_spots a tours
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'available_spots'
  ) THEN
    ALTER TABLE tours ADD COLUMN available_spots integer;
    
    -- Comentario explicativo
    COMMENT ON COLUMN tours.available_spots IS 'Número de lugares disponibles personalizado por la agencia. Si es NULL, se usa max_travelers.';
  END IF;
END $$;