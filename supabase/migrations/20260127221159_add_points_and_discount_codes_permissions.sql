/*
  # Add permissions for points and discount codes management

  1. Changes
    - Add `can_manage_points` column to `admin_permissions` table
    - Add `can_manage_discount_codes` column to `admin_permissions` table
    - These permissions allow admins to manage ToursRed points and discount codes
    
  2. Security
    - Default value is false (no access by default)
    - Super admins will have access regardless of these permissions
*/

-- Add can_manage_points column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_points'
  ) THEN
    ALTER TABLE admin_permissions
    ADD COLUMN can_manage_points boolean DEFAULT false;
  END IF;
END $$;

-- Add can_manage_discount_codes column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_discount_codes'
  ) THEN
    ALTER TABLE admin_permissions
    ADD COLUMN can_manage_discount_codes boolean DEFAULT false;
  END IF;
END $$;