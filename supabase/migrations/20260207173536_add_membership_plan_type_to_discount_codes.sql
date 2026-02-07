/*
  # Add membership_plan_type column to discount_codes

  1. New Columns
    - `membership_plan_type` (text) - Restricts which membership plan a discount code applies to
      - 'monthly' - Only applies to monthly plans
      - 'annual' - Only applies to annual plans
      - 'both' - Applies to both (default)

  2. Changes
    - Adds CHECK constraint for valid values
    - Default is 'both' so all existing codes continue working
    - Only relevant when applicable_to = 'memberships'

  3. Security
    - No RLS changes needed (column inherits existing table policies)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discount_codes' AND column_name = 'membership_plan_type'
  ) THEN
    ALTER TABLE discount_codes ADD COLUMN membership_plan_type text DEFAULT 'both';
  END IF;
END $$;

ALTER TABLE discount_codes DROP CONSTRAINT IF EXISTS discount_codes_membership_plan_type_check;

ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_membership_plan_type_check
  CHECK (membership_plan_type IN ('monthly', 'annual', 'both'));