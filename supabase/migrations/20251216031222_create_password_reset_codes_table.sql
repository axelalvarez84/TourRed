/*
  # Create Password Reset Codes Table

  1. New Tables
    - `password_reset_codes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `email` (text)
      - `code` (text, 6-digit code)
      - `expires_at` (timestamptz, expires in 15 minutes)
      - `used` (boolean, default false)
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on `password_reset_codes` table
    - No public access to this table
    - Only edge functions can insert/update
    
  3. Indexes
    - Index on user_id for faster lookups
    - Index on code for verification
*/

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id ON password_reset_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_code ON password_reset_codes(code);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires ON password_reset_codes(expires_at);

-- No policies needed - only edge functions will access this table
-- Edge functions run with elevated privileges using SECURITY DEFINER
