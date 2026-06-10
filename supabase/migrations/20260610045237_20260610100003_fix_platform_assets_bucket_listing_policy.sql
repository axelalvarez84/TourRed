/*
  # Prioridad 3: Restringir política de listado del bucket platform-assets

  El bucket platform-assets tiene public = true, lo que significa que:
  - El acceso directo a archivos por URL (CDN) funciona sin RLS para buckets públicos
  - La política SELECT "platform_assets_public_read" con solo (bucket_id = 'platform-assets')
    habilita explícitamente el LISTADO completo del bucket para cualquier usuario

  Fix:
  - DROP la política pública que permite listado anónimo
  - Agregar política SELECT restringida a admins para que puedan listar desde el panel
  - El acceso público a archivos individuales sigue funcionando via URL del bucket público
    (getPublicUrl() no requiere RLS en buckets públicos)
*/

-- Eliminar la política que permite listado público del bucket completo
DROP POLICY IF EXISTS "platform_assets_public_read" ON storage.objects;

-- Los admins pueden listar y acceder a archivos del bucket (para gestión en AdminSettings)
CREATE POLICY "platform_assets_admin_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'platform-assets'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role IN ('admin', 'super_admin')
    )
  );
