/*
  # Agregar campos de inclusiones y exclusiones a tours

  1. Cambios en la tabla tours
    - Agregar campo includes (array de texto) para "Qué incluye"
    - Agregar campo excludes (array de texto) para "Qué no incluye"

  2. Notas
    - Estos campos permitirán a las agencias personalizar completamente
      qué incluye y qué no incluye cada tour específico
*/

-- Agregar campos includes y excludes a la tabla tours
ALTER TABLE tours 
ADD COLUMN IF NOT EXISTS includes text[],
ADD COLUMN IF NOT EXISTS excludes text[];

-- Comentarios para documentación
COMMENT ON COLUMN tours.includes IS 'Lista de elementos incluidos en el tour';
COMMENT ON COLUMN tours.excludes IS 'Lista de elementos no incluidos en el tour';