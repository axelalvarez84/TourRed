/*
  # Permitir a ejecutivos subir contratos firmados

  ## Problema
  La política INSERT del bucket 'signed-contracts' solo permitía admins.
  Los ejecutivos de cuenta no podían subir el contrato al aprobar una agencia.

  ## Cambio
  Nueva política INSERT para ejecutivos activos en el bucket 'signed-contracts'.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Executives can upload signed contracts for their agencies'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Executives can upload signed contracts for their agencies"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'signed-contracts'
          AND EXISTS (
            SELECT 1 FROM account_executives ae
            WHERE ae.user_id = (SELECT auth.uid())
              AND ae.is_active = true
          )
        )
    $p$;
  END IF;
END $$;
