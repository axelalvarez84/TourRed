/*
  # Create atomic email lock function

  1. New Functions
    - `claim_booking_email_lock(p_booking_id uuid)` - Atomically sets confirmation_email_sent to true
      and returns whether the lock was acquired (true = this caller won, false = already claimed)

  2. Purpose
    - Prevents duplicate confirmation emails caused by race conditions
    - Uses atomic UPDATE with WHERE clause so only one concurrent caller can succeed
*/

CREATE OR REPLACE FUNCTION public.claim_booking_email_lock(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE bookings
  SET confirmation_email_sent = true
  WHERE id = p_booking_id
    AND confirmation_email_sent = false;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  RETURN rows_affected > 0;
END;
$$;