/*
  # Add INSERT policy for agencies table

  1. Security Changes
    - Add INSERT policy for `agencies` table to allow authenticated users to create their own agency profiles
    - Policy ensures users can only create agency profiles with their own user_id

  This fixes the RLS policy violation error when users try to register as agencies.
*/

-- Add INSERT policy for agencies table
CREATE POLICY "Agencies can create own profile"
  ON agencies
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);