/*
  # Add permissions for categories and departure points management

  1. Changes
    - Add `can_manage_categories` column to `admin_permissions` table
    - Add `can_manage_departure_points` column to `admin_permissions` table
    - These permissions allow admins to manage tour categories and departure points
    
  2. Security
    - Default value is false (no access by default)
    - Super admins will have access regardless of these permissions
*/

-- Add can_manage_categories column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_categories'
  ) THEN
    ALTER TABLE admin_permissions
    ADD COLUMN can_manage_categories boolean DEFAULT false;
  END IF;
END $$;

-- Add can_manage_departure_points column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_departure_points'
  ) THEN
    ALTER TABLE admin_permissions
    ADD COLUMN can_manage_departure_points boolean DEFAULT false;
  END IF;
END $$;
