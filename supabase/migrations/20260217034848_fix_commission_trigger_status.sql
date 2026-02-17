/*
  # Fix commission record trigger to use correct status

  1. Changes
    - Update create_commission_record() function to set status='pending' instead of 'processed'
    - Fix get_agency_financial_summary() to correctly calculate pending_payouts
    
  2. Notes
    - This fixes the bug where commissions were auto-created with wrong status
    - Commissions should start as 'pending' and only become 'processed' after admin pays them
*/

-- Corregir el trigger para crear comisiones con status 'pending'
CREATE OR REPLACE FUNCTION create_commission_record()
RETURNS TRIGGER AS $$
DECLARE
  commission_breakdown RECORD;
BEGIN
  -- Solo crear registro si el pago fue exitoso
  IF NEW.payment_status = 'succeeded' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'succeeded') THEN
    
    -- Calcular breakdown de comisiones
    SELECT * INTO commission_breakdown 
    FROM calculate_commission_breakdown(NEW.total_price);
    
    -- Insertar registro de comisión con status 'pending'
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
      'pending'  -- Cambiado de 'processed' a 'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Corregir la función get_agency_financial_summary
CREATE OR REPLACE FUNCTION get_agency_financial_summary(agency_uuid uuid)
RETURNS TABLE(
  total_bookings bigint,
  total_revenue decimal,
  total_commissions decimal,
  net_earnings decimal,
  pending_payouts decimal
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(cr.id) as total_bookings,
    SUM(cr.total_tour_price) as total_revenue,
    SUM(cr.agency_commission_amount) as total_commissions,
    SUM(cr.agency_net_amount) as net_earnings,
    SUM(CASE WHEN cr.status = 'pending' THEN cr.agency_net_amount ELSE 0 END) as pending_payouts
  FROM commission_records cr
  WHERE cr.agency_id = agency_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;