/*
  # Add SMTP API Key Field

  1. Changes
    - Add `smtp_api_key` column to `email_settings` table
    - Update default value with provided SMTP2GO API key
    
  2. Notes
    - This field will store the SMTP2GO API key for sending emails via their REST API
*/

-- Add smtp_api_key column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_settings' AND column_name = 'smtp_api_key'
  ) THEN
    ALTER TABLE email_settings ADD COLUMN smtp_api_key text;
  END IF;
END $$;

-- Update existing row with the API key
UPDATE email_settings 
SET smtp_api_key = 'api-D1F65BD8A6DC496489C600EC517B9FF1'
WHERE smtp_api_key IS NULL OR smtp_api_key = '';