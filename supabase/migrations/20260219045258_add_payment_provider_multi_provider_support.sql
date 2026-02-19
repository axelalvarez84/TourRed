/*
  # Multi-Provider Payment Support

  ## Summary
  Adds infrastructure to support multiple payment providers (Stripe, MercadoPago, PayPal)
  across bookings, gift cards, and platform settings.

  ## Changes

  ### Modified Tables
  - `bookings`: Added `payment_provider` column (stripe | mercadopago | paypal)
  - `gift_cards`: Added `payment_provider` column
  - `platform_settings`: Added provider enable/disable flags and credential fields

  ## New Columns

  ### bookings.payment_provider
  - Tracks which payment provider was used for each booking
  - Defaults to 'stripe' for backward compatibility

  ### gift_cards.payment_provider
  - Tracks which payment provider was used to purchase the gift card
  - Defaults to 'stripe' for backward compatibility

  ### platform_settings
  - `mercadopago_enabled`: Whether MercadoPago is enabled for bookings and gift cards
  - `paypal_enabled`: Whether PayPal is enabled for bookings and gift cards
  - `mercadopago_public_key`: MercadoPago public key (non-sensitive, stored in DB for frontend)
  - `paypal_client_id`: PayPal client ID (non-sensitive, stored in DB for frontend)

  ## Security Notes
  - Sensitive credentials (secret keys) are stored as Supabase Edge Function secrets, not in DB
  - Only non-sensitive public identifiers are stored in platform_settings
  - RLS policies remain unchanged; payment_provider is just metadata
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_provider text DEFAULT 'stripe' CHECK (payment_provider IN ('stripe', 'mercadopago', 'paypal'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gift_cards' AND column_name = 'payment_provider'
  ) THEN
    ALTER TABLE gift_cards ADD COLUMN payment_provider text DEFAULT 'stripe' CHECK (payment_provider IN ('stripe', 'mercadopago', 'paypal'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'mercadopago_enabled'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN mercadopago_enabled boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'paypal_enabled'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN paypal_enabled boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'mercadopago_public_key'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN mercadopago_public_key text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'paypal_client_id'
  ) THEN
    ALTER TABLE platform_settings ADD COLUMN paypal_client_id text DEFAULT '';
  END IF;
END $$;
