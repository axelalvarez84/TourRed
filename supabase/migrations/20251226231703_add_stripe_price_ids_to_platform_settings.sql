/*
  # Add Stripe Price IDs to Platform Settings
  
  1. Changes
    - Add `stripe_monthly_price_id` column to store the Stripe monthly subscription price ID
    - Add `stripe_annual_price_id` column to store the Stripe annual subscription price ID
  
  2. Notes
    - These fields store the Stripe Price IDs for ToursRed+ memberships
    - Admins can configure these through the admin settings page
*/

-- Add Stripe Price ID columns to platform_settings table
ALTER TABLE public.platform_settings 
ADD COLUMN IF NOT EXISTS stripe_monthly_price_id text,
ADD COLUMN IF NOT EXISTS stripe_annual_price_id text;

-- Add helpful comment
COMMENT ON COLUMN public.platform_settings.stripe_monthly_price_id IS 'Stripe Price ID for monthly ToursRed+ membership subscription';
COMMENT ON COLUMN public.platform_settings.stripe_annual_price_id IS 'Stripe Price ID for annual ToursRed+ membership subscription';
