/*
  # Crear alias para función de exención de membresía
  
  1. Propósito
    - Crear la función get_remaining_service_fee_exemption como alias de get_available_service_fee_exemption
    - Esto permite compatibilidad con el código del frontend
*/

CREATE OR REPLACE FUNCTION get_remaining_service_fee_exemption(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simplemente llamar a la función existente
  RETURN get_available_service_fee_exemption(p_user_id);
END;
$$;
