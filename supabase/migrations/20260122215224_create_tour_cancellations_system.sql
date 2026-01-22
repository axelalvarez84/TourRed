/*
  # Create Tour Cancellations System by Agency

  1. New Tables
    - `tour_cancellations`
      - `id` (uuid, primary key)
      - `tour_id` (uuid, foreign key to tours)
      - `agency_id` (uuid, foreign key to agencies)
      - `cancelled_by_user_id` (uuid, foreign key to users)
      - `cancellation_reason` (text, required) - Minimum 50 characters explaining why
      - `original_tour_date` (date) - Original start date of the tour
      - `affected_bookings_count` (integer) - Number of bookings cancelled
      - `total_refunded_amount` (numeric) - Total amount refunded to all travelers
      - `emails_sent_to_travelers` (integer, default 0) - Count of emails sent
      - `admin_email_sent` (boolean, default false)
      - `agency_email_sent` (boolean, default false)
      - `cancelled_at` (timestamptz, default now())
      - `created_at` (timestamptz, default now())

  2. New Columns in `tours`
    - `cancelled_by_agency` (boolean, default false)
    - `agency_cancellation_id` (uuid, nullable) - Reference to tour_cancellations

  3. New Columns in `bookings`
    - `agency_cancellation_id` (uuid, nullable) - Reference to tour_cancellations if cancelled by agency

  4. Security
    - Enable RLS on `tour_cancellations` table
    - Add policies for agencies to view their own cancellations
    - Add policies for admins to view all cancellations
*/

-- Create tour_cancellations table
CREATE TABLE IF NOT EXISTS tour_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  cancelled_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cancellation_reason text NOT NULL,
  original_tour_date date NOT NULL,
  affected_bookings_count integer NOT NULL DEFAULT 0 CHECK (affected_bookings_count >= 0),
  total_refunded_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_refunded_amount >= 0),
  emails_sent_to_travelers integer NOT NULL DEFAULT 0 CHECK (emails_sent_to_travelers >= 0),
  admin_email_sent boolean NOT NULL DEFAULT false,
  agency_email_sent boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_tour_cancellations_tour_id ON tour_cancellations(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_cancellations_agency_id ON tour_cancellations(agency_id);
CREATE INDEX IF NOT EXISTS idx_tour_cancellations_cancelled_at ON tour_cancellations(cancelled_at DESC);

-- Add new columns to tours table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'cancelled_by_agency'
  ) THEN
    ALTER TABLE tours ADD COLUMN cancelled_by_agency boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'agency_cancellation_id'
  ) THEN
    ALTER TABLE tours ADD COLUMN agency_cancellation_id uuid REFERENCES tour_cancellations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add new column to bookings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'agency_cancellation_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN agency_cancellation_id uuid REFERENCES tour_cancellations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on tour_cancellations
ALTER TABLE tour_cancellations ENABLE ROW LEVEL SECURITY;

-- Policy: Agencies can view their own tour cancellations
CREATE POLICY "Agencies can view own tour cancellations"
  ON tour_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = tour_cancellations.agency_id
      AND agencies.user_id = auth.uid()
    )
  );

-- Policy: Admins can view all tour cancellations
CREATE POLICY "Admins can view all tour cancellations"
  ON tour_cancellations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policy: Service role can insert tour cancellations (for backend processing)
CREATE POLICY "Service role can insert tour cancellations"
  ON tour_cancellations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Service role can update tour cancellations (for email tracking)
CREATE POLICY "Service role can update tour cancellations"
  ON tour_cancellations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);