/*
  # Add name and tags fields to newsletter_subscriptions

  1. Changes
    - Add `name` field (text, nullable) - Subscriber's name
    - Add `tags` field (text array, default empty array) - Tags for categorizing subscriptions
    
  2. Notes
    - These fields allow better segmentation of newsletter subscribers
    - Tags can be used to identify the source or interest area (e.g., 'international_tours_waitlist')
*/

-- Add name column (nullable since existing records won't have it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'newsletter_subscriptions' AND column_name = 'name'
  ) THEN
    ALTER TABLE newsletter_subscriptions ADD COLUMN name text;
  END IF;
END $$;

-- Add tags column (array of text, default to empty array)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'newsletter_subscriptions' AND column_name = 'tags'
  ) THEN
    ALTER TABLE newsletter_subscriptions ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
END $$;

-- Create index on tags for better query performance
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_tags ON newsletter_subscriptions USING GIN(tags);