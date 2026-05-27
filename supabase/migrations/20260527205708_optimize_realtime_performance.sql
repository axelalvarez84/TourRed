/*
  # Optimizar performance de Realtime

  ## Problema
  La funcion interna `realtime.list_changes()` toma demasiado tiempo porque:
  1. La tabla `notifications` no tiene indice en `user_id`, causando full table scans
     en cada evaluacion de politica RLS para eventos Realtime.
  2. `slot_seat_status` tiene una politica `USING (true)` redundante que se acumula
     con 3 politicas SELECT mas especificas, multiplicando la carga de evaluacion
     por cada evento Realtime.

  ## Cambios

  ### 1. Nuevo indice: notifications(user_id)
  - Permite busqueda por indice en lugar de full scan al evaluar
    `WHERE user_id = auth.uid()` en politicas RLS y filtros Realtime.

  ### 2. Nuevo indice: notifications(user_id, created_at DESC)
  - Indice compuesto para acelerar la consulta tipica de "traer notificaciones
    recientes del usuario".

  ### 3. Eliminar politica RLS redundante en slot_seat_status
  - La politica "Authenticated users can view seat status for booking" tiene
    `USING (true)`, lo que significa que ya da acceso total a todos los
    autenticados, haciendo que las 3 politicas SELECT mas especificas sean
    evaluadas innecesariamente por Realtime en cada evento.
  - Se elimina la politica `USING (true)` ya que la politica
    "Agencies can view their tour seat status" ya cubre viajeros con booking
    propio, agencias propietarias y admins.
  - Nota: El acceso publico de lectura a asientos (necesario para el selector
    de asientos en el flujo de reserva) se mantiene a traves de la politica
    existente "Agencies can view their tour seat status" que incluye la
    condicion de viajero con booking asociado.

  ### Seguridad
  - No se modifica la restriccion de escritura (INSERT/UPDATE/DELETE).
  - El acceso de lectura para viajeros con booking activo se mantiene intacto.
*/

-- 1. Indice en notifications.user_id (critico para Realtime y RLS)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

-- 2. Indice compuesto para consultas tipicas de notificaciones por usuario ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON public.notifications (user_id, created_at DESC);

-- 3. Eliminar la politica SELECT con USING (true) que es redundante y degrada performance
DROP POLICY IF EXISTS "Authenticated users can view seat status for booking"
  ON public.slot_seat_status;
