/*
  # Add Platform Fee Settings

  1. New Tables
    - `platform_settings`
      - `id` (uuid, primary key) - single row table
      - `service_charge_percentage` (decimal) - Platform service charge percentage (default 5%)
      - `agency_commission_percentage` (decimal) - Agency commission percentage (default 15%)
      - `updated_at` (timestamptz) - Last update timestamp
      - `updated_by` (uuid) - Admin who last updated settings

  2. Security
    - Enable RLS on `platform_settings` table
    - Allow all users to read settings (needed for booking calculations)
    - Only admins can update settings

  3. Initial Data
    - Insert default settings with service charge at 5% and agency commission at 15%
*/

-- Create platform_settings table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_charge_percentage decimal(5,2) NOT NULL DEFAULT 5.00 CHECK (service_charge_percentage >= 0 AND service_charge_percentage <= 100),
  agency_commission_percentage decimal(5,2) NOT NULL DEFAULT 15.00 CHECK (agency_commission_percentage >= 0 AND agency_commission_percentage <= 100),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read settings (needed for booking calculations)
CREATE POLICY "Platform settings are readable by everyone"
  ON public.platform_settings
  FOR SELECT
  TO public
  USING (true);

-- Only admins can update settings
CREATE POLICY "Only admins can update platform settings"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Trigger to update updated_at timestamp
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert default settings (only if table is empty)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_settings) THEN
    INSERT INTO public.platform_settings (
      service_charge_percentage,
      agency_commission_percentage
    ) VALUES (
      5.00,
      15.00
    );
  END IF;
END $$;