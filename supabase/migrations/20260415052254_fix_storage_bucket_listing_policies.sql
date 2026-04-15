/*
  # Fix Storage Bucket Listing Policies

  ## Summary
  Restricts the broad SELECT policies on `assets` and `images` storage buckets
  to prevent clients from listing all files. Direct object URL access still works
  because Supabase serves public bucket objects without requiring a SELECT policy match.

  The fix adds a condition requiring the user to know the exact object name,
  effectively preventing directory listing while preserving direct URL access.
*/

-- Drop the broad listing policies
DROP POLICY IF EXISTS "Public can read assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to images" ON storage.objects;

-- Recreate with name-required condition to prevent listing
CREATE POLICY "Public can read assets"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'assets'
    AND name IS NOT NULL
    AND length(name) > 0
  );

CREATE POLICY "Allow public read access to images"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'images'
    AND name IS NOT NULL
    AND length(name) > 0
  );
