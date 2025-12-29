/*
  # Fix Admin Bookings Policy Recursion

  1. Changes
    - Remove the problematic "Admins can read all bookings" policy that causes infinite recursion
    - Create a SECURITY DEFINER function to check admin status safely
    - Add new admin policy using the safe function
  
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS and avoid recursion
    - Explicit schema qualification to prevent search_path exploits
    - Policy checks admin status through the safe function
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can read all bookings" ON bookings;

-- Create a safe function to check if user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
$$;

-- Add new admin policy using the safe function
CREATE POLICY "Admins can read all bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
