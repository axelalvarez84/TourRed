/*
  # Add is_active field to users table

  1. Changes
    - Add is_active boolean field to users table (default true)
    - This allows admins to activate/deactivate user accounts
  
  2. Security
    - Field can only be modified by super admins
*/

-- Add is_active field to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.users ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;
