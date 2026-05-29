/*
  # Recuperar penalizaciones de cancelacion existentes

  ## Problema
  La tabla `cancellation_penalty_records` esta vacia aunque ya hubo cancelaciones
  con politica de penalizacion (no_refund / 50_percent). El INSERT en el cliente
  fallo silenciosamente (solo console.error) y no genero los registros correspondientes.

  ## Cambios

  1. INSERT ... SELECT que recupera todos los registros de `booking_cancellations`
     con `cancellation_policy_type IN ('no_refund', '50_percent')` y `amount_to_agency > 0`
     que aun no existen en `cancellation_penalty_records`, insertandolos como `pending`.

  2. Solo inserta los que no tengan ya un registro en `cancellation_penalty_records`
     con el mismo `cancellation_id` (idempotente).
*/

INSERT INTO cancellation_penalty_records (
  booking_id,
  agency_id,
  tour_id,
  cancellation_type,
  cancellation_id,
  cancellation_policy_type,
  original_booking_amount,
  gross_penalty,
  agency_net_amount,
  platform_amount,
  status,
  created_at,
  updated_at
)
SELECT
  bc.booking_id,
  b.agency_id,
  b.tour_id,
  'full'                            AS cancellation_type,
  bc.id                             AS cancellation_id,
  bc.cancellation_policy_type,
  bc.original_deposit_amount        AS original_booking_amount,
  -- gross_penalty = deposito original - reembolso al viajero
  (bc.original_deposit_amount - bc.refund_amount_to_traveler) AS gross_penalty,
  bc.amount_to_agency               AS agency_net_amount,
  bc.amount_to_platform             AS platform_amount,
  'pending'                         AS status,
  bc.created_at,
  now()                             AS updated_at
FROM booking_cancellations bc
JOIN bookings b ON b.id = bc.booking_id
WHERE bc.cancellation_policy_type IN ('no_refund', '50_percent')
  AND bc.amount_to_agency > 0
  -- Solo insertar si no existe ya un registro para esta cancelacion
  AND NOT EXISTS (
    SELECT 1 FROM cancellation_penalty_records cpr
    WHERE cpr.cancellation_id = bc.id
  );
