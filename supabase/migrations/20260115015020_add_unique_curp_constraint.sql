/*
  # Add CURP Unique Constraint
  
  ## Summary
  Adds a UNIQUE constraint to the CURP field in the users table to prevent duplicate registrations
  with the same CURP. This ensures data integrity and prevents users from creating multiple accounts
  with the same CURP.
  
  ## Changes Made
  
  1. **CURP Unique Constraint**
     - Adds UNIQUE constraint to `curp` column in `users` table
     - Allows NULL values (for foreign travelers who don't have CURP)
     - Only enforces uniqueness when CURP is not NULL
  
  2. **Index for Performance**
     - Creates a partial index on non-null CURP values for better query performance
  
  ## Notes
  - This constraint will prevent duplicate CURP registrations
  - NULL values are still allowed (for foreign travelers)
  - Application layer should handle the unique constraint violation error with a user-friendly message
*/

-- Add unique constraint to CURP field (only for non-null values)
DO $$
BEGIN
  -- Check if the constraint doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_curp_unique' AND conrelid = 'users'::regclass
  ) THEN
    -- Add the unique constraint
    ALTER TABLE users ADD CONSTRAINT users_curp_unique UNIQUE (curp);
  END IF;
END $$;

-- Create an index for better performance on CURP lookups (only non-null values)
CREATE INDEX IF NOT EXISTS idx_users_curp_not_null 
ON users (curp) 
WHERE curp IS NOT NULL;