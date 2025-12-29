/*
  # Arreglar función update_conversation_last_message

  1. Cambios
    - Actualizar la función para usar el esquema public explícitamente
    - Cambiar de `conversations` a `public.conversations`
    - Esto corrige el error "relation 'conversations' does not exist"

  2. Seguridad
    - Mantener SECURITY DEFINER
    - Mantener search_path seguro
*/

CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;