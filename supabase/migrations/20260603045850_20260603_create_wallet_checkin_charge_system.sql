/*
  # Sistema de Cobro con ToursRed Cash en Check-in

  ## Descripcion
  Permite a las agencias cobrar el saldo pendiente de una reserva usando el monedero
  ToursRed Cash del viajero durante el check-in, con verificacion por codigo OTP
  enviado al correo del viajero para prevenir cargos fraudulentos.

  ## Nuevas Tablas

  ### wallet_checkin_otps
  Almacena los codigos OTP temporales generados cuando una agencia solicita cobrar
  con el wallet del viajero durante el check-in. Expiran en 5 minutos.
  - booking_id: referencia a la reserva
  - code: codigo de 6 digitos
  - amount: monto que la agencia solicita cobrar (sin cargo por servicio)
  - expires_at: expira 5 minutos desde creacion
  - used: si ya fue utilizado
  - requested_by: usuario (agencia) que solicito el cobro

  ### wallet_checkin_charges
  Registro de auditoria de todos los cobros con wallet realizados en check-in.
  - booking_id: referencia a la reserva
  - amount_charged: monto del tour cobrado con wallet
  - service_charge_applied: cargo por servicio cobrado
  - membership_exemption_used: monto exentado por membresia
  - total_deducted_from_wallet: total real descontado del wallet
  - charged_by: agencia que realizo el cobro

  ## Cambios en Tablas Existentes
  - bookings: columna wallet_charged_at_checkin (total acumulado cobrado con wallet en check-in)

  ## Seguridad
  - RLS habilitado en ambas tablas
  - Solo la agencia/admin puede ver OTPs de sus reservas
  - Solo el viajero y admin pueden ver sus registros de cargo
*/

-- Tabla para OTPs de verificacion de cobro con wallet
CREATE TABLE IF NOT EXISTS wallet_checkin_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  code text NOT NULL,
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Tabla de auditoria de cobros con wallet en check-in
CREATE TABLE IF NOT EXISTS wallet_checkin_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_charged decimal(10,2) NOT NULL,
  service_charge_applied decimal(10,2) NOT NULL DEFAULT 0,
  membership_exemption_used decimal(10,2) NOT NULL DEFAULT 0,
  total_deducted_from_wallet decimal(10,2) NOT NULL,
  charged_by uuid NOT NULL REFERENCES auth.users(id),
  otp_id uuid REFERENCES wallet_checkin_otps(id),
  created_at timestamptz DEFAULT now()
);

-- Agregar columna a bookings para registrar total cobrado con wallet en check-in
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'wallet_charged_at_checkin'
  ) THEN
    ALTER TABLE bookings ADD COLUMN wallet_charged_at_checkin decimal(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Habilitar RLS
ALTER TABLE wallet_checkin_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_checkin_charges ENABLE ROW LEVEL SECURITY;

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_wallet_checkin_otps_booking_id ON wallet_checkin_otps(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallet_checkin_otps_expires_at ON wallet_checkin_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_wallet_checkin_charges_booking_id ON wallet_checkin_charges(booking_id);

-- RLS: wallet_checkin_otps
-- La agencia y admin pueden ver OTPs de sus reservas
CREATE POLICY "Agency and admin can view checkin otps"
  ON wallet_checkin_otps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN agencies ag ON ag.id = b.agency_id
      WHERE b.id = wallet_checkin_otps.booking_id
        AND (
          ag.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = (SELECT auth.uid())
              AND u.role IN ('admin', 'super_admin')
          )
        )
    )
  );

CREATE POLICY "System can insert checkin otps"
  ON wallet_checkin_otps FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update checkin otps"
  ON wallet_checkin_otps FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS: wallet_checkin_charges
-- El viajero puede ver los cobros de sus reservas
CREATE POLICY "Traveler can view own checkin charges"
  ON wallet_checkin_charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = wallet_checkin_charges.booking_id
        AND b.user_id = (SELECT auth.uid())
    )
  );

-- La agencia puede ver los cobros que realizo
CREATE POLICY "Agency can view their checkin charges"
  ON wallet_checkin_charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN agencies ag ON ag.id = b.agency_id
      WHERE b.id = wallet_checkin_charges.booking_id
        AND ag.user_id = (SELECT auth.uid())
    )
  );

-- Admin puede ver todos los cobros
CREATE POLICY "Admin can view all checkin charges"
  ON wallet_checkin_charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert checkin charges"
  ON wallet_checkin_charges FOR INSERT
  WITH CHECK (true);
