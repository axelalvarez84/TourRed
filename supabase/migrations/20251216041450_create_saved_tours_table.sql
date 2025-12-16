/*
  # Create saved tours table

  1. New Tables
    - `saved_tours`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `tour_id` (uuid, references tours)
      - `created_at` (timestamp)
      - Unique constraint on (user_id, tour_id) to prevent duplicates
  
  2. Security
    - Enable RLS on `saved_tours` table
    - Add policy for authenticated users to view their own saved tours
    - Add policy for authenticated users to insert their own saved tours
    - Add policy for authenticated users to delete their own saved tours
  
  3. Notes
    - This table allows travelers to save tours they're interested in
    - Each user can only save a tour once (enforced by unique constraint)
*/

CREATE TABLE IF NOT EXISTS saved_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tour_id uuid REFERENCES tours(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, tour_id)
);

ALTER TABLE saved_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved tours"
  ON saved_tours FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save tours"
  ON saved_tours FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved tours"
  ON saved_tours FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);