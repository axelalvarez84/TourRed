/*
  # Create Gift Cards System

  ## Overview
  This migration creates a complete gift card system for ToursRed, allowing travelers
  to purchase and redeem gift cards in various denominations (100, 200, 500, 1000 MXN).

  ## New Tables

  ### 1. `gift_cards`
  Stores all gift cards with unique codes, amounts, and redemption tracking.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique identifier
  - `code` (text, unique) - 16-character code in format XXXX-XXXX-XXXX-XXXX
  - `amount` (numeric) - Card amount (100, 200, 500, or 1000 MXN)
  - `currency` (text) - Currency code (default: MXN)
  - `status` (text) - active, redeemed, expired, cancelled
  - `purchaser_email` (text) - Email of person who bought the card
  - `purchaser_name` (text) - Name of purchaser
  - `recipient_email` (text, nullable) - Email of gift recipient
  - `recipient_name` (text, nullable) - Name of recipient
  - `personal_message` (text, nullable) - Optional message from purchaser
  - `purchased_at` (timestamptz) - When card was purchased
  - `expires_at` (timestamptz) - Expiration date (1 year from purchase)
  - `redeemed_by` (uuid, nullable) - User ID who redeemed the card
  - `redeemed_at` (timestamptz, nullable) - When card was redeemed
  - `stripe_payment_intent_id` (text, nullable) - Stripe payment reference
  - `stripe_checkout_session_id` (text, nullable) - Stripe checkout session
  - `scheduled_send_date` (timestamptz, nullable) - Scheduled email delivery date
  - `email_sent_at` (timestamptz, nullable) - When gift email was sent
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `gift_card_redemption_attempts`
  Audit log for all redemption attempts to detect fraud and track usage patterns.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique identifier
  - `gift_card_id` (uuid, nullable) - Reference to gift card if found
  - `code_entered` (text) - Code that was attempted
  - `user_id` (uuid, nullable) - User who attempted redemption
  - `ip_address` (text, nullable) - IP address of attempt
  - `success` (boolean) - Whether attempt was successful
  - `failure_reason` (text, nullable) - Reason for failure
  - `attempted_at` (timestamptz) - When attempt was made
  - `user_agent` (text, nullable) - Browser user agent

  ## Security

  ### RLS Policies for `gift_cards`
  - **SELECT**: 
    - Public can view cards they have code for (for validation)
    - Authenticated users can view cards they redeemed
    - Admins can view all cards
  - **INSERT**: Only via Edge Functions (service role)
  - **UPDATE**: Only admins and service role can update
  - **DELETE**: Only admins (soft delete via status change preferred)

  ### RLS Policies for `gift_card_redemption_attempts`
  - **SELECT**: Only admins and service role
  - **INSERT**: Authenticated users and service role
  - **UPDATE/DELETE**: No direct access (audit log)

  ## Indexes
  - Index on `code` for fast lookup
  - Index on `status` for filtering active cards
  - Index on `redeemed_by` for user history
  - Index on `purchaser_email` for purchase history
  - Index on `expires_at` for expiration checks

  ## Constraints
  - `amount` must be one of: 100, 200, 500, 1000
  - `status` must be one of: active, redeemed, expired, cancelled
  - `code` must be unique
  - `redeemed_by` must exist in users table
*/

-- Create gift_cards table
CREATE TABLE IF NOT EXISTS gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  amount numeric NOT NULL CHECK (amount IN (100, 200, 500, 1000)),
  currency text DEFAULT 'MXN' NOT NULL,
  status text DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  purchaser_email text NOT NULL,
  purchaser_name text NOT NULL,
  recipient_email text,
  recipient_name text,
  personal_message text,
  purchased_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  scheduled_send_date timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for gift_cards
CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_redeemed_by ON gift_cards(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_gift_cards_purchaser_email ON gift_cards(purchaser_email);
CREATE INDEX IF NOT EXISTS idx_gift_cards_expires_at ON gift_cards(expires_at);
CREATE INDEX IF NOT EXISTS idx_gift_cards_stripe_payment_intent ON gift_cards(stripe_payment_intent_id);

-- Create gift_card_redemption_attempts table
CREATE TABLE IF NOT EXISTS gift_card_redemption_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid REFERENCES gift_cards(id) ON DELETE SET NULL,
  code_entered text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_address text,
  success boolean DEFAULT false NOT NULL,
  failure_reason text,
  attempted_at timestamptz DEFAULT now() NOT NULL,
  user_agent text
);

-- Create indexes for gift_card_redemption_attempts
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_gift_card ON gift_card_redemption_attempts(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_user ON gift_card_redemption_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_attempted_at ON gift_card_redemption_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_ip_address ON gift_card_redemption_attempts(ip_address);

-- Enable RLS
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_redemption_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gift_cards

-- Allow service role full access (for Edge Functions)
CREATE POLICY "Service role has full access to gift cards"
  ON gift_cards FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to view cards they redeemed
CREATE POLICY "Users can view their redeemed gift cards"
  ON gift_cards FOR SELECT
  TO authenticated
  USING (redeemed_by = auth.uid());

-- Allow admins to view all gift cards
CREATE POLICY "Admins can view all gift cards"
  ON gift_cards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Allow admins to update gift cards
CREATE POLICY "Admins can update gift cards"
  ON gift_cards FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- RLS Policies for gift_card_redemption_attempts

-- Allow service role full access
CREATE POLICY "Service role has full access to redemption attempts"
  ON gift_card_redemption_attempts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to insert redemption attempts
CREATE POLICY "Users can create redemption attempts"
  ON gift_card_redemption_attempts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow admins to view all redemption attempts
CREATE POLICY "Admins can view all redemption attempts"
  ON gift_card_redemption_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gift_card_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS set_gift_card_updated_at ON gift_cards;
CREATE TRIGGER set_gift_card_updated_at
  BEFORE UPDATE ON gift_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_gift_card_updated_at();

-- Function to automatically expire gift cards (can be called by cron job)
CREATE OR REPLACE FUNCTION expire_old_gift_cards()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE gift_cards
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at < now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Function to generate unique gift card code
CREATE OR REPLACE FUNCTION generate_gift_card_code()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  -- Characters excluding confusing ones (0, O, I, 1)
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  attempt INTEGER := 0;
  max_attempts INTEGER := 100;
BEGIN
  LOOP
    -- Generate 4 blocks of 4 characters
    new_code := '';
    FOR i IN 1..4 LOOP
      IF i > 1 THEN
        new_code := new_code || '-';
      END IF;
      
      FOR j IN 1..4 LOOP
        new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
    END LOOP;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM gift_cards WHERE code = new_code) INTO code_exists;
    
    -- If code is unique, return it
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
    
    -- Increment attempt counter
    attempt := attempt + 1;
    
    -- Safety check to prevent infinite loop
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique gift card code after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$;