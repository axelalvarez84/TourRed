/*
  # Extender expiración automática de suplementos a estado pending_payment

  ## Cambios
  - Modifica la función `expire_supplement_approvals()` para que también cancele
    suplementos en estado `pending_payment` cuyo `expires_at < now()`.
  - Anteriormente solo cancelaba suplementos en estado `approved`.
  - Esto permite que el cron job existente (cada hora) también limpie pagos
    pendientes cuya ventana de 48h ya venció.
*/

CREATE OR REPLACE FUNCTION public.expire_supplement_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE booking_supplements
  SET
    status       = 'cancelled',
    cancelled_at = now(),
    cancelled_by = 'expiry',
    updated_at   = now()
  WHERE
    status IN ('approved', 'pending_payment')
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
