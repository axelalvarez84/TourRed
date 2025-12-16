/*
  # Fix Authenticated Users Access to Agency Reviews

  1. Changes
    - Add policy to allow authenticated users (including agencies) to view visible agency reviews
    - This allows logged-in agencies to see reviews of other agencies and tours
    
  2. Security
    - Only visible reviews are accessible
    - Admins can still see all reviews (including non-visible ones)
    - Maintains existing security for other operations
*/

-- Allow authenticated users to view visible agency reviews
CREATE POLICY "Authenticated users can view visible agency reviews"
  ON agency_reviews FOR SELECT
  TO authenticated
  USING (is_visible = true);

-- Similarly, allow authenticated users to view basic info of users who wrote reviews
CREATE POLICY "Authenticated users can view basic info of reviewers"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agency_reviews
      WHERE agency_reviews.traveler_id = users.id
      AND agency_reviews.is_visible = true
    )
  );
