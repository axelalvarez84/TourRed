/*
  # Indices para Foreign Keys sin indice — Optimizacion de Performance

  ## Problema
  Supabase Performance Advisor detecto multiples foreign keys sin indice asociado.
  Cada JOIN o lookup por estas columnas fuerza un sequential scan completo de la
  tabla, degradando queries de lectura, politicas RLS y operaciones de escritura
  que validan integridad referencial.

  ## Solucion
  Se crean exclusivamente indices nuevos con CREATE INDEX IF NOT EXISTS.
  No se modifican ni eliminan indices existentes. No se altera ninguna estructura.

  ## Tablas cubiertas (84 indices nuevos en 47 tablas)

  ### Grupo 1 — Tablas criticas de alto trafico
  - bookings: approved_by, discount_code_id, promotion_id
  - booking_travelers: frequent_companion_id
  - tours: agency_id
  - tour_slots: agency_id, schedule_id
  - agencies: user_id
  - users: referred_by_user_id
  - support_tickets: ticket_relacionado_id

  ### Grupo 2 — Tablas financieras
  - agency_payouts: payout_batch_id
  - commission_records: payout_id
  - financial_transactions: agency_id, booking_id, payout_id, tour_id
  - cfdi_invoices: booking_id, payout_id
  - cfdi_cancellation_requests: cfdi_invoice_id

  ### Grupo 3 — Reservas y cancelaciones
  - booking_cancellations: booking_id, cancelled_by_user_id
  - booking_optional_services: booking_id, tour_optional_service_id
  - booking_partial_cancellations: booking_id, cancelled_by_user_id
  - booking_reschedule_responses: user_id
  - cancellation_penalty_records: agency_id, booking_id, tour_id
  - slot_reschedule_requests: agency_id, original_slot_id, tour_id
  - slot_reschedule_responses: alternative_slot_id, booking_id, request_id, user_id
  - slot_seat_status: agency_id, booking_id

  ### Grupo 4 — Mensajeria, conversaciones y resenas
  - conversations: booking_id, created_by, tour_id
  - messages: conversation_id, sender_id
  - reviews: agency_id, tour_id, user_id
  - agency_reviews: agency_id, traveler_id
  - traveler_reviews: agency_id, traveler_id
  - agency_tour_messages: agency_id, slot_id, tour_id
  - agency_tour_message_recipients: message_id, user_id

  ### Grupo 5 — Tours, programacion y descuentos
  - tour_cancellations: agency_id, tour_id
  - tour_optional_services: tour_id
  - tour_promotions: agency_id
  - tour_reschedules: agency_id
  - tour_schedules: agency_id, tour_id
  - tour_slot_blackouts: agency_id, tour_id
  - discount_codes: agency_id, tour_id

  ### Grupo 6 — Wallet, referidos, usuarios y miscelaneas
  - toursred_cash_transactions: user_id, wallet_id
  - toursred_points_transactions: user_id, wallet_id
  - referral_codes: user_id
  - referral_bonuses: user_id
  - referral_relationships: referrer_user_id
  - frequent_companions: user_id
  - gift_cards: redeemed_by
  - gift_card_redemption_attempts: gift_card_id, user_id
  - accounting_access_invitations: accepted_by, invited_by, revoked_by
  - accounting_entries: created_by, posted_by
  - chart_of_accounts: parent_code
  - international_tour_inquiries: user_id
  - integration_configs: agency_id
  - password_reset_codes: user_id
  - support_ticket_attachments: subido_por_id
  - support_ticket_comments: author_id
  - support_ticket_history: actor_id
  - destinations: last_updated_by
  - destination_images: destination_id, uploaded_by
  - departure_points: created_by
*/

-- ============================================================
-- GRUPO 1: TABLAS CRITICAS DE ALTO TRAFICO
-- ============================================================

-- bookings
CREATE INDEX IF NOT EXISTS idx_bookings_approved_by
  ON public.bookings (approved_by);

CREATE INDEX IF NOT EXISTS idx_bookings_discount_code_id
  ON public.bookings (discount_code_id);

CREATE INDEX IF NOT EXISTS idx_bookings_promotion_id
  ON public.bookings (promotion_id);

-- booking_travelers
CREATE INDEX IF NOT EXISTS idx_booking_travelers_frequent_companion_id
  ON public.booking_travelers (frequent_companion_id);

-- tours
CREATE INDEX IF NOT EXISTS idx_tours_agency_id
  ON public.tours (agency_id);

-- tour_slots
CREATE INDEX IF NOT EXISTS idx_tour_slots_agency_id
  ON public.tour_slots (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_slots_schedule_id
  ON public.tour_slots (schedule_id);

-- agencies
CREATE INDEX IF NOT EXISTS idx_agencies_user_id
  ON public.agencies (user_id);

-- users
CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
  ON public.users (referred_by_user_id);

-- support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_relacionado_id
  ON public.support_tickets (ticket_relacionado_id);

-- ============================================================
-- GRUPO 2: TABLAS FINANCIERAS
-- ============================================================

-- agency_payouts
CREATE INDEX IF NOT EXISTS idx_agency_payouts_payout_batch_id
  ON public.agency_payouts (payout_batch_id);

-- commission_records
CREATE INDEX IF NOT EXISTS idx_commission_records_payout_id
  ON public.commission_records (payout_id);

-- financial_transactions
CREATE INDEX IF NOT EXISTS idx_financial_transactions_agency_id
  ON public.financial_transactions (agency_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_booking_id
  ON public.financial_transactions (booking_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_payout_id
  ON public.financial_transactions (payout_id);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_tour_id
  ON public.financial_transactions (tour_id);

-- cfdi_invoices
CREATE INDEX IF NOT EXISTS idx_cfdi_invoices_booking_id
  ON public.cfdi_invoices (booking_id);

CREATE INDEX IF NOT EXISTS idx_cfdi_invoices_payout_id
  ON public.cfdi_invoices (payout_id);

-- cfdi_cancellation_requests
CREATE INDEX IF NOT EXISTS idx_cfdi_cancellation_requests_cfdi_invoice_id
  ON public.cfdi_cancellation_requests (cfdi_invoice_id);

-- ============================================================
-- GRUPO 3: RESERVAS Y CANCELACIONES
-- ============================================================

-- booking_cancellations
CREATE INDEX IF NOT EXISTS idx_booking_cancellations_booking_id
  ON public.booking_cancellations (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_cancelled_by_user_id
  ON public.booking_cancellations (cancelled_by_user_id);

-- booking_optional_services
CREATE INDEX IF NOT EXISTS idx_booking_optional_services_booking_id
  ON public.booking_optional_services (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_optional_services_tour_optional_service_id
  ON public.booking_optional_services (tour_optional_service_id);

-- booking_partial_cancellations
CREATE INDEX IF NOT EXISTS idx_booking_partial_cancellations_booking_id
  ON public.booking_partial_cancellations (booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_partial_cancellations_cancelled_by_user_id
  ON public.booking_partial_cancellations (cancelled_by_user_id);

-- booking_reschedule_responses
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_responses_user_id
  ON public.booking_reschedule_responses (user_id);

-- cancellation_penalty_records
CREATE INDEX IF NOT EXISTS idx_cancellation_penalty_records_agency_id
  ON public.cancellation_penalty_records (agency_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_penalty_records_booking_id
  ON public.cancellation_penalty_records (booking_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_penalty_records_tour_id
  ON public.cancellation_penalty_records (tour_id);

-- slot_reschedule_requests
CREATE INDEX IF NOT EXISTS idx_slot_reschedule_requests_agency_id
  ON public.slot_reschedule_requests (agency_id);

CREATE INDEX IF NOT EXISTS idx_slot_reschedule_requests_original_slot_id
  ON public.slot_reschedule_requests (original_slot_id);

CREATE INDEX IF NOT EXISTS idx_slot_reschedule_requests_tour_id
  ON public.slot_reschedule_requests (tour_id);

-- slot_reschedule_responses
CREATE INDEX IF NOT EXISTS idx_slot_reschedule_responses_alternative_slot_id
  ON public.slot_reschedule_responses (alternative_slot_id);

CREATE INDEX IF NOT EXISTS idx_slot_reschedule_responses_booking_id
  ON public.slot_reschedule_responses (booking_id);

CREATE INDEX IF NOT EXISTS idx_slot_reschedule_responses_request_id
  ON public.slot_reschedule_responses (request_id);

CREATE INDEX IF NOT EXISTS idx_slot_reschedule_responses_user_id
  ON public.slot_reschedule_responses (user_id);

-- slot_seat_status
CREATE INDEX IF NOT EXISTS idx_slot_seat_status_agency_id
  ON public.slot_seat_status (agency_id);

CREATE INDEX IF NOT EXISTS idx_slot_seat_status_booking_id
  ON public.slot_seat_status (booking_id);

-- ============================================================
-- GRUPO 4: MENSAJERIA, CONVERSACIONES Y RESENAS
-- ============================================================

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_booking_id
  ON public.conversations (booking_id);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by
  ON public.conversations (created_by);

CREATE INDEX IF NOT EXISTS idx_conversations_tour_id
  ON public.conversations (tour_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages (sender_id);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_agency_id
  ON public.reviews (agency_id);

CREATE INDEX IF NOT EXISTS idx_reviews_tour_id
  ON public.reviews (tour_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON public.reviews (user_id);

-- agency_reviews
CREATE INDEX IF NOT EXISTS idx_agency_reviews_agency_id
  ON public.agency_reviews (agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_reviews_traveler_id
  ON public.agency_reviews (traveler_id);

-- traveler_reviews
CREATE INDEX IF NOT EXISTS idx_traveler_reviews_agency_id
  ON public.traveler_reviews (agency_id);

CREATE INDEX IF NOT EXISTS idx_traveler_reviews_traveler_id
  ON public.traveler_reviews (traveler_id);

-- agency_tour_messages
CREATE INDEX IF NOT EXISTS idx_agency_tour_messages_agency_id
  ON public.agency_tour_messages (agency_id);

CREATE INDEX IF NOT EXISTS idx_agency_tour_messages_slot_id
  ON public.agency_tour_messages (slot_id);

CREATE INDEX IF NOT EXISTS idx_agency_tour_messages_tour_id
  ON public.agency_tour_messages (tour_id);

-- agency_tour_message_recipients
CREATE INDEX IF NOT EXISTS idx_agency_tour_message_recipients_message_id
  ON public.agency_tour_message_recipients (message_id);

CREATE INDEX IF NOT EXISTS idx_agency_tour_message_recipients_user_id
  ON public.agency_tour_message_recipients (user_id);

-- ============================================================
-- GRUPO 5: TOURS, PROGRAMACION Y DESCUENTOS
-- ============================================================

-- tour_cancellations
CREATE INDEX IF NOT EXISTS idx_tour_cancellations_agency_id
  ON public.tour_cancellations (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_cancellations_tour_id
  ON public.tour_cancellations (tour_id);

-- tour_optional_services
CREATE INDEX IF NOT EXISTS idx_tour_optional_services_tour_id
  ON public.tour_optional_services (tour_id);

-- tour_promotions
CREATE INDEX IF NOT EXISTS idx_tour_promotions_agency_id
  ON public.tour_promotions (agency_id);

-- tour_reschedules
CREATE INDEX IF NOT EXISTS idx_tour_reschedules_agency_id
  ON public.tour_reschedules (agency_id);

-- tour_schedules
CREATE INDEX IF NOT EXISTS idx_tour_schedules_agency_id
  ON public.tour_schedules (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_schedules_tour_id
  ON public.tour_schedules (tour_id);

-- tour_slot_blackouts
CREATE INDEX IF NOT EXISTS idx_tour_slot_blackouts_agency_id
  ON public.tour_slot_blackouts (agency_id);

CREATE INDEX IF NOT EXISTS idx_tour_slot_blackouts_tour_id
  ON public.tour_slot_blackouts (tour_id);

-- discount_codes
CREATE INDEX IF NOT EXISTS idx_discount_codes_agency_id
  ON public.discount_codes (agency_id);

CREATE INDEX IF NOT EXISTS idx_discount_codes_tour_id
  ON public.discount_codes (tour_id);

-- ============================================================
-- GRUPO 6: WALLET, REFERIDOS, USUARIOS Y MISCELANEAS
-- ============================================================

-- toursred_cash_transactions
CREATE INDEX IF NOT EXISTS idx_toursred_cash_transactions_user_id
  ON public.toursred_cash_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_toursred_cash_transactions_wallet_id
  ON public.toursred_cash_transactions (wallet_id);

-- toursred_points_transactions
CREATE INDEX IF NOT EXISTS idx_toursred_points_transactions_user_id
  ON public.toursred_points_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_toursred_points_transactions_wallet_id
  ON public.toursred_points_transactions (wallet_id);

-- referral_codes
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id
  ON public.referral_codes (user_id);

-- referral_bonuses
CREATE INDEX IF NOT EXISTS idx_referral_bonuses_user_id
  ON public.referral_bonuses (user_id);

-- referral_relationships
CREATE INDEX IF NOT EXISTS idx_referral_relationships_referrer_user_id
  ON public.referral_relationships (referrer_user_id);

-- frequent_companions
CREATE INDEX IF NOT EXISTS idx_frequent_companions_user_id
  ON public.frequent_companions (user_id);

-- gift_cards
CREATE INDEX IF NOT EXISTS idx_gift_cards_redeemed_by
  ON public.gift_cards (redeemed_by);

-- gift_card_redemption_attempts
CREATE INDEX IF NOT EXISTS idx_gift_card_redemption_attempts_gift_card_id
  ON public.gift_card_redemption_attempts (gift_card_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemption_attempts_user_id
  ON public.gift_card_redemption_attempts (user_id);

-- accounting_access_invitations
CREATE INDEX IF NOT EXISTS idx_accounting_access_invitations_accepted_by
  ON public.accounting_access_invitations (accepted_by);

CREATE INDEX IF NOT EXISTS idx_accounting_access_invitations_invited_by
  ON public.accounting_access_invitations (invited_by);

CREATE INDEX IF NOT EXISTS idx_accounting_access_invitations_revoked_by
  ON public.accounting_access_invitations (revoked_by);

-- accounting_entries
CREATE INDEX IF NOT EXISTS idx_accounting_entries_created_by
  ON public.accounting_entries (created_by);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_posted_by
  ON public.accounting_entries (posted_by);

-- chart_of_accounts
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent_code
  ON public.chart_of_accounts (parent_code);

-- international_tour_inquiries
CREATE INDEX IF NOT EXISTS idx_international_tour_inquiries_user_id
  ON public.international_tour_inquiries (user_id);

-- integration_configs
CREATE INDEX IF NOT EXISTS idx_integration_configs_agency_id
  ON public.integration_configs (agency_id);

-- password_reset_codes
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id
  ON public.password_reset_codes (user_id);

-- support_ticket_attachments
CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_subido_por_id
  ON public.support_ticket_attachments (subido_por_id);

-- support_ticket_comments
CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_author_id
  ON public.support_ticket_comments (author_id);

-- support_ticket_history
CREATE INDEX IF NOT EXISTS idx_support_ticket_history_actor_id
  ON public.support_ticket_history (actor_id);

-- destinations
CREATE INDEX IF NOT EXISTS idx_destinations_last_updated_by
  ON public.destinations (last_updated_by);

-- destination_images
CREATE INDEX IF NOT EXISTS idx_destination_images_destination_id
  ON public.destination_images (destination_id);

CREATE INDEX IF NOT EXISTS idx_destination_images_uploaded_by
  ON public.destination_images (uploaded_by);

-- departure_points
CREATE INDEX IF NOT EXISTS idx_departure_points_created_by
  ON public.departure_points (created_by);
