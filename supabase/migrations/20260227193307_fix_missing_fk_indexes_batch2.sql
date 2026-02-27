/*
  # Add missing foreign key indexes - batch 2

  ## Summary
  Second batch of foreign key columns lacking covering indexes.

  ## New Indexes Added
  - agency_payouts: agency_id, payout_batch_id
  - batch_payouts: payout_id
  - booking_cancellations: booking_id, cancelled_by_user_id
  - booking_optional_services: tour_optional_service_id
  - booking_reschedule_responses: tour_reschedule_id, user_id
  - bookings: discount_code_id, promotion_id
  - commission_records: payout_id
  - conversations: booking_id, tour_id
  - destination_images: destination_id, uploaded_by
  - destinations: last_updated_by
  - discount_codes: tour_id
  - email_settings: updated_by
  - financial_transactions: agency_id, booking_id, payout_id, tour_id
  - gift_card_redemption_attempts: gift_card_id, user_id
  - gift_cards: redeemed_by
  - integration_configs: agency_id
  - platform_settings: updated_by
  - referral_bonuses: user_id
  - reviews: tour_id
  - saved_tours: tour_id
  - tour_cancellations: agency_id, tour_id
  - tour_destinations: destination_id
  - tour_promotions: agency_id
  - tour_reschedules: agency_id, tour_id
  - tours: agency_id
  - toursred_cash_transactions: user_id
  - toursred_points_transactions: wallet_id
  - users: referred_by_user_id
*/

CREATE INDEX IF NOT EXISTS idx_agency_payouts_agency_id
  ON public.agency_payouts (agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_payouts_payout_batch_id
  ON public.agency_payouts (payout_batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_payouts_payout_id
  ON public.batch_payouts (payout_id);

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_booking_id
  ON public.booking_cancellations (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_cancelled_by_user_id
  ON public.booking_cancellations (cancelled_by_user_id);

CREATE INDEX IF NOT EXISTS idx_booking_optional_services_tour_optional_service_id
  ON public.booking_optional_services (tour_optional_service_id);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_responses_tour_reschedule_id
  ON public.booking_reschedule_responses (tour_reschedule_id);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_responses_user_id
  ON public.booking_reschedule_responses (user_id);

CREATE INDEX IF NOT EXISTS idx_bookings_discount_code_id
  ON public.bookings (discount_code_id);

CREATE INDEX IF NOT EXISTS idx_bookings_promotion_id
  ON public.bookings (promotion_id);

CREATE INDEX IF NOT EXISTS idx_commission_records_payout_id
  ON public.commission_records (payout_id);

CREATE INDEX IF NOT EXISTS idx_conversations_booking_id
  ON public.conversations (booking_id);

CREATE INDEX IF NOT EXISTS idx_conversations_tour_id
  ON public.conversations (tour_id);

CREATE INDEX IF NOT EXISTS idx_destination_images_destination_id
  ON public.destination_images (destination_id);

CREATE INDEX IF NOT EXISTS idx_destination_images_uploaded_by
  ON public.destination_images (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_destinations_last_updated_by
  ON public.destinations (last_updated_by);

CREATE INDEX IF NOT EXISTS idx_discount_codes_tour_id
  ON public.discount_codes (tour_id);

CREATE INDEX IF NOT EXISTS idx_email_settings_updated_by
  ON public.email_settings (updated_by);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_agency_id
  ON public.financial_transactions (agency_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_booking_id
  ON public.financial_transactions (booking_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_payout_id
  ON public.financial_transactions (payout_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_tour_id
  ON public.financial_transactions (tour_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemption_attempts_gift_card_id
  ON public.gift_card_redemption_attempts (gift_card_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemption_attempts_user_id
  ON public.gift_card_redemption_attempts (user_id);

CREATE INDEX IF NOT EXISTS idx_gift_cards_redeemed_by
  ON public.gift_cards (redeemed_by);

CREATE INDEX IF NOT EXISTS idx_integration_configs_agency_id
  ON public.integration_configs (agency_id);

CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_by
  ON public.platform_settings (updated_by);

CREATE INDEX IF NOT EXISTS idx_referral_bonuses_user_id
  ON public.referral_bonuses (user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_tour_id
  ON public.reviews (tour_id);

CREATE INDEX IF NOT EXISTS idx_saved_tours_tour_id
  ON public.saved_tours (tour_id);

CREATE INDEX IF NOT EXISTS idx_tour_cancellations_agency_id
  ON public.tour_cancellations (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_cancellations_tour_id
  ON public.tour_cancellations (tour_id);

CREATE INDEX IF NOT EXISTS idx_tour_destinations_destination_id
  ON public.tour_destinations (destination_id);

CREATE INDEX IF NOT EXISTS idx_tour_promotions_agency_id
  ON public.tour_promotions (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_reschedules_agency_id
  ON public.tour_reschedules (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_reschedules_tour_id
  ON public.tour_reschedules (tour_id);

CREATE INDEX IF NOT EXISTS idx_tours_agency_id
  ON public.tours (agency_id);

CREATE INDEX IF NOT EXISTS idx_toursred_cash_transactions_user_id
  ON public.toursred_cash_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_toursred_points_transactions_wallet_id
  ON public.toursred_points_transactions (wallet_id);

CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
  ON public.users (referred_by_user_id);
