/*
  # Add Renewal Reminder Tracking to Memberships

  1. Changes
    - Add `renewal_reminder_sent` column to track if reminder was sent
    - Add `renewal_reminder_sent_at` column to track when reminder was sent
    
  2. Purpose
    - Track which memberships have already received renewal reminders
    - Prevent duplicate reminder emails
    - Enable automated reminder system 5 days before renewal
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memberships' AND column_name = 'renewal_reminder_sent'
  ) THEN
    ALTER TABLE public.memberships 
    ADD COLUMN renewal_reminder_sent boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memberships' AND column_name = 'renewal_reminder_sent_at'
  ) THEN
    ALTER TABLE public.memberships 
    ADD COLUMN renewal_reminder_sent_at timestamptz;
  END IF;
END $$;
