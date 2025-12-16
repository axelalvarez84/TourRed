/*
  # Cleanup Duplicate Agency Review Policies

  1. Changes
    - Remove duplicate "Anyone can view agency reviews" policy
    - Keep only "Anyone can view visible agency reviews" policy which allows public access

  2. Security
    - Maintains public access to visible reviews
    - No security changes, just cleanup
*/

-- Drop the old authenticated-only policy
DROP POLICY IF EXISTS "Anyone can view agency reviews" ON agency_reviews;

-- Ensure we have the public access policy (recreate if needed)
DROP POLICY IF EXISTS "Anyone can view visible agency reviews" ON agency_reviews;
CREATE POLICY "Anyone can view visible agency reviews"
  ON agency_reviews FOR SELECT
  USING (is_visible = true);
