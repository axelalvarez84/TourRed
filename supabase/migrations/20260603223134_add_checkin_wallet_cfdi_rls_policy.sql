/*
  # Agregar acceso RLS para CFDIs de tipo checkin_wallet

  ## Cambio
  La política SELECT "Users, agencies and admins can view cfdi invoices" no incluye
  el tipo `checkin_wallet`, por lo que los viajeros no pueden ver sus propias facturas
  de cobro en check-in.

  ## Solución
  Se agrega una condición OR que permite a viajeros leer CFDIs de tipo `checkin_wallet`
  cuando son dueños del `booking_id` asociado.

  La condición de agencia (por `agency_id`) ya cubre el acceso desde el panel de agencia.
*/

DROP POLICY IF EXISTS "Users, agencies and admins can view cfdi invoices" ON cfdi_invoices;

CREATE POLICY "Users, agencies and admins can view cfdi invoices"
  ON cfdi_invoices
  FOR SELECT
  TO authenticated
  USING (
    -- Viajero ve su factura de reserva
    (invoice_type = 'booking' AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cfdi_invoices.booking_id
        AND bookings.user_id = (SELECT auth.uid())
    ))
    OR
    -- Viajero ve su factura de cobro en check-in
    (invoice_type = 'checkin_wallet' AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = cfdi_invoices.booking_id
        AND bookings.user_id = (SELECT auth.uid())
    ))
    OR
    -- Viajero ve su factura de membresía
    (membership_id IN (
      SELECT memberships.id FROM memberships
      WHERE memberships.user_id = (SELECT auth.uid())
    ))
    OR
    -- Agencia ve sus facturas (reservas y comisiones y checkin_wallet)
    EXISTS (
      SELECT 1 FROM agencies
      WHERE agencies.id = cfdi_invoices.agency_id
        AND agencies.user_id = (SELECT auth.uid())
    )
    OR
    -- Admins ven todo
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
        AND users.role = ANY (ARRAY['admin'::text, 'super_admin'::text])
    )
  );
