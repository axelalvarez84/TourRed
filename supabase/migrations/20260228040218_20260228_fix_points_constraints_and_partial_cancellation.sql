/*
  # Fix Points Constraints and Partial Cancellation Deduction

  ## Problem
  1. The `toursred_points_transactions` table has CHECK constraints that don't allow
     `type = 'partial_cancellation'` or `reference_type = 'booking_partial_cancellation'`,
     so the `deduct_points_for_partial_cancellation` function always fails silently.

  2. The partial cancellation for booking TRG-ME6232SKDW2 never deducted 1,000 points.

  ## Changes
  1. Expand `type` CHECK constraint to include `partial_cancellation`
  2. Expand `reference_type` CHECK constraint to include `booking_partial_cancellation`
  3. Apply the missing 1,000 point deduction for the affected booking
  4. Update `points_earned` on the booking from 3,000 to 2,000
*/

-- 1. Expand the type constraint
ALTER TABLE toursred_points_transactions
  DROP CONSTRAINT IF EXISTS toursred_points_transactions_type_check;

ALTER TABLE toursred_points_transactions
  ADD CONSTRAINT toursred_points_transactions_type_check
  CHECK (type = ANY (ARRAY['earned','redeemed','expired','refund','adjustment','partial_cancellation']));

-- 2. Expand the reference_type constraint
ALTER TABLE toursred_points_transactions
  DROP CONSTRAINT IF EXISTS toursred_points_transactions_reference_type_check;

ALTER TABLE toursred_points_transactions
  ADD CONSTRAINT toursred_points_transactions_reference_type_check
  CHECK (reference_type = ANY (ARRAY['booking','adjustment','promotion','referral','booking_partial_cancellation']));

-- 3. Apply missing deduction for TRG-ME6232SKDW2
DO $$
DECLARE
  v_wallet_id uuid := '0656da12-0a98-48dc-9f89-7ec77c06e870';
  v_user_id uuid := '0ca4686b-6291-40d1-8410-08daadde0f94';
  v_partial_cancellation_id uuid := '326b9106-28bf-4e96-9222-3c8dac4ee941';
  v_booking_id uuid := 'fca4c838-ff8d-4edc-b7fa-59569c923132';
  v_points_to_deduct integer := 1000;
  v_new_balance integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM toursred_points_transactions
    WHERE reference_id = v_partial_cancellation_id
    AND type = 'partial_cancellation'
  ) THEN
    UPDATE toursred_points_wallets
    SET balance = balance - v_points_to_deduct,
        total_used = total_used + v_points_to_deduct,
        updated_at = now()
    WHERE id = v_wallet_id
    RETURNING balance INTO v_new_balance;

    INSERT INTO toursred_points_transactions (
      wallet_id, user_id, amount, balance_after, type,
      description, reference_id, reference_type
    ) VALUES (
      v_wallet_id, v_user_id, -v_points_to_deduct, v_new_balance,
      'partial_cancellation',
      'Ajuste de puntos por cancelación parcial de viajero(s)',
      v_partial_cancellation_id,
      'booking_partial_cancellation'
    );

    UPDATE bookings
    SET points_earned = 2000
    WHERE id = v_booking_id;
  END IF;
END $$;
