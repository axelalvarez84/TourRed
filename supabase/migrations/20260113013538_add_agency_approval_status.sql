/*
  # Add Agency Approval Status

  1. Changes
    - Add `is_approved` column to `users` table
      - Boolean field to track if an agency has been approved by admin
      - Defaults to false for new agencies
      - Only applies to users with role 'agency'
    
  2. Security
    - Super admins can update the approval status
    - Agencies can view their own approval status
*/

-- Add is_approved column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_approved'
  ) THEN
    ALTER TABLE users ADD COLUMN is_approved boolean DEFAULT false;
  END IF;
END $$;

-- Set existing agencies to approved (so they don't lose access)
UPDATE users 
SET is_approved = true 
WHERE role = 'agency' AND is_approved IS NULL;