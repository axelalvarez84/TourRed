/*
  # Corregir políticas RLS de subida CFDI ejecutivos

  ## Problemas corregidos

  1. Storage policy "Executives can upload own CFDI files":
     left(name, 16) comparaba 16 chars pero 'executive-cfdi/' tiene 15.
     Se corrige usando starts_with() que es más robusto.

  2. executive_commissions UPDATE:
     WITH CHECK exigía status = 'invoiced' lo que bloqueaba cualquier
     re-intento si la fila ya estaba en invoiced (USING exige pending).
     Se simplifica: USING permite pending o invoiced (re-subida), 
     WITH CHECK solo verifica propiedad.
*/

-- Storage: corregir prefix check (15 chars, no 16)
DROP POLICY IF EXISTS "Executives can upload own CFDI files" ON storage.objects;
DROP POLICY IF EXISTS "Executives can view own CFDI files" ON storage.objects;

CREATE POLICY "Executives can upload own CFDI files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND starts_with(name, 'executive-cfdi/')
    AND EXISTS (
      SELECT 1 FROM public.account_executives ae
      WHERE ae.user_id = auth.uid()
        AND ae.is_active = true
    )
  );

CREATE POLICY "Executives can view own CFDI files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND starts_with(name, 'executive-cfdi/')
    AND EXISTS (
      SELECT 1 FROM public.account_executives ae
      WHERE ae.user_id = auth.uid()
        AND ae.is_active = true
    )
  );

-- executive_commissions: permitir actualizar mientras sea pending o invoiced
-- (para re-subidas), solo verificar propiedad en WITH CHECK
DROP POLICY IF EXISTS "Executives can update own commissions to upload CFDI" ON executive_commissions;

CREATE POLICY "Executives can update own commissions to upload CFDI"
  ON executive_commissions FOR UPDATE
  TO authenticated
  USING (
    executive_id = get_executive_id_for_user(auth.uid())
    AND status IN ('pending', 'invoiced', 'rejected')
  )
  WITH CHECK (
    executive_id = get_executive_id_for_user(auth.uid())
  );
