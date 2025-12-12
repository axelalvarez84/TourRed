/*
  # Update Admin Email Address

  1. Changes
    - Update admin email from tourredmx@gmail.com to admin@toursred.com
    - Update both users table and auth.users table
    
  2. Notes
    - This migration updates the admin email address in both tables to maintain consistency
*/

-- Update email in users table
UPDATE users 
SET email = 'admin@toursred.com' 
WHERE email = 'tourredmx@gmail.com' AND role = 'admin';

-- Update email in auth.users table
UPDATE auth.users 
SET 
  email = 'admin@toursred.com',
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb), 
    '{email}', 
    '"admin@toursred.com"'
  )
WHERE email = 'tourredmx@gmail.com';
