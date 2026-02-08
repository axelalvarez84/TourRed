/*
  # Add name changes restriction to tours

  1. New Columns in `tours`
    - `name_changes_not_allowed` (boolean, default false) - When true, travelers cannot modify companion names after booking is paid. Useful for airline tours with nominal tickets.

  2. Important Notes
    - This flag only blocks name changes after payment
    - Before payment, travelers can still edit names freely but will see a warning
    - Follows same pattern as existing `cancellation_not_allowed` column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tours' AND column_name = 'name_changes_not_allowed'
  ) THEN
    ALTER TABLE tours ADD COLUMN name_changes_not_allowed boolean NOT NULL DEFAULT false;
  END IF;
END $$;