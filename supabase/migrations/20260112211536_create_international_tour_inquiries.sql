/*
  # Create international tour inquiries table

  1. New Tables
    - `international_tour_inquiries`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, nullable, foreign key) - Optional link to registered user
      - `name` (text, not null) - Traveler's full name
      - `email` (text, not null) - Contact email
      - `phone` (text, not null) - Contact phone
      - `destination` (text, not null) - Destination of interest
      - `travel_date` (date, nullable) - Approximate travel date
      - `num_people` (integer, not null) - Number of travelers
      - `message` (text, nullable) - Additional comments or questions
      - `source` (text, default 'mega_travel') - Source of the inquiry (mega_travel, other)
      - `status` (text, default 'pending') - Status: pending, contacted, converted
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `international_tour_inquiries` table
    - Allow INSERT for authenticated and anonymous users
    - Allow SELECT/UPDATE only for admins and super admins

  3. Indexes
    - Add indexes on user_id, status, and created_at for performance
*/

-- Create the international_tour_inquiries table
CREATE TABLE IF NOT EXISTS international_tour_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  destination text NOT NULL,
  travel_date date,
  num_people integer NOT NULL CHECK (num_people > 0),
  message text,
  source text NOT NULL DEFAULT 'mega_travel',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'converted')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE international_tour_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anyone (authenticated and anonymous) to insert inquiries
CREATE POLICY "Anyone can submit inquiry"
  ON international_tour_inquiries FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow admins to view all inquiries
CREATE POLICY "Admins can view all inquiries"
  ON international_tour_inquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- Allow admins to update inquiries
CREATE POLICY "Admins can update inquiries"
  ON international_tour_inquiries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inquiries_user_id ON international_tour_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON international_tour_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON international_tour_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_source ON international_tour_inquiries(source);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_international_tour_inquiries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON international_tour_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_international_tour_inquiries_updated_at();