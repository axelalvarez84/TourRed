/*
  # Correccion de RFC duplicado y constraints faltantes

  ## Cambios

  ### 1. Limpiar RFC duplicado en viajeros
  - El viajero aalvarez@coldview.com tiene el mismo RFC que axelalvarez@outlook.com (AAHA84102489A)
  - Se establece su RFC en NULL para permitir crear el indice unico

  ### 2. Indice unico parcial en users.rfc para viajeros
  - Impide que dos viajeros tengan el mismo RFC
  - Es parcial: solo aplica cuando role = 'traveler' y rfc IS NOT NULL
  - No afecta agencias (tabla separada) ni viajeros sin RFC

  ### 3. Constraint unico compuesto en accounting_sync_log
  - Agrega UNIQUE(provider, record_type, record_id) que el upsert requiere
  - Sin este constraint, el upsert con onConflict falla silenciosamente
  - Causa raiz de que el historial de sincronizacion siempre aparece vacio
*/

-- 1. Limpiar RFC duplicado: dejar NULL al viajero con email aalvarez@coldview.com
UPDATE users
SET rfc = NULL,
    razon_social = NULL,
    regimen_fiscal = NULL,
    codigo_postal_fiscal = NULL,
    uso_cfdi = NULL
WHERE email = 'aalvarez@coldview.com'
  AND role = 'traveler'
  AND rfc = 'AAHA84102489A';

-- 2. Indice unico parcial para RFC de viajeros
CREATE UNIQUE INDEX IF NOT EXISTS users_traveler_rfc_unique
  ON users(rfc)
  WHERE role = 'traveler' AND rfc IS NOT NULL;

-- 3. Constraint unico compuesto en accounting_sync_log
--    Requerido para que el upsert con onConflict funcione correctamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'accounting_sync_log'
      AND constraint_name = 'accounting_sync_log_provider_record_type_record_id_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE accounting_sync_log
      ADD CONSTRAINT accounting_sync_log_provider_record_type_record_id_key
      UNIQUE (provider, record_type, record_id);
  END IF;
END $$;
