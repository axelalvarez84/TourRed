/*
  # Backfill promo_discount_per_traveler for existing bookings with grupo_precio_fijo promotions

  ## Problem
  Existing bookings that used a grupo_precio_fijo promotion have:
  - promo_discount_per_traveler = 0 (old default)
  - precio_aplicado = full price (not discounted)

  ## Fix
  For each booking_traveler linked to a booking with a grupo_precio_fijo promotion:
  1. Calculate the per-traveler discount as: precio_aplicado * (group_discount_percentage / 100)
  2. Update precio_aplicado to the discounted price
  3. Set promo_discount_per_traveler to the calculated discount

  Only affects rows where promo_discount_per_traveler = 0 and the booking has a
  grupo_precio_fijo promotion.
*/

UPDATE booking_travelers bt
SET
  promo_discount_per_traveler = ROUND(bt.precio_aplicado * (tp.group_discount_percentage / 100), 2),
  precio_aplicado = ROUND(bt.precio_aplicado * (1 - tp.group_discount_percentage / 100), 2)
FROM bookings b
JOIN tour_promotions tp ON b.promotion_id = tp.id
WHERE bt.booking_id = b.id
  AND b.promotion_id IS NOT NULL
  AND tp.promotion_type = 'grupo_precio_fijo'
  AND tp.group_discount_percentage IS NOT NULL
  AND bt.promo_discount_per_traveler = 0
  AND bt.precio_aplicado > 0;
