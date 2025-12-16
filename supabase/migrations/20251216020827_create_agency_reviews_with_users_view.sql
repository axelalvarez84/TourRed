/*
  # Create View for Agency Reviews with User Info

  1. Changes
    - Create a view that joins agency_reviews with user information
    - This simplifies querying and avoids RLS complexity with joins
    
  2. Security
    - View only shows visible reviews
    - Only exposes basic user information (first_name, last_name)
    - Accessible to everyone (public)
*/

-- Create view for agency reviews with user information
CREATE OR REPLACE VIEW agency_reviews_with_users AS
SELECT 
  ar.id,
  ar.agency_id,
  ar.traveler_id,
  ar.rating,
  ar.comment,
  ar.reply,
  ar.created_at,
  ar.updated_at,
  ar.is_visible,
  u.first_name as traveler_first_name,
  u.last_name as traveler_last_name
FROM agency_reviews ar
LEFT JOIN users u ON u.id = ar.traveler_id
WHERE ar.is_visible = true;

-- Grant access to the view
GRANT SELECT ON agency_reviews_with_users TO anon, authenticated;
