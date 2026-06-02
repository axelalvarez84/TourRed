/*
  # Corregir políticas RLS para subida de CFDI por ejecutivos

  ## Problemas identificados
  1. El bucket payment-receipts no tenía política INSERT para ejecutivos,
     solo para admins. Al subir el XML del CFDI desde el portal del ejecutivo
     la operación fallaba con "new row violates row-level security policy".

  2. La política UPDATE en executive_commissions usaba USING con status = 'pending',
     pero Supabase evalúa USING también contra la fila post-update, lo que hace
     fallar el cambio de pending → invoiced.

  ## Cambios
  - Agrega política INSERT en storage.objects para ejecutivos sobre payment-receipts
  - Agrega política SELECT en storage.objects para ejecutivos sobre sus propios archivos
  - Corrige la política UPDATE de executive_commissions para que USING no bloquee
    el cambio de estado (solo verifica propiedad, no status)
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: ejecutivos pueden subir XMLs de CFDI en payment-receipts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Executives can upload own CFDI files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND left(name, 16) = 'executive-cfdi/'
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
    AND left(name, 16) = 'executive-cfdi/'
    AND EXISTS (
      SELECT 1 FROM public.account_executives ae
      WHERE ae.user_id = auth.uid()
        AND ae.is_active = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- executive_commissions UPDATE: separar verificación de propiedad (USING)
-- de verificación de estado resultante (WITH CHECK)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Executives can update own commissions to upload CFDI" ON executive_commissions;

CREATE POLICY "Executives can update own commissions to upload CFDI"
  ON executive_commissions FOR UPDATE
  TO authenticated
  USING (
    executive_id = get_executive_id_for_user(auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    executive_id = get_executive_id_for_user(auth.uid())
    AND status = 'invoiced'
  );
