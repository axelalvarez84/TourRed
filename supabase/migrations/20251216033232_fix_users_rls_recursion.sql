/*
  # Fix Infinite Recursion in Users RLS Policies

  1. Changes
    - Drop policies that reference agency_reviews (causing recursion)
    - Keep only essential policies for users to access their own data
    
  2. Security
    - Users can only read/update their own profile
    - Public access to reviewer info will be handled via views instead of direct policies
*/

-- Drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "Anyone can view basic info of users who wrote agency reviews" ON users;
DROP POLICY IF EXISTS "Authenticated users can view basic info of reviewers" ON users;

-- The remaining policies are safe:
-- - "Users can read own data" - allows users to read their own profile
-- - "Users can insert own profile" - allows users to create their profile
-- - "Users can update own data" - allows users to update their own profile
