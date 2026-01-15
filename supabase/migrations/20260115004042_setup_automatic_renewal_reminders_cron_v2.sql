/*
  # Setup Automatic Renewal Reminders Cron Job

  1. Extensions
    - Enable `pg_cron` for scheduling tasks
    - Enable `pg_net` for HTTP requests from PostgreSQL
  
  2. Cron Job Configuration
    - Creates a daily cron job that runs at 9 AM Mexico City time (UTC-6)
    - Calls the `process-membership-renewal-reminders` edge function
    - Automatically sends renewal reminders to users 5 days before expiration
  
  3. Notes
    - The cron job runs daily without human intervention
    - Uses service role key for authentication
    - Logs execution in pg_cron.job_run_details table
    - Cron time: 15:00 UTC = 9:00 AM Mexico City (CST/CDT)
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant permissions to use pg_net
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;

-- First, unschedule if exists to avoid duplicates
SELECT cron.unschedule('send-membership-renewal-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-membership-renewal-reminders'
);

-- Create a function that calls the edge function
CREATE OR REPLACE FUNCTION public.trigger_renewal_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key text;
  request_id bigint;
BEGIN
  -- Get configuration from environment
  -- Note: In production, Supabase will have these available
  supabase_url := current_setting('request.headers', true)::json->>'x-forwarded-host';
  
  IF supabase_url IS NULL OR supabase_url = '' THEN
    -- Fallback: construct from known project reference
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  -- Make the HTTP request using pg_net
  -- Note: We use a placeholder for the service key which should be configured separately
  SELECT INTO request_id net.http_post(
    url := supabase_url || '/functions/v1/process-membership-renewal-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  
  -- Log the request
  RAISE NOTICE 'Triggered renewal reminders job, request_id: %', request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error triggering renewal reminders: %', SQLERRM;
END;
$$;

-- Schedule the cron job to run daily at 9 AM Mexico City time (3 PM UTC = 9 AM CST)
-- Format: '0 15 * * *' means "At minute 0 of hour 15 (3 PM UTC) every day"
SELECT cron.schedule(
  'send-membership-renewal-reminders',
  '0 15 * * *',
  'SELECT public.trigger_renewal_reminders();'
);