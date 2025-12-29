/*
  # Corregir función update_conversation para usar search_path correcto

  1. Cambios
    - Agregar SET search_path = public a la función
    - Esto previene problemas de seguridad y recursión

  2. Seguridad
    - Mantiene verificaciones de permisos existentes
*/

CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;