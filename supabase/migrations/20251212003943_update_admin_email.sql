
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
