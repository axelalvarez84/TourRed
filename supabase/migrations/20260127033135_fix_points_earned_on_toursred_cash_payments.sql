/*
  # Fix Points Earned on ToursRed Cash Payments
  
  ## Problem
  When users pay with ToursRed Cash, they should earn points on that amount.
  Currently the calculation was subtracting the points value from toursred_cash_used,
  but this is incorrect because:
  - toursred_cash_used should only contain the actual ToursRed Cash amount
  - Points earned should be based on ToursRed Cash spent (not Stripe payments)
  
  ## Fix
  Update award_points_for_booking to award points based on ToursRed Cash spent:
  - Points are earned on money from the ToursRed Cash wallet
  - Points are NOT earned on points used (you can't earn points by spending points)
  - Stripe payments should not be included since they're handled by the webhook
  
  ## Example
  - User pays with 1042 points ($10.42) + $354.16 ToursRed Cash = $375 total
  - Should earn: 354 points (based on $354.16 ToursRed Cash)
  - Should NOT earn points on: points used or Stripe payment
*/

DROP FUNCTION IF EXISTS award_points_for_booking(uuid, uuid, numeric, integer, numeric);

CREATE OR REPLACE FUNCTION award_points_for_booking(
  p_booking_id uuid,
  p_user_id uuid,
  p_user_payment numeric,
  p_points_used integer DEFAULT 0,
  p_toursred_cash_used numeric DEFAULT 0
)
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_wallet_id uuid;
  v_points_to_award integer;
  v_new_balance integer;
  v_expires_at timestamptz;
  v_has_active_membership boolean;
BEGIN
  -- Check if user has active membership
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end > now()
  ) INTO v_has_active_membership;

  -- Only award points if membership is active
  IF NOT v_has_active_membership THEN
    RETURN 0;
  END IF;

  -- Get or create wallet
  v_wallet_id := get_or_create_points_wallet(p_user_id);

  -- Award points ONLY on ToursRed Cash spent (not on points used or Stripe)
  -- 1 peso from ToursRed Cash = 1 point earned
  v_points_to_award := FLOOR(p_toursred_cash_used)::integer;

  -- If no points to award, return 0
  IF v_points_to_award <= 0 THEN
    RETURN 0;
  END IF;

  -- Set expiration date to 12 months from now
  v_expires_at := now() + interval '12 months';

  -- Update wallet balance and totals
  UPDATE toursred_points_wallets
  SET balance = balance + v_points_to_award,
      total_earned = total_earned + v_points_to_award,
      updated_at = now()
  WHERE id = v_wallet_id
  RETURNING balance INTO v_new_balance;

  -- Create transaction record
  INSERT INTO toursred_points_transactions (
    wallet_id,
    user_id,
    amount,
    balance_after,
    type,
    description,
    reference_id,
    reference_type,
    expires_at
  ) VALUES (
    v_wallet_id,
    p_user_id,
    v_points_to_award,
    v_new_balance,
    'earned',
    'Puntos ganados por reserva completada',
    p_booking_id,
    'booking',
    v_expires_at
  );

  -- Update booking record
  UPDATE bookings
  SET points_earned = v_points_to_award
  WHERE id = p_booking_id;

  RETURN v_points_to_award;
END;
$$;

GRANT EXECUTE ON FUNCTION award_points_for_booking TO service_role;
