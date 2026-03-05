/*
  # Add promo_discount_per_traveler to booking_travelers

  ## Purpose
  Stores the group promotion discount amount applied to each individual traveler.
  This is essential for:
  1. Showing correct per-traveler pricing in the traveler detail view
  2. Calculating accurate refunds on partial or total cancellations
     (refunding only what was actually paid, not the full undiscounted price)

  ## Changes
  - `booking_travelers`: new column `promo_discount_per_traveler` (numeric, default 0)
    Stores the discount amount per traveler from a group promotion (e.g. grupo_precio_fijo)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_travelers' AND column_name = 'promo_discount_per_traveler'
  ) THEN
    ALTER TABLE booking_travelers ADD COLUMN promo_discount_per_traveler numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
