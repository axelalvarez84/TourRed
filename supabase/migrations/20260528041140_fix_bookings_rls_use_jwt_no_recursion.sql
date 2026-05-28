/*
  # Fix bookings RLS: eliminar recursion infinita con users

  El problema: la politica anterior consultaba la tabla users para verificar
  si el usuario es admin, pero users tiene una politica que consulta bookings,
  creando recursion infinita (error 42P17).

  Solucion: usar auth.jwt() para leer el rol directamente del JWT sin tocar
  ninguna tabla. El rol 'admin' esta almacenado en raw_user_meta_data->>'role'
  y es accesible como auth.jwt()->'user_metadata'->>'role'.
*/

DROP POLICY IF EXISTS "Users agencies and admins can read bookings" ON bookings;

CREATE POLICY "Users agencies and admins can read bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    -- El usuario es dueno de la reserva
    (SELECT auth.uid()) = user_id
    OR
    -- El usuario pertenece a la agencia de la reserva
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = bookings.agency_id
        AND agencies.user_id = (SELECT auth.uid())
    )
    OR
    -- El usuario es admin o super_admin segun su JWT (sin tocar tabla users)
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
