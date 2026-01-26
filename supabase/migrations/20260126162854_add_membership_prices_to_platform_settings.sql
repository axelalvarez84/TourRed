/*
  # Add Membership Prices to Platform Settings

  1. Changes
    - Add `membership_monthly_price` column to store the monthly membership price in MXN
    - Add `membership_annual_price` column to store the annual membership price in MXN
    - Set default values: 49.00 for monthly, 490.00 for annual

  2. Purpose
    - Allow admins to configure membership prices from the admin panel
    - Prices will be displayed dynamically across all pages and email templates
    - Ensures consistency between displayed prices and actual pricing

  3. Notes
    - These are display prices shown to users
    - Stripe Price IDs control actual billing amounts
    - Admins should ensure these prices match their Stripe product prices
*/

-- Add membership price columns to platform_settings table
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS membership_monthly_price decimal(10,2) DEFAULT 49.00 CHECK (membership_monthly_price > 0),
ADD COLUMN IF NOT EXISTS membership_annual_price decimal(10,2) DEFAULT 490.00 CHECK (membership_annual_price > 0);

-- Add helpful comments
COMMENT ON COLUMN public.platform_settings.membership_monthly_price IS 'Display price for monthly ToursRed+ membership in MXN';
COMMENT ON COLUMN public.platform_settings.membership_annual_price IS 'Display price for annual ToursRed+ membership in MXN';

-- Update existing row with default values if columns are null
UPDATE public.platform_settings
SET
  membership_monthly_price = COALESCE(membership_monthly_price, 49.00),
  membership_annual_price = COALESCE(membership_annual_price, 490.00)
WHERE membership_monthly_price IS NULL OR membership_annual_price IS NULL;