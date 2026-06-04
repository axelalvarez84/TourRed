/*
  # Sistema de Suplementos Adicionales para Tours

  ## Descripción
  Implementa el sistema de suplementos post-reserva que las agencias pueden ofrecer a los viajeros
  después de haber completado su reserva. A diferencia de los servicios opcionales (que se
  seleccionan al reservar), los suplementos se adquieren de forma independiente después.

  ## Casos de uso
  - Suplemento habitación sencilla / doble / triple
  - Selección de asiento en vuelos
  - Equipaje de mano o documentado
  - Cualquier extra que la agencia quiera ofrecer post-reserva

  ## Nuevas Tablas

  ### tour_supplements
  - id (uuid, PK)
  - tour_id (uuid, FK tours)
  - name (text) — nombre del suplemento
  - description (text, nullable) — descripción visible al viajero
  - price (numeric 10,2) — precio por unidad/persona
  - requires_approval (boolean, default false) — si la agencia debe aprobar antes del pago
  - is_cancellable (boolean, default false) — si el viajero puede cancelarlo después de pagar
  - max_capacity (integer, nullable) — cupo máximo; NULL = sin límite
  - is_active (boolean, default true)
  - display_order (integer, default 0)

  ### booking_supplements
  - id (uuid, PK)
  - booking_id (uuid, FK bookings)
  - tour_supplement_id (uuid, FK tour_supplements)
  - quantity (integer) — cantidad solicitada por el viajero
  - unit_price (numeric 10,2) — precio al momento de la solicitud (snapshot)
  - service_charge (numeric 10,2) — cargo de servicio neto cobrado al viajero
  - membership_exemption_used (numeric 10,2) — exención de membresía aplicada
  - supplement_commission (numeric 10,2) — comisión de plataforma sobre el suplemento
  - total_paid (numeric 10,2) — total real cobrado al viajero
  - status (text) — estado del suplemento
  - payment_method (text, nullable)
  - payment_intent_id (text, nullable)
  - rejection_note (text, nullable)
  - expires_at (timestamptz, nullable) — 48h después de aprobación para pagar
  - requested_at, approved_at, rejected_at, paid_at, cancelled_at
  - approved_by (uuid, nullable)
  - cancelled_by (text, nullable)
  - refund_amount (numeric 10,2)

  ## Cambios en tablas existentes
  - platform_settings: agregar supplement_commission_percentage (default 10%)

  ## Seguridad
  - RLS habilitado en ambas tablas con políticas estrictas
  - tour_supplements: lectura pública; escritura solo agencia propietaria del tour
  - booking_supplements: viajero ve los suyos; agencia ve los de sus tours; admin ve todo
*/

-- ==========================================
-- TABLA: tour_supplements
-- ==========================================
CREATE TABLE IF NOT EXISTS tour_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  requires_approval boolean NOT NULL DEFAULT false,
  is_cancellable boolean NOT NULL DEFAULT false,
  max_capacity integer CHECK (max_capacity IS NULL OR max_capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tour_supplements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tour_supplements_tour_id ON tour_supplements(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_supplements_active ON tour_supplements(tour_id, is_active);

CREATE POLICY "Anyone can view active tour supplements"
  ON tour_supplements FOR SELECT
  USING (true);

CREATE POLICY "Agency can insert supplements for own tours"
  ON tour_supplements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tours t
      JOIN agencies a ON a.id = t.agency_id
      WHERE t.id = tour_supplements.tour_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Agency can update supplements for own tours"
  ON tour_supplements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours t
      JOIN agencies a ON a.id = t.agency_id
      WHERE t.id = tour_supplements.tour_id
        AND a.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tours t
      JOIN agencies a ON a.id = t.agency_id
      WHERE t.id = tour_supplements.tour_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Agency can delete supplements for own tours"
  ON tour_supplements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours t
      JOIN agencies a ON a.id = t.agency_id
      WHERE t.id = tour_supplements.tour_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

-- ==========================================
-- TABLA: booking_supplements
-- ==========================================
CREATE TABLE IF NOT EXISTS booking_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tour_supplement_id uuid NOT NULL REFERENCES tour_supplements(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(10, 2) NOT NULL DEFAULT 0,
  service_charge numeric(10, 2) NOT NULL DEFAULT 0,
  membership_exemption_used numeric(10, 2) NOT NULL DEFAULT 0,
  supplement_commission numeric(10, 2) NOT NULL DEFAULT 0,
  total_paid numeric(10, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'pending_payment', 'paid', 'cancelled')),
  payment_method text,
  payment_intent_id text,
  rejection_note text,
  expires_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  cancelled_at timestamptz,
  cancelled_by text CHECK (cancelled_by IN ('traveler', 'agency', 'system', 'expiry', 'tour_cancellation')),
  refund_amount numeric(10, 2) NOT NULL DEFAULT 0,
  cfdi_invoice_id uuid,
  points_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_supplements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_booking_supplements_booking_id ON booking_supplements(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_supplements_supplement_id ON booking_supplements(tour_supplement_id);
CREATE INDEX IF NOT EXISTS idx_booking_supplements_status ON booking_supplements(status);
CREATE INDEX IF NOT EXISTS idx_booking_supplements_expires_at ON booking_supplements(expires_at) WHERE status = 'approved';

-- Viajero ve sus propios suplementos
CREATE POLICY "Traveler can view own booking supplements"
  ON booking_supplements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_supplements.booking_id
        AND b.user_id = (SELECT auth.uid())
    )
  );

-- Agencia ve los suplementos de sus tours
CREATE POLICY "Agency can view supplements for own tour bookings"
  ON booking_supplements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN tours t ON t.id = b.tour_id
      JOIN agencies a ON a.id = t.agency_id
      WHERE b.id = booking_supplements.booking_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

-- Viajero puede insertar (solicitar) suplementos en sus propias reservas
CREATE POLICY "Traveler can insert supplements on own bookings"
  ON booking_supplements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_supplements.booking_id
        AND b.user_id = (SELECT auth.uid())
    )
  );

-- Admin ve todo
CREATE POLICY "Admin can view all booking supplements"
  ON booking_supplements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('admin', 'super_admin')
    )
  );

-- Service role puede hacer todo (edge functions)
CREATE POLICY "Service role can manage booking supplements"
  ON booking_supplements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================
-- CAMPO: supplement_commission_percentage en platform_settings
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings'
      AND column_name = 'supplement_commission_percentage'
  ) THEN
    ALTER TABLE platform_settings
      ADD COLUMN supplement_commission_percentage numeric(5, 2) NOT NULL DEFAULT 10.00;
  END IF;
END $$;

-- ==========================================
-- FUNCIÓN: cupo disponible para un suplemento
-- ==========================================
CREATE OR REPLACE FUNCTION get_supplement_available_capacity(p_supplement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_max_capacity integer;
  v_used integer;
BEGIN
  SELECT max_capacity INTO v_max_capacity
  FROM tour_supplements
  WHERE id = p_supplement_id;

  IF v_max_capacity IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(bs.quantity), 0) INTO v_used
  FROM booking_supplements bs
  WHERE bs.tour_supplement_id = p_supplement_id
    AND bs.status NOT IN ('rejected', 'cancelled');

  RETURN GREATEST(0, v_max_capacity - v_used);
END;
$$;

GRANT EXECUTE ON FUNCTION get_supplement_available_capacity(uuid) TO authenticated, anon;

-- ==========================================
-- FUNCIÓN: expirar aprobaciones de suplementos vencidas
-- Marca como 'cancelled' (cancelled_by='expiry') los suplementos aprobados
-- cuyo expires_at ya pasó y aún están en estado 'approved'
-- ==========================================
CREATE OR REPLACE FUNCTION expire_supplement_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE booking_supplements
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = 'expiry',
    updated_at = now()
  WHERE status = 'approved'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION expire_supplement_approvals() TO service_role;
