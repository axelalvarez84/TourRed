/*
  # Add Passport Number Unique Constraint
  
  ## Summary
  Adds a UNIQUE constraint to the passport_number field in the users table to prevent duplicate registrations
  with the same passport number. This ensures data integrity and prevents foreign travelers from creating 
  multiple accounts with the same passport.
  
  ## Changes Made
  
  1. **Passport Number Unique Constraint**
     - Adds UNIQUE constraint to `passport_number` column in `users` table
     - Allows NULL values (for national travelers who don't have passport)
     - Only enforces uniqueness when passport_number is not NULL
  
  2. **Index for Performance**
     - Creates a partial index on non-null passport_number values for better query performance
  
  ## Notes
  - This constraint will prevent duplicate passport number registrations
  - NULL values are still allowed (for national travelers)
  - Application layer should handle the unique constraint violation error with a user-friendly message
*/

-- Add unique constraint to passport_number field (only for non-null values)
DO $$
BEGIN
  -- Check if the constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_passport_number_unique' AND conrelid = 'users'::regclass
  ) THEN
    -- Add the unique constraint
    ALTER TABLE users ADD CONSTRAINT users_passport_number_unique UNIQUE (passport_number);
  END IF;
END $$;

-- Create an index for better performance on passport_number lookups (only non-null values)
CREATE INDEX IF NOT EXISTS idx_users_passport_number_not_null 
ON users (passport_number) 
WHERE passport_number IS NOT NULL;