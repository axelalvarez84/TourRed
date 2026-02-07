/*
  # Add discount_applies_to column to discount_codes and discount tracking to bookings

  1. Changes to `discount_codes`
    - Add `discount_applies_to` column (text, default 'total_price')
      - 'total_price': Discount applies to the total tour cost, cascading to deposit, commission, and service charge
      - 'payment_amount': Discount applies only to what the user pays (deposit + service charge)
    - Only relevant when applicable_to = 'tours'

  2. Changes to `bookings`
    - Add `discount_code_id` (uuid, nullable, FK to discount_codes)
    - Add `discount_amount` (numeric, default 0) - the actual discount in pesos applied
    - Add index on discount_code_id for query performance

  3. Security
    - No new RLS policies needed (existing policies on bookings and discount_codes cover these columns)
*/

-- Add discount_applies_to column to discount_codes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discount_codes' AND column_name = 'discount_applies_to'
  ) THEN
    ALTER TABLE public.discount_codes
      ADD COLUMN discount_applies_to text NOT NULL DEFAULT 'total_price'
      CHECK (discount_applies_to IN ('total_price', 'payment_amount'));
  END IF;
END $$;

-- Add discount_code_id column to bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'discount_code_id'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN discount_code_id uuid REFERENCES public.discount_codes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add discount_amount column to bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add index on bookings.discount_code_id
CREATE INDEX IF NOT EXISTS idx_bookings_discount_code_id
  ON public.bookings(discount_code_id)
  WHERE discount_code_id IS NOT NULL;

-- Also relax the constraint that tour_id requires agency_id on discount_codes
-- Admin-created platform codes can now have agency_id and/or tour_id for scoping
ALTER TABLE public.discount_codes DROP CONSTRAINT IF EXISTS tour_id_requires_agency_id;
