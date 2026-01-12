/*
  # Add 'no_convertido' status to international tour inquiries

  1. Changes
    - Add 'no_convertido' (not converted) status to the status column CHECK constraint
    - This allows tracking inquiries where the traveler decided not to proceed with the booking
    
  2. Benefits
    - More accurate conversion rate statistics
    - Better tracking of lost opportunities
    - Clearer pipeline visibility: pending → contacted → converted OR no_convertido
    
  3. Status Flow
    - pending: Initial inquiry received
    - contacted: Agency has contacted the traveler
    - converted: Traveler accepted and booking was made
    - no_convertido: Traveler decided not to proceed
*/

-- Drop the existing CHECK constraint
ALTER TABLE international_tour_inquiries 
  DROP CONSTRAINT IF EXISTS international_tour_inquiries_status_check;

-- Add the new CHECK constraint with the additional status
ALTER TABLE international_tour_inquiries
  ADD CONSTRAINT international_tour_inquiries_status_check
  CHECK (status IN ('pending', 'contacted', 'converted', 'no_convertido'));