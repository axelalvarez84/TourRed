/*
  # Agregar politica RLS de UPDATE para commission_records

  ## Problema
  La tabla commission_records tenia politicas SELECT para admins y agencias,
  pero NO tenia ninguna politica de UPDATE. Esto causaba que el flujo de
  "Confirmar Pago" en AdminPayouts fallara silenciosamente: Supabase bloqueaba
  el UPDATE por RLS sin lanzar un error explícito en el cliente.

  ## Cambios
  - Nueva política UPDATE: permite a admins y super_admins actualizar registros
    de commission_records (para marcar pagos como procesados)

  ## Seguridad
  - Solo usuarios con rol admin o super_admin pueden actualizar comisiones
  - Se usa subquery con SELECT auth.uid() para evitar re-evaluacion y mejorar performance
*/

CREATE POLICY "Admins can update commission records"
  ON commission_records
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
    )
  );
