/*
  # Corregir RLS de tour_slots para permitir lectura desde reagendamientos de slots

  ## Problema
  Cuando un viajero consulta slot_reschedule_responses con un JOIN a
  slot_reschedule_requests y luego a tour_slots, la query falla con error 42P17
  (infinite recursion o policy not found). El problema es que las políticas
  actuales de tour_slots para viajeros solo permiten ver slots con
  status = 'activo', pero el slot destino de un reagendamiento puede tener
  cualquier status (por ejemplo 'disponible' en tours receptivos).

  ## Solución
  Agregar una política que permita a los viajeros autenticados ver cualquier
  tour_slot que sea el destino de un reagendamiento pendiente que les afecta.

  ## Nueva Política
  - `Travelers can view target slots in pending reschedule requests` en
    tour_slots FOR SELECT: permite ver slots que son el target_slot_id de
    un slot_reschedule_request que tiene respuestas para el usuario actual.
*/

CREATE POLICY "Travelers can view target slots in pending reschedule requests"
  ON tour_slots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM slot_reschedule_requests srq
      JOIN slot_reschedule_responses srr ON srr.request_id = srq.id
      WHERE srq.target_slot_id = tour_slots.id
        AND srr.user_id = (SELECT auth.uid())
    )
  );
