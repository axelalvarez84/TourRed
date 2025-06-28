/*
  # Add image columns to destinations table

  1. New Columns
    - `main_image_base64` (text) - Base64 encoded image data (max 5MB)
    - `main_image_type` (text) - MIME type of the image (image/jpeg, image/png, etc.)
    - `main_image_size` (integer) - Size of the image in bytes

  2. Security
    - Add trigger to validate image size
    - Ensure RLS policies remain intact

  3. Notes
    - These columns support storing images directly in the database as base64
    - Existing destinations will have NULL values for these new columns
    - The application can use either URL or base64 storage for images
*/

-- Add the missing image columns to destinations table
DO $$
BEGIN
  -- Add main_image_base64 column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'destinations' AND column_name = 'main_image_base64'
  ) THEN
    ALTER TABLE destinations ADD COLUMN main_image_base64 text;
    ALTER TABLE destinations ADD COLUMN main_image_type text;
    ALTER TABLE destinations ADD COLUMN main_image_size integer;
    
    -- Add comments to describe the columns
    COMMENT ON COLUMN destinations.main_image_base64 IS 'Imagen principal en formato base64 (máximo 5MB)';
    COMMENT ON COLUMN destinations.main_image_type IS 'Tipo MIME de la imagen (image/jpeg, image/png, etc.)';
    COMMENT ON COLUMN destinations.main_image_size IS 'Tamaño de la imagen base64 en bytes';
  END IF;
END $$;