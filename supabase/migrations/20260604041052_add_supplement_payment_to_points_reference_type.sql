/*
  # Add supplement_payment to points transactions reference_type constraint

  ## Problem
  The `deduct_points` function passes `p_reference_type = 'supplement_payment'` when
  deducting points for supplement payments. However, the check constraint on
  `toursred_points_transactions.reference_type` does not include 'supplement_payment',
  causing an insert failure and the error "Error al procesar el pago con puntos".

  ## Change
  - Drops the existing `reference_type` check constraint on `toursred_points_transactions`
  - Recreates it with `supplement_payment` added to the allowed values list
*/

ALTER TABLE public.toursred_points_transactions
  DROP CONSTRAINT IF EXISTS toursred_points_transactions_reference_type_check;

ALTER TABLE public.toursred_points_transactions
  ADD CONSTRAINT toursred_points_transactions_reference_type_check
  CHECK (reference_type = ANY (ARRAY[
    'booking'::text,
    'adjustment'::text,
    'promotion'::text,
    'referral'::text,
    'booking_partial_cancellation'::text,
    'supplement_payment'::text
  ]));
