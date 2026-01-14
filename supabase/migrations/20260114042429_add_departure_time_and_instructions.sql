/*
  # Add departure time and special instructions to tour departure points

  1. Changes
    - Add `departure_time` column to `tour_departure_points` table (time of day)
    - Add `special_instructions` column to `tour_departure_points` table (text for references)
    - These fields allow agencies to specify when the tour departs from each point
      and provide special instructions or landmarks for travelers
    
  2. Security
    - Existing RLS policies continue to apply
    - No changes needed to security model
*/

-- Add departure_time column (stores time without date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tour_departure_points' AND column_name = 'departure_time'
  ) THEN
    ALTER TABLE tour_departure_points
    ADD COLUMN departure_time time;
  END IF;
END $$;

-- Add special_instructions column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tour_departure_points' AND column_name = 'special_instructions'
  ) THEN
    ALTER TABLE tour_departure_points
    ADD COLUMN special_instructions text;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN tour_departure_points.departure_time IS 'Time of day when the tour departs from this point (optional)';
COMMENT ON COLUMN tour_departure_points.special_instructions IS 'Special instructions or reference points for travelers (optional)';
