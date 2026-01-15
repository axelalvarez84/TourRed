/*
  # Restructure Address Fields
  
  ## Summary
  Replaces the single "address" text field with structured address components for better data quality
  and validation. This allows for proper address management and integration with mapping services.
  
  ## Changes Made
  
  1. **Remove Old Address Field**
     - Drops the generic "address" column
  
  2. **Add Structured Address Fields**
     - `street` (text) - Street name
     - `exterior_number` (text) - Exterior/outside number
     - `interior_number` (text, optional) - Interior/apartment/suite number
     - `colony` (text) - Neighborhood/colony
     - `city` (text) - City
     - `state` (text) - State/province
     - `postal_code` (text) - ZIP/postal code
     - `country` (text, optional) - Country (defaults to Mexico for national travelers)
  
  ## Notes
  - All new fields are optional to maintain backwards compatibility
  - Existing data in "address" field will be lost (migration should be run before production)
  - Frontend forms will need to be updated to use new structured fields
*/

-- Drop the old address column
ALTER TABLE users DROP COLUMN IF EXISTS address;

-- Add structured address fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS exterior_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interior_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS colony TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'México';

-- Add index on postal_code for potential searches
CREATE INDEX IF NOT EXISTS idx_users_postal_code ON users(postal_code) WHERE postal_code IS NOT NULL;