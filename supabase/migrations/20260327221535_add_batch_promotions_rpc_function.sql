/*
  # Crear funcion RPC batch get_promotions_for_tours

  ## Descripcion
  Reemplaza el patron N+1 donde cada TourCard llamaba individualmente a
  get_active_promotion_for_tour. Esta nueva funcion recibe un array de IDs
  de tours y devuelve todas las promociones activas en una sola consulta,
  reduciendo drasticamente el numero de requests a Supabase.

  ## Nueva Funcion
  - `get_promotions_for_tours(p_tour_ids uuid[])` - Recibe array de tour IDs,
    devuelve tabla con tour_id y datos de la promocion activa para cada tour.
    Usa la misma logica de filtrado que get_active_promotion_for_tour pero
    para multiples tours a la vez (DISTINCT ON garantiza 1 resultado por tour).

  ## Impacto en Egress
  - Antes: 1 query por cada TourCard visible (20-30 queries por pagina)
  - Despues: 1 sola query por carga de pagina
*/

CREATE OR REPLACE FUNCTION public.get_promotions_for_tours(p_tour_ids uuid[])
RETURNS TABLE (
  tour_id uuid,
  id uuid,
  promotion_type text,
  min_travelers integer,
  group_size integer,
  pay_count integer,
  fixed_group_price numeric,
  group_discount_percentage numeric,
  valid_from date,
  valid_until date,
  max_uses integer,
  times_used integer,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (tp.tour_id)
    tp.tour_id,
    tp.id,
    tp.promotion_type::text,
    tp.min_travelers,
    tp.group_size,
    tp.pay_count,
    tp.fixed_group_price,
    tp.group_discount_percentage,
    tp.valid_from::date,
    tp.valid_until::date,
    tp.max_uses,
    tp.times_used,
    tp.is_active
  FROM tour_promotions tp
  WHERE
    tp.tour_id = ANY(p_tour_ids)
    AND tp.is_active = true
    AND (tp.valid_from IS NULL OR tp.valid_from::date <= CURRENT_DATE)
    AND (tp.valid_until IS NULL OR tp.valid_until::date >= CURRENT_DATE)
    AND (tp.max_uses IS NULL OR tp.times_used < tp.max_uses)
  ORDER BY tp.tour_id, tp.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_promotions_for_tours(uuid[]) TO anon, authenticated;
