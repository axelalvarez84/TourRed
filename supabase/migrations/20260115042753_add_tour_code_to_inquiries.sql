/*
  # Add tour_code field to international_tour_inquiries

  1. Changes
    - Add `tour_code` column to international_tour_inquiries table
    - This field stores the Mega Travel tour code (e.g., MT-20293)
    - Optional field that helps identify specific tours the customer is interested in

  2. Notes
    - The field is optional (nullable) as not all inquiries may have a tour code
    - No need to create an index since this field won't be used for filtering
*/

-- Add tour_code column to international_tour_inquiries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'international_tour_inquiries' AND column_name = 'tour_code'
  ) THEN
    ALTER TABLE international_tour_inquiries ADD COLUMN tour_code text;
  END IF;
END $$;
