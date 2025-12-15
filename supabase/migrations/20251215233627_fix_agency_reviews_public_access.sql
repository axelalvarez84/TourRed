/*
  # Fix Agency Reviews Public Access

  1. Changes
    - Update RLS policy to allow public (unauthenticated) access to agency reviews
    - Agency reviews should be visible to everyone, not just authenticated users

  2. Security
    - Maintains all other security restrictions
    - Only SELECT policy is changed to allow public access
*/

-- Drop existing policy for viewing agency reviews
DROP POLICY IF EXISTS "Anyone can view agency reviews" ON agency_reviews;

-- Create new policy allowing both authenticated and anonymous users to view agency reviews
CREATE POLICY "Anyone can view agency reviews"
  ON agency_reviews FOR SELECT
  USING (true);
