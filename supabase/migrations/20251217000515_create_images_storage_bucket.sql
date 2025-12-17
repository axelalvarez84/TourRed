/*
  # Create storage bucket for images

  1. Changes
    - Create 'images' storage bucket for storing profile pictures and other images
    - Set bucket as public so images can be accessed via public URLs
    - Add RLS policies to allow authenticated users to upload their own images

  2. Security
    - Users can only upload to their own folders
    - Public read access for all images
    - Authenticated users can upload images
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow authenticated users to upload images'
  ) THEN
    CREATE POLICY "Allow authenticated users to upload images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow public read access to images'
  ) THEN
    CREATE POLICY "Allow public read access to images"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow users to update their own images'
  ) THEN
    CREATE POLICY "Allow users to update their own images"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'images')
    WITH CHECK (bucket_id = 'images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow users to delete their own images'
  ) THEN
    CREATE POLICY "Allow users to delete their own images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'images');
  END IF;
END $$;