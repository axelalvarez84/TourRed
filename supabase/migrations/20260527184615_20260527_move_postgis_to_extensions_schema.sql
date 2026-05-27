/*
  # Mover extensión PostGIS al schema extensions

  ## Descripción
  PostGIS estaba instalada en el schema `public`, lo que genera dos alertas de seguridad
  en Supabase:
  1. La tabla `spatial_ref_sys` aparece en `public` sin RLS habilitado
  2. Las funciones y tipos de PostGIS quedan expuestos en el schema principal

  La práctica recomendada de Supabase es tener extensiones en el schema `extensions`.

  ## Análisis de impacto
  - Ninguna tabla del proyecto usa columnas de tipo `geography` o `geometry`
  - La única función que usaba PostGIS (`search_tours_by_departure_radius`) fue
    eliminada en la migración anterior porque era código muerto (referenciaba la
    tabla `departure_locations` que ya no existe)
  - El proyecto usa coordenadas como `lat`/`lng` decimales simples, sin tipos geográficos

  ## Cambios
  1. DROP EXTENSION postgis CASCADE: elimina PostGIS y todos sus objetos de `public`
     (tipos, funciones, `spatial_ref_sys`, etc.)
  2. CREATE EXTENSION postgis SCHEMA extensions: reinstala PostGIS limpiamente en
     el schema `extensions`

  ## Resultado
  - La alerta de `spatial_ref_sys sin RLS` desaparece (la tabla se mueve a `extensions`)
  - La alerta de extensión en schema `public` desaparece
  - Zero impacto funcional en el proyecto

  ## Notas
  El CASCADE elimina únicamente objetos propios de PostGIS. No toca ninguna tabla,
  columna o dato de negocio del proyecto.
*/

DROP EXTENSION IF EXISTS postgis CASCADE;

CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
