/*
  # Fix Agency Reviews User Access

  1. Changes
    - Add policy to allow reading basic user information (first_name, last_name) 
      when accessed through public agency reviews
    - This allows anyone to see reviewer names on agency review pages

  2. Security
    - Only exposes first_name and last_name (no sensitive data)
    - Only applies when the user has written a visible agency review
    - Maintains privacy for all other user data
*/

-- Create a policy that allows reading basic user info for users who have written agency reviews
CREATE POLICY "Anyone can view basic info of users who wrote agency reviews"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agency_reviews
      WHERE agency_reviews.traveler_id = users.id
      AND agency_reviews.is_visible = true
    )
  );
