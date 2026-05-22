/*
  # Fix normalize_text function volatility

  ## Problem
  The function public.normalize_text(input text) was defined as VOLATILE (default),
  but it is used inside the unique index idx_departure_points_unique_normalized on
  the departure_points table. PostgreSQL requires all functions used in index
  expressions to be marked IMMUTABLE.

  This VOLATILE marking was blocking the upgrade from PostgreSQL 15 to PostgreSQL 17.

  ## Changes
  - Recreate public.normalize_text as IMMUTABLE
  - The function only uses LOWER, TRIM, and TRANSLATE — all pure text transforms
    with no side effects, no table reads, and no dependency on external state,
    making IMMUTABLE the correct and safe classification.
  - No changes to the index are needed; it continues to work as-is once the
    function is correctly marked.
*/

CREATE OR REPLACE FUNCTION public.normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT LOWER(TRIM(
    TRANSLATE(
      input,
      'áéíóúÁÉÍÓÚñÑ',
      'aeiouAEIOUnN'
    )
  ));
$$;
