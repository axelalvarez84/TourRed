/*
  # Add Membership Percentage and Fixed Discount Types

  1. Changes
    - Add `membership_percentage` and `membership_fixed` to the discount_type CHECK constraint
    - These allow percentage-based (e.g., 20% off) and fixed-amount (e.g., $100 off) discounts on membership subscriptions
    - Works with Stripe Coupons applied at checkout time

  2. Updated Constraint
    - `membership_percentage` - percentage discount on any membership plan
    - `membership_fixed` - fixed amount discount on any membership plan
    - All existing discount types remain unchanged
*/

ALTER TABLE discount_codes DROP CONSTRAINT IF EXISTS discount_codes_discount_type_check;

ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_discount_type_check 
  CHECK (discount_type IN (
    'tour_percentage', 
    'tour_fixed', 
    'membership_free_month',
    'membership_percentage',
    'membership_fixed',
    'gift_card_percentage', 
    'gift_card_fixed',
    'agency_tour_percentage',
    'agency_tour_fixed',
    'service_fee_percentage',
    'service_fee_fixed',
    'service_fee_full'
  ));