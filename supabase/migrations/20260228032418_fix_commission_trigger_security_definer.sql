/*
  # Fix commission record trigger - restore SECURITY DEFINER

  ## Problema
  La migración 20260217034848 redefinió create_commission_record() sin SECURITY DEFINER,
  lo que hace que el trigger falle con error RLS cuando un viajero paga con puntos o
  ToursRed Cash (el UPDATE de bookings lo ejecuta el usuario autenticado, no un superusuario).

  ## Cambios
  - Redefine create_commission_record() con SECURITY DEFINER y SET search_path = public
  - Mantiene status = 'pending' (corrección previa)
  - Agrega LANGUAGE plpgsql explícito junto con SECURITY DEFINER
*/

CREATE OR REPLACE FUNCTION create_commission_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  commission_breakdown RECORD;
BEGIN
  IF NEW.payment_status = 'succeeded' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'succeeded') THEN
    SELECT * INTO commission_breakdown
    FROM calculate_commission_breakdown(NEW.total_price);

    INSERT INTO commission_records (
      booking_id,
      agency_id,
      tour_id,
      total_tour_price,
      agency_commission_amount,
      service_charge_amount,
      platform_total_revenue,
      agency_net_amount,
      status
    ) VALUES (
      NEW.id,
      NEW.agency_id,
      NEW.tour_id,
      NEW.total_price,
      commission_breakdown.agency_commission,
      commission_breakdown.service_charge,
      commission_breakdown.platform_revenue,
      commission_breakdown.agency_net_amount,
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;
