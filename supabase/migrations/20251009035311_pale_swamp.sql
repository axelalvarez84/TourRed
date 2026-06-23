-- Add new columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS curp text,
ADD COLUMN IF NOT EXISTS passport_number text,
ADD COLUMN IF NOT EXISTS is_foreign_traveler boolean DEFAULT false;

-- Add unique constraints for identification fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_curp_unique' 
    AND table_name = 'users'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_curp_unique UNIQUE (curp);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_passport_number_unique' 
    AND table_name = 'users'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_passport_number_unique UNIQUE (passport_number);
  END IF;
END $$;

-- Add check constraint to ensure only one identification method is used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_identification_check' 
    AND table_name = 'users'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_identification_check 
    CHECK (
      (curp IS NOT NULL AND passport_number IS NULL AND is_foreign_traveler = false) OR
      (curp IS NULL AND passport_number IS NOT NULL AND is_foreign_traveler = true) OR
      (curp IS NULL AND passport_number IS NULL)
    );
  END IF;
END $$;
