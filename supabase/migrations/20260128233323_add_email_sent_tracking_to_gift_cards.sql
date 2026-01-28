/*
  # Add email sent tracking to gift cards
  
  1. Changes
    - Add `email_sent` boolean field to track if purchase email has been sent
    - Add `email_sent_at` timestamp to track when email was sent
  
  2. Purpose
    - Prevent duplicate email sending when multiple webhook events fire
    - Ensure customers receive exactly one email per purchase
*/

ALTER TABLE gift_cards 
ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;