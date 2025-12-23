/*
  # Create Cookie Consents Table for Legal Compliance

  1. New Tables
    - `cookie_consents`
      - `id` (uuid, primary key)
      - `user_id` (uuid, nullable) - References auth.users if user is authenticated
      - `session_id` (text) - Unique session identifier for anonymous users
      - `consent_type` (text) - Either 'all' or 'essential-only'
      - `ip_address` (text, nullable) - IP address for audit trail
      - `user_agent` (text) - Browser user agent for audit trail
      - `created_at` (timestamptz) - When consent was given

  2. Security
    - Enable RLS on `cookie_consents` table
    - Only allow inserts from anyone (public access for recording consents)
    - Only admins can view consent records for legal auditing
    - No updates or deletes allowed to maintain audit trail integrity

  3. Indexes
    - Index on user_id for faster lookups
    - Index on session_id for anonymous user tracking
    - Index on created_at for audit reporting

  This table provides a complete audit trail for GDPR/LFPDPPP compliance,
  recording when users gave consent, what type of consent, and their details.
*/

CREATE TABLE IF NOT EXISTS cookie_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('all', 'essential-only')),
  ip_address text,
  user_agent text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record consent"
  ON cookie_consents
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can view all consents"
  ON cookie_consents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_cookie_consents_user_id ON cookie_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_session_id ON cookie_consents(session_id);
CREATE INDEX IF NOT EXISTS idx_cookie_consents_created_at ON cookie_consents(created_at DESC);
