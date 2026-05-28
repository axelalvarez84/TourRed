/*
  # Fix bookings RLS SELECT: usar current_user_has_role (SECURITY DEFINER)

  El problema con auth.jwt()->'user_metadata'->>'role' es que puede no estar
  disponible dependiendo de como Supabase construye el JWT en el cliente.

  La funcion current_user_has_role() ya existe con SECURITY DEFINER=true,
  lo que significa que corre como el owner de la BD (bypassa RLS de users)
  y NO causa recursion infinita. Es la solucion correcta y ya probada.
*/

DROP POLICY IF EXISTS "Users agencies and admins can read bookings" ON bookings;

CREATE POLICY "Users agencies and admins can read bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = bookings.agency_id
        AND agencies.user_id = (SELECT auth.uid())
    )
    OR
    current_user_has_role(ARRAY['admin'::text])
  );
