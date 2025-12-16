/*
  # Add profile picture to users table

  1. Changes
    - Add `profile_picture_url` column to `users` table to store user profile pictures
    - This allows travelers to upload their profile photo
    - The photo will be visible in the navigation bar and to agencies when viewing bookings

  2. Security
    - No new RLS policies needed as existing user policies already cover this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'profile_picture_url'
  ) THEN
    ALTER TABLE users ADD COLUMN profile_picture_url TEXT;
  END IF;
END $$;