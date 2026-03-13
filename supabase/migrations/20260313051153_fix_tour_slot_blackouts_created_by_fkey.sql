/*
  # Fix tour_slot_blackouts created_by foreign key

  ## Problem
  The `created_by` column has a FK to `public.users`, but the value being
  inserted is an `auth.uid()` UUID. If the user's record in `public.users`
  was not yet created or differs from `auth.users`, the insert fails with
  a foreign key violation.

  ## Solution
  Drop the FK constraint on `created_by` since it references `public.users`
  but we store `auth.uid()` values (which live in `auth.users`).
  The column remains nullable so existing rows are unaffected.
*/

ALTER TABLE tour_slot_blackouts
  DROP CONSTRAINT IF EXISTS tour_slot_blackouts_created_by_fkey;
