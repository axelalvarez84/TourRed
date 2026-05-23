/*
  # Agregar aplica_a a support_categories

  ## Cambio
  - Agrega columna `aplica_a text[] DEFAULT '{general,traveler,agency}'` a `support_categories`
  - Permite indicar para qué tipo de usuarios aplica cada categoría
  - Por defecto incluye todos los tipos para no romper registros existentes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_categories' AND column_name = 'aplica_a'
  ) THEN
    ALTER TABLE support_categories ADD COLUMN aplica_a text[] NOT NULL DEFAULT '{general,traveler,agency}';
  END IF;
END $$;
