/*
  # Eliminar función muerta search_tours_by_departure_radius

  ## Descripción
  La función search_tours_by_departure_radius usa tipos y funciones de PostGIS
  (ST_SetSRID, ST_MakePoint, ST_Distance, ST_DWithin) pero referencia la tabla
  `departure_locations` que ya no existe en la base de datos (fue reemplazada por
  `departure_points` que usa coordenadas decimales simples sin tipos geográficos).

  Esta función es código muerto y debe eliminarse antes de mover PostGIS al schema
  `extensions`, ya que el DROP CASCADE de la extensión la eliminaría de todas formas.

  ## Cambios
  - DROP FUNCTION search_tours_by_departure_radius: elimina función que apunta a tabla inexistente
*/

DROP FUNCTION IF EXISTS public.search_tours_by_departure_radius(
  double precision,
  double precision,
  double precision,
  text[],
  text,
  numeric,
  numeric,
  integer
);
