/*
  # Drop unused indexes - batch 2

  ## Summary
  These indexes were created in the previous migration run but flagged as unused
  by the advisor. They cover optional/nullable FK columns that are rarely queried
  directly and add unnecessary write overhead. Drop them to keep the index set lean.
  They can be re-created if query patterns change.
*/

DROP INDEX IF EXISTS public.idx_agency_payouts_processed_by;
DROP INDEX IF EXISTS public.idx_booking_cancellations_toursred_cash_transaction_id;
DROP INDEX IF EXISTS public.idx_booking_reschedule_responses_refund_transaction_id;
DROP INDEX IF EXISTS public.idx_bookings_agency_cancellation_id;
DROP INDEX IF EXISTS public.idx_bookings_no_show_marked_by;
DROP INDEX IF EXISTS public.idx_discount_code_usage_booking_id;
DROP INDEX IF EXISTS public.idx_discount_code_usage_gift_card_id;
DROP INDEX IF EXISTS public.idx_tours_agency_cancellation_id;
DROP INDEX IF EXISTS public.idx_discount_code_usage_membership_id;
DROP INDEX IF EXISTS public.idx_discount_codes_created_by;
DROP INDEX IF EXISTS public.idx_financial_transactions_cancellation_id;
DROP INDEX IF EXISTS public.idx_financial_transactions_created_by_user_id;
DROP INDEX IF EXISTS public.idx_payout_batches_processed_by;
DROP INDEX IF EXISTS public.idx_referral_bonuses_referral_relationship_id;
DROP INDEX IF EXISTS public.idx_referral_fraud_logs_referral_relationship_id;
DROP INDEX IF EXISTS public.idx_referral_relationships_first_booking_id;
DROP INDEX IF EXISTS public.idx_tour_cancellations_cancelled_by_user_id;
DROP INDEX IF EXISTS public.idx_tour_promotions_created_by;
DROP INDEX IF EXISTS public.idx_tour_reschedules_created_by;
