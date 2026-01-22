/*
  # Add Booking Code System

  1. Changes
    - Add `booking_code` field to `bookings` table with format TRG-XXXXXXXXXXX (11 alphanumeric chars)
    - Create function to generate unique booking codes
    - Add unique constraint to ensure no duplicates
    - Backfill existing bookings with codes
    - Set default to auto-generate codes for new bookings

  2. Security
    - Booking codes are publicly readable (easier for customer service)
    - Only system can generate codes (via function)
    
  3. Format
    - Prefix: TRG-
    - Length: 11 alphanumeric characters (uppercase)
    - Total: 15 characters including prefix
    - Combinations: 36^11 ≈ 131 trillion possible codes
*/

-- Function to generate a random alphanumeric string
CREATE OR REPLACE FUNCTION generate_random_alphanumeric(length INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Function to generate a unique booking code
CREATE OR REPLACE FUNCTION generate_unique_booking_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate code with TRG- prefix + 11 random alphanumeric chars
    new_code := 'TRG-' || generate_random_alphanumeric(11);
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM bookings WHERE booking_code = new_code) INTO code_exists;
    
    -- If code doesn't exist, return it
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Add booking_code column (nullable first for backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'booking_code'
  ) THEN
    ALTER TABLE bookings ADD COLUMN booking_code VARCHAR(15);
  END IF;
END $$;

-- Backfill existing bookings with unique codes
UPDATE bookings 
SET booking_code = generate_unique_booking_code()
WHERE booking_code IS NULL;

-- Make column NOT NULL and add unique constraint
ALTER TABLE bookings 
  ALTER COLUMN booking_code SET NOT NULL,
  ALTER COLUMN booking_code SET DEFAULT generate_unique_booking_code();

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_booking_code_unique'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_booking_code_unique UNIQUE (booking_code);
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_booking_code ON bookings(booking_code);