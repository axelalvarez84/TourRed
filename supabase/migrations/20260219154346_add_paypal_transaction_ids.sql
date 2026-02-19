/*
  # Agregar IDs de transaccion PayPal a bookings y gift_cards

  ## Descripcion
  Se agregan dos columnas nuevas para rastrear los identificadores de PayPal:
  - `paypal_order_id`: El ID de la orden creada al iniciar el pago (ej. "8AB12345XY")
  - `paypal_transaction_id`: El ID de la transaccion capturada (ej. "5SM64791CA761433R"),
    que es el que aparece en el panel de PayPal Business y en el correo que recibe el comprador.

  ## Tablas modificadas

  ### bookings
  - Nueva columna `paypal_order_id text` - ID de la orden PayPal antes del pago
  - Nueva columna `paypal_transaction_id text` - ID final de la transaccion capturada

  ### gift_cards
  - Nueva columna `paypal_order_id text` - ID de la orden PayPal antes del pago
  - Nueva columna `paypal_transaction_id text` - ID final de la transaccion capturada

  ## Notas
  - Columnas nullable para no afectar reservas/tarjetas existentes
  - Solo se poblaran para pagos realizados via PayPal
  - El paypal_transaction_id es el ID que el viajero recibe en su correo de PayPal
    y el que aparece en el panel de PayPal Business para conciliacion
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'paypal_order_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN paypal_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'paypal_transaction_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN paypal_transaction_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_cards' AND column_name = 'paypal_order_id'
  ) THEN
    ALTER TABLE gift_cards ADD COLUMN paypal_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_cards' AND column_name = 'paypal_transaction_id'
  ) THEN
    ALTER TABLE gift_cards ADD COLUMN paypal_transaction_id text;
  END IF;
END $$;
