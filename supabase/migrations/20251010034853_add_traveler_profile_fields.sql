/*
  # Add Traveler Profile Fields

  ## Summary
  Adds additional profile fields for travelers: date of birth and address.
  
  ## Changes Made
  
  ### New Columns in `users` table:
  1. **date_of_birth** (date, nullable)
     - Traveler's date of birth
     - Used for age verification and travel documentation
  
  2. **address** (text, nullable)
     - Full physical address of the traveler
     - Required for travel documentation and emergency contact
  
  ## Notes
  - These fields complement the existing identification fields (CURP/passport, phone)
  - All fields will be displayed and editable in the traveler profile page
*/

-- Add date of birth and address fields to users table
DO $$
BEGIN
  -- Add date of birth field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE users ADD COLUMN date_of_birth date;
  END IF;

  -- Add address field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'address'
  ) THEN
    ALTER TABLE users ADD COLUMN address text;
  END IF;
END $$;