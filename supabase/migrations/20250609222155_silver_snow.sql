/*
  # Fix users table RLS policy for profile creation

  1. Security
    - Add INSERT policy for users table to allow authenticated users to create their own profile
    - This fixes the "new row violates row-level security policy" error during signup

  2. Changes
    - Add policy "Users can insert own profile" for INSERT operations
    - Policy allows authenticated users to insert records where auth.uid() = id
*/

-- Add INSERT policy for users table
CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);