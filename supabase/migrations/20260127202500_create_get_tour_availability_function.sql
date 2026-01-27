/*
  # Create get_tour_availability function

  1. New Functions
    - `get_tour_availability(tour_id uuid)`: Returns real-time availability calculation
      - Calculates total travelers in confirmed and pending bookings
      - Returns available spots and max capacity
      - Single source of truth to prevent overbooking

  2. Security
    - Public function, readable by all users
    - Returns real-time availability data
    - Used for all availability calculations to prevent race conditions
*/

CREATE OR REPLACE FUNCTION get_tour_availability(p_tour_id uuid)
RETURNS TABLE (
  available_spots integer,
  max_capacity integer,
  total_booked integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    GREATEST(
      0,
      COALESCE(
        CASE
          WHEN t.available_spots IS NOT NULL AND t.available_spots > 0
          THEN t.available_spots
          ELSE COALESCE(t.max_travelers, 10)
        END,
        10
      ) - COALESCE(SUM(b.travelers_count), 0)
    )::integer as available_spots,
    COALESCE(
      CASE
        WHEN t.available_spots IS NOT NULL AND t.available_spots > 0
        THEN t.available_spots
        ELSE COALESCE(t.max_travelers, 10)
      END,
      10
    )::integer as max_capacity,
    COALESCE(SUM(b.travelers_count), 0)::integer as total_booked
  FROM tours t
  LEFT JOIN bookings b
    ON b.tour_id = t.id
    AND b.status IN ('confirmed', 'pending')
  WHERE t.id = p_tour_id
  GROUP BY t.id, t.available_spots, t.max_travelers;
END;
$$ LANGUAGE plpgsql STABLE;
