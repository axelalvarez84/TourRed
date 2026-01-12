/*
  # Update international_tour_inquiries RLS policies to use can_manage_inquiries permission

  1. Changes
    - Update existing admin policies to check for can_manage_inquiries permission
    - This ensures only admins with the specific permission can access inquiries
    
  2. Security
    - Super admins will still have access regardless
    - Regular admins need the can_manage_inquiries permission explicitly granted
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all inquiries" ON public.international_tour_inquiries;
DROP POLICY IF EXISTS "Admins can update inquiries" ON public.international_tour_inquiries;

-- Create new policy for viewing inquiries (SELECT)
CREATE POLICY "Admins with permission can view inquiries"
  ON public.international_tour_inquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
      AND (
        users.is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM public.admin_permissions
          WHERE admin_permissions.user_id = users.id
          AND admin_permissions.can_manage_inquiries = true
        )
      )
    )
  );

-- Create new policy for updating inquiries (UPDATE)
CREATE POLICY "Admins with permission can update inquiries"
  ON public.international_tour_inquiries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
      AND (
        users.is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM public.admin_permissions
          WHERE admin_permissions.user_id = users.id
          AND admin_permissions.can_manage_inquiries = true
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
      AND (
        users.is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM public.admin_permissions
          WHERE admin_permissions.user_id = users.id
          AND admin_permissions.can_manage_inquiries = true
        )
      )
    )
  );