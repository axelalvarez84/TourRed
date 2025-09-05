/*
  # Fix destination_images table schema

  1. Changes
    - Make `image_url` column nullable in `destination_images` table
    - This allows storing images as either base64 data OR URLs, not requiring both

  2. Security
    - No changes to RLS policies needed
    - Maintains existing security model
*/

-- Make image_url nullable to allow base64-only images
ALTER TABLE destination_images 
ALTER COLUMN image_url DROP NOT NULL;

-- Add a check constraint to ensure at least one image source is provided
ALTER TABLE destination_images 
ADD CONSTRAINT destination_images_image_source_check 
CHECK (
  (image_url IS NOT NULL AND image_url != '') OR 
  (image_base64 IS NOT NULL AND image_base64 != '')
);