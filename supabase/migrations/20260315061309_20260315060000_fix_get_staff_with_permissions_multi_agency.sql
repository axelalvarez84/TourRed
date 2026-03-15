/*
  # Fix get_staff_with_permissions: support multi-agency coordinators

  ## Summary
  Removes the LIMIT 1 from the get_staff_with_permissions function so it returns
  ALL active agency links for a given user (one row per agency). This enables
  coordinators to be linked to multiple agencies simultaneously.

  ## Changes
  - Drops and recreates get_staff_with_permissions without the LIMIT 1 clause
  - All other columns and logic remain identical
  - The function continues to filter WHERE is_active = true

  ## Impact
  - A coordinator linked to Agency A and Agency B will now get 2 rows
  - The frontend AuthContext will build an array of AgencyStaffInfo objects
  - The user can then switch between agencies via the new agency switcher in NavBar
*/

DROP FUNCTION IF EXISTS public.get_staff_with_permissions(uuid);

CREATE OR REPLACE FUNCTION public.get_staff_with_permissions(p_user_id uuid)
RETURNS TABLE (
  staff_id uuid,
  agency_id uuid,
  agency_name text,
  title text,
  is_active boolean,
  can_scan_checkin boolean,
  can_view_bookings boolean,
  can_view_tours boolean,
  can_edit_tours boolean,
  can_manage_tours boolean,
  can_view_financials boolean,
  can_view_reports boolean,
  can_manage_discount_codes boolean,
  can_view_messages boolean,
  can_manage_destinations boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS staff_id,
    s.agency_id,
    a.name AS agency_name,
    s.title,
    s.is_active,
    COALESCE(p.can_scan_checkin, false),
    COALESCE(p.can_view_bookings, false),
    COALESCE(p.can_view_tours, false),
    COALESCE(p.can_edit_tours, false),
    COALESCE(p.can_manage_tours, false),
    COALESCE(p.can_view_financials, false),
    COALESCE(p.can_view_reports, false),
    COALESCE(p.can_manage_discount_codes, false),
    COALESCE(p.can_view_messages, false),
    COALESCE(p.can_manage_destinations, false)
  FROM agency_staff s
  JOIN agencies a ON a.id = s.agency_id
  LEFT JOIN agency_staff_permissions p ON p.staff_id = s.id
  WHERE s.user_id = p_user_id AND s.is_active = true
  ORDER BY s.linked_at ASC;
$$;
