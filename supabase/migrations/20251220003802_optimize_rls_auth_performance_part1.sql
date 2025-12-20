/*
  # Optimize RLS policies - Part 1: Core tables

  1. Changes
    - Replace auth.uid() with (select auth.uid()) in RLS policies
    - This prevents re-evaluation of auth functions for each row
    - Significantly improves query performance at scale
    - Part 1 covers: users, agencies, bookings, tours tables
  
  2. Security Notes
    - No changes to security logic, only performance optimization
    - All existing access controls remain the same
*/

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Agencies can view travelers with bookings" ON public.users;
CREATE POLICY "Agencies can view travelers with bookings"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.user_id = (select auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.user_id = users.id
        AND b.agency_id = a.id
      )
    )
  );

-- ============================================================================
-- AGENCIES TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Agencies can create own profile" ON public.agencies;
CREATE POLICY "Agencies can create own profile"
  ON public.agencies
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Agencies can update own profile" ON public.agencies;
CREATE POLICY "Agencies can update own profile"
  ON public.agencies
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can update agency commission" ON public.agencies;
CREATE POLICY "Admins can update agency commission"
  ON public.agencies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- ============================================================================
-- BOOKINGS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
CREATE POLICY "Users can create bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own bookings" ON public.bookings;
CREATE POLICY "Users can read own bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Agencies can read own tour bookings" ON public.bookings;
CREATE POLICY "Agencies can read own tour bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies
      WHERE id = bookings.agency_id
      AND user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TOURS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Agencies can manage own tours" ON public.tours;
CREATE POLICY "Agencies can manage own tours"
  ON public.tours
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies
      WHERE id = tours.agency_id
      AND user_id = (select auth.uid())
    )
  );
