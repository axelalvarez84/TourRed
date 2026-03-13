/*
  # Allow null start_date and end_date for receptivo tours

  ## Changes
  - `tours.start_date`: Change from NOT NULL to nullable (receptivo tours don't have fixed dates)
  - `tours.end_date`: Change from NOT NULL to nullable (same reason)
  - `tours.booking_deadline`: Already nullable, no change needed

  ## Reason
  Receptivo tours operate on recurring schedules instead of fixed dates.
  The NOT NULL constraint on start_date and end_date was preventing creation of receptivo tours.
*/

ALTER TABLE public.tours ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE public.tours ALTER COLUMN end_date DROP NOT NULL;
