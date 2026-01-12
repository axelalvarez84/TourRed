/*
  # Add permission to manage international tour inquiries

  1. Changes
    - Add `can_manage_inquiries` column to `admin_permissions` table
    - This permission allows admins to view and manage international tour inquiries
    
  2. Security
    - Default value is false (no access by default)
    - Super admins will have access regardless of this permission
*/

-- Add can_manage_inquiries column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_permissions' AND column_name = 'can_manage_inquiries'
  ) THEN
    ALTER TABLE admin_permissions
    ADD COLUMN can_manage_inquiries boolean DEFAULT false;
  END IF;
END $$;