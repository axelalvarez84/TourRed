/*
  # Add Traveler Identification Fields

  ## Summary
  Adds required identification fields for traveler registration to comply with travel regulations.
  
  ## Changes Made
  
  ### New Columns in `users` table:
  1. **curp** (text, nullable)
     - CURP (Clave Única de Registro de Población) for Mexican nationals
     - 18-character alphanumeric code
     - Required for national travelers
  
  2. **passport_number** (text, nullable)
     - International passport number for foreign travelers
     - Required for international travelers
  
  3. **phone_number** (text, nullable)
     - Mobile/cellular phone number
     - Required for all travelers for contact purposes
  
  4. **is_foreign_traveler** (boolean, default false)
     - Flag to identify if traveler is foreign (requires passport) or national (requires CURP)
     - Defaults to false (national traveler)
  
  ## Validation Notes
  - Only travelers (role = 'traveler') need these fields
  - National travelers must provide CURP
  - Foreign travelers must provide passport number
  - All travelers must provide phone number
  - Validation will be enforced at application level
*/

-- Add identification fields to users table
DO $$
BEGIN
  -- Add CURP field for national travelers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'curp'
  ) THEN
    ALTER TABLE users ADD COLUMN curp text;
  END IF;

  -- Add passport number for foreign travelers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'passport_number'
  ) THEN
    ALTER TABLE users ADD COLUMN passport_number text;
  END IF;

  -- Add phone number for all travelers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE users ADD COLUMN phone_number text;
  END IF;

  -- Add flag to identify foreign vs national travelers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_foreign_traveler'
  ) THEN
    ALTER TABLE users ADD COLUMN is_foreign_traveler boolean DEFAULT false;
  END IF;
END $$;