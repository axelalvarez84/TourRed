/*
  # Indices para FK en segunda posicion de indices compuestos

  ## Problema
  El Performance Advisor de Supabase requiere que cada columna FK tenga un
  indice donde sea la PRIMERA columna. Las tablas afectadas ya tienen indices
  compuestos donde la columna FK aparece en segunda posicion, lo cual no es
  suficiente para lookups directos por esa columna.

  ## Tablas y columnas cubiertas (14 indices nuevos en 7 tablas)

  1. batch_payouts
     - batch_id: primera en compuesto (batch_id, payout_id) pero sin indice individual
     - payout_id: segunda en compuesto (batch_id, payout_id) — sin cobertura individual

  2. booking_reschedule_responses
     - booking_id: primera en compuesto pero sin indice individual dedicado
     - tour_reschedule_id: segunda en compuesto — sin cobertura individual

  3. discount_code_usage
     - discount_code_id: primera en compuesto pero sin indice individual
     - user_id: segunda en compuesto — sin cobertura individual

  4. message_participants
     - conversation_id: primera en compuesto pero sin indice individual
     - user_id: segunda en compuesto — sin cobertura individual

  5. saved_tours
     - user_id: primera en compuesto pero sin indice individual
     - tour_id: segunda en compuesto — sin cobertura individual

  6. tour_departure_points
     - tour_id: primera en compuesto pero sin indice individual
     - departure_point_id: segunda en compuesto — sin cobertura individual

  7. tour_destinations
     - tour_id: parte del PK compuesto pero sin indice individual
     - destination_id: segunda en PK compuesto — sin cobertura individual

  ## Notas
  - Solo se crean indices nuevos, no se modifica ni elimina ninguno existente
  - CREATE INDEX IF NOT EXISTS garantiza idempotencia
*/

-- ============================================================
-- batch_payouts
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_batch_payouts_batch_id
  ON public.batch_payouts (batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_payouts_payout_id
  ON public.batch_payouts (payout_id);

-- ============================================================
-- booking_reschedule_responses
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_responses_booking_id
  ON public.booking_reschedule_responses (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_responses_tour_reschedule_id
  ON public.booking_reschedule_responses (tour_reschedule_id);

-- ============================================================
-- discount_code_usage
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_discount_code_usage_discount_code_id
  ON public.discount_code_usage (discount_code_id);

CREATE INDEX IF NOT EXISTS idx_discount_code_usage_user_id
  ON public.discount_code_usage (user_id);

-- ============================================================
-- message_participants
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_message_participants_conversation_id
  ON public.message_participants (conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_participants_user_id
  ON public.message_participants (user_id);

-- ============================================================
-- saved_tours
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_saved_tours_user_id
  ON public.saved_tours (user_id);

CREATE INDEX IF NOT EXISTS idx_saved_tours_tour_id
  ON public.saved_tours (tour_id);

-- ============================================================
-- tour_departure_points
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tour_departure_points_tour_id
  ON public.tour_departure_points (tour_id);

CREATE INDEX IF NOT EXISTS idx_tour_departure_points_departure_point_id
  ON public.tour_departure_points (departure_point_id);

-- ============================================================
-- tour_destinations
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tour_destinations_tour_id
  ON public.tour_destinations (tour_id);

CREATE INDEX IF NOT EXISTS idx_tour_destinations_destination_id
  ON public.tour_destinations (destination_id);
