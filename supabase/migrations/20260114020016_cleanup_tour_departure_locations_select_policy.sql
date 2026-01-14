/*
  # Cleanup: Remove Duplicate SELECT Policy

  1. Problem
    - Two SELECT policies on tour_departure_locations may conflict
    - One for public, one for authenticated

  2. Solution
    - Keep only the public policy since tour departure locations should be visible to everyone
    - This allows agencies to read their data after insert

  3. Changes
    - Remove the authenticated-only SELECT policy
*/

-- Remove the duplicate authenticated SELECT policy
DROP POLICY IF EXISTS "Agencies can view their tour departure locations" ON tour_departure_locations;

-- The public policy already exists and covers all cases
-- "Anyone can view tour departure locations" allows both public and authenticated users