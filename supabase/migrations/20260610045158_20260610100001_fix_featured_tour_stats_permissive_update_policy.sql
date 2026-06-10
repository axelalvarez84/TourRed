/*
  # Prioridad 1: Eliminar política UPDATE permisiva en featured_tour_stats

  La política "authenticated_update_stats" permite que CUALQUIER usuario autenticado
  actualice CUALQUIER fila de estadísticas con USING (true) y WITH CHECK (true).
  
  Esto es incorrecto: las estadísticas solo deben ser actualizadas por procesos
  internos del sistema (edge functions con service_role). La política
  "service_role_all_stats" ya cubre todas las actualizaciones legítimas.
*/

DROP POLICY IF EXISTS "authenticated_update_stats" ON public.featured_tour_stats;
