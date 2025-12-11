/*
  # Create newsletter subscriptions table

  1. New Tables
    - `newsletter_subscriptions`
      - `id` (uuid, primary key) - Unique identifier for each subscription
      - `email` (text, unique, not null) - Subscriber email address
      - `subscribed_at` (timestamptz, default now()) - When they subscribed
      - `active` (boolean, default true) - Whether subscription is active
      - `ip_address` (text) - Optional IP address for tracking
      - `user_agent` (text) - Optional user agent for tracking

  2. Security
    - Enable RLS on `newsletter_subscriptions` table
    - Add policy for public to insert their own subscription
    - Add policy for authenticated admins to view all subscriptions

  3. Indexes
    - Add unique index on email for fast lookups and duplicate prevention
*/

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  subscribed_at timestamptz DEFAULT now() NOT NULL,
  active boolean DEFAULT true NOT NULL,
  ip_address text,
  user_agent text
);

-- Enable RLS
ALTER TABLE newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to subscribe (insert)
CREATE POLICY "Anyone can subscribe to newsletter"
  ON newsletter_subscriptions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can view subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON newsletter_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can update subscriptions (e.g., deactivate)
CREATE POLICY "Admins can update subscriptions"
  ON newsletter_subscriptions
  FOR UPDATE
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

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_email ON newsletter_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_active ON newsletter_subscriptions(active) WHERE active = true;