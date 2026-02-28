/*
  # Add Partial Cancellations System

  ## Summary
  This migration adds support for partial booking cancellations, where a traveler can cancel
  specific individuals from a booking without cancelling the entire reservation.

  ## Changes

  ### Modified Tables

  #### booking_travelers
  - `is_cancelled` (boolean, default false) - Whether this individual traveler was partially cancelled
  - `cancelled_at` (timestamptz, nullable) - When this traveler was cancelled
  - `partial_cancellation_id` (uuid, nullable) - Reference to the partial cancellation record

  #### bookings
  - `has_partial_cancellations` (boolean, default false) - Whether any partial cancellations have occurred
  - `active_travelers_count` (integer, nullable) - Current count of active (non-cancelled) travelers

  ### New Tables

  #### booking_partial_cancellations
  - `id` (uuid, primary key)
  - `booking_id` (uuid, FK bookings) - The booking this partial cancellation belongs to
  - `cancelled_by_user_id` (uuid, FK users) - Who performed the cancellation
  - `cancelled_at` (timestamptz) - When the partial cancellation occurred
  - `tour_start_date` (date) - Tour start date at time of cancellation
  - `days_before_tour` (integer) - Days remaining before tour
  - `cancellation_policy_type` (text) - Policy applied: 100_percent, 50_percent, no_refund
  - `travelers_cancelled` (jsonb) - Array of cancelled traveler details (id, nombre, categoria, precio_aplicado)
  - `original_partial_amount` (numeric) - Sum of precio_aplicado of cancelled travelers
  - `refund_amount_to_traveler` (numeric) - Amount refunded to ToursRed Cash
  - `amount_to_agency` (numeric) - Penalty amount that goes to agency
  - `amount_to_platform` (numeric) - Penalty amount that goes to platform
  - `toursred_cash_transaction_id` (uuid, nullable) - Reference to refund transaction
  - `refund_processed` (boolean) - Whether refund has been processed
  - `cancellation_reason` (text, nullable) - Optional reason provided by traveler
  - `notification_sent` (boolean) - Whether real-time notification was sent to agency
  - `emails_sent` (boolean) - Whether email notifications were sent

  ## Security
  - Enable RLS on booking_partial_cancellations
  - Travelers can view their own partial cancellations
  - Agencies can view partial cancellations for their tours
  - Admins (super_admin) can view all partial cancellations
  - Authenticated users can insert (checked by booking ownership)
*/

-- Add fields to booking_travelers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'is_cancelled'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN is_cancelled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN cancelled_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'partial_cancellation_id'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN partial_cancellation_id uuid;
  END IF;
END $$;

-- Add fields to bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'has_partial_cancellations'
  ) THEN
    ALTER TABLE bookings ADD COLUMN has_partial_cancellations boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'active_travelers_count'
  ) THEN
    ALTER TABLE bookings ADD COLUMN active_travelers_count integer;
  END IF;
END $$;

-- Create booking_partial_cancellations table
CREATE TABLE IF NOT EXISTS booking_partial_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  tour_start_date date NOT NULL,
  days_before_tour integer NOT NULL,
  cancellation_policy_type text NOT NULL CHECK (cancellation_policy_type IN ('100_percent', '50_percent', 'no_refund')),
  travelers_cancelled jsonb NOT NULL DEFAULT '[]',
  original_partial_amount numeric(10, 2) NOT NULL DEFAULT 0,
  refund_amount_to_traveler numeric(10, 2) NOT NULL DEFAULT 0,
  amount_to_agency numeric(10, 2) NOT NULL DEFAULT 0,
  amount_to_platform numeric(10, 2) NOT NULL DEFAULT 0,
  toursred_cash_transaction_id uuid REFERENCES toursred_cash_transactions(id) ON DELETE SET NULL,
  refund_processed boolean NOT NULL DEFAULT false,
  cancellation_reason text,
  notification_sent boolean NOT NULL DEFAULT false,
  emails_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_booking_partial_cancellations_booking_id ON booking_partial_cancellations(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_partial_cancellations_user_id ON booking_partial_cancellations(cancelled_by_user_id);
CREATE INDEX IF NOT EXISTS idx_booking_partial_cancellations_created_at ON booking_partial_cancellations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_travelers_is_cancelled ON booking_travelers(is_cancelled) WHERE is_cancelled = false;

-- Enable RLS
ALTER TABLE booking_partial_cancellations ENABLE ROW LEVEL SECURITY;

-- Policy: Travelers can view their own partial cancellations
CREATE POLICY "Travelers can view own partial cancellations"
  ON booking_partial_cancellations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = cancelled_by_user_id);

-- Policy: Agencies can view partial cancellations for their tours
CREATE POLICY "Agencies can view their tour partial cancellations"
  ON booking_partial_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN tours t ON b.tour_id = t.id
      JOIN agencies a ON t.agency_id = a.id
      WHERE b.id = booking_partial_cancellations.booking_id
      AND a.user_id = (select auth.uid())
    )
  );

-- Policy: Admins can view all partial cancellations
CREATE POLICY "Admins can view all partial cancellations"
  ON booking_partial_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (select auth.uid())
      AND users.role = 'super_admin'
    )
  );

-- Policy: Authenticated users can insert partial cancellations for their own bookings
CREATE POLICY "Travelers can insert partial cancellations for own bookings"
  ON booking_partial_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = cancelled_by_user_id
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = booking_partial_cancellations.booking_id
      AND bookings.user_id = (select auth.uid())
    )
  );

-- Policy: Authenticated users can update their own partial cancellations (for emails_sent flag)
CREATE POLICY "Travelers can update own partial cancellations"
  ON booking_partial_cancellations
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = cancelled_by_user_id)
  WITH CHECK ((select auth.uid()) = cancelled_by_user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_booking_partial_cancellations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS update_booking_partial_cancellations_updated_at_trigger ON booking_partial_cancellations;
CREATE TRIGGER update_booking_partial_cancellations_updated_at_trigger
  BEFORE UPDATE ON booking_partial_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_partial_cancellations_updated_at();
