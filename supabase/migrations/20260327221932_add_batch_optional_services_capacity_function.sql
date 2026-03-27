/*
  # Crear funcion RPC batch get_optional_services_capacity

  ## Descripcion
  Reemplaza el patron N+1 en BookingForm donde se llamaba a
  get_optional_service_available_capacity una vez por cada servicio opcional.
  Esta nueva funcion recibe un array de IDs y devuelve todas las capacidades
  disponibles en una sola consulta.

  ## Nueva Funcion
  - `get_optional_services_capacity(p_service_ids uuid[])` - Recibe array de
    IDs de servicios opcionales y devuelve una tabla con service_id y
    available_capacity para cada uno.

  ## Impacto
  - Antes: 1 query por cada servicio opcional (5+ queries si hay 5 servicios)
  - Despues: 1 sola query independientemente del numero de servicios
*/

CREATE OR REPLACE FUNCTION public.get_optional_services_capacity(p_service_ids uuid[])
RETURNS TABLE (
  service_id uuid,
  available_capacity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tos.id AS service_id,
    CASE
      WHEN tos.max_capacity IS NULL THEN NULL::integer
      ELSE GREATEST(0, tos.max_capacity - COALESCE(
        (
          SELECT SUM(bos.quantity)
          FROM booking_optional_services bos
          JOIN bookings b ON b.id = bos.booking_id
          WHERE bos.tour_optional_service_id = tos.id
            AND bos.is_cancelled = false
            AND b.status NOT IN ('cancelled')
        ), 0
      )::integer)
    END AS available_capacity
  FROM tour_optional_services tos
  WHERE tos.id = ANY(p_service_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_optional_services_capacity(uuid[]) TO anon, authenticated;
