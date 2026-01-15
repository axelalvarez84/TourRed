/*
  # Add Address Fields to Agencies Table
  
  ## Summary
  Adds structured address fields to the agencies table to store complete location information
  for travel agencies. This is essential business information needed for legal compliance,
  customer trust, and operational purposes.
  
  ## Changes Made
  
  1. **Add Structured Address Fields to Agencies**
     - `street` (text) - Street name
     - `exterior_number` (text) - Exterior/building number
     - `interior_number` (text, optional) - Interior/office/suite number
     - `colony` (text) - Neighborhood/colony
     - `city` (text) - City
     - `state` (text) - State/province
     - `postal_code` (text) - ZIP/postal code
     - `country` (text) - Country (defaults to México)
  
  ## Notes
  - All fields are optional to maintain backwards compatibility with existing agencies
  - New agency registrations should require these fields in the frontend
  - Address information is important for customer trust and legal compliance
*/

-- Add structured address fields to agencies table
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS exterior_number TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS interior_number TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS colony TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'México';

-- Add index on city and state for potential location-based searches
CREATE INDEX IF NOT EXISTS idx_agencies_city ON agencies(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_state ON agencies(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_postal_code ON agencies(postal_code) WHERE postal_code IS NOT NULL;