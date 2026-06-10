/*
  # Prioridad 2: Revocar EXECUTE de authenticated en funciones SECURITY DEFINER internas

  Estas funciones solo son llamadas desde:
  - Edge functions que usan service_role_key (webhooks de pago, cron jobs)
  - Triggers del motor de PostgreSQL
  - Funciones internas (prefijo _)

  Ninguna es invocada directamente desde el cliente frontend con JWT de usuario.
  Confirmar: activate_featured_slot es llamada desde stripe-webhook/mercadopago-webhook
  (service_role), no desde el cliente. deduct_points es llamada desde edge functions
  con service_role (process-payment-plan-installment, etc.).

  Funciones que MANTIENEN su grant a authenticated (helpers de RLS y consultas del frontend):
  - current_user_has_role, current_user_is_admin, is_admin_user
  - is_admin_with_executive_permission, is_super_admin
  - is_conversation_participant, get_current_user_agency_id
  - get_executive_id_for_user, has_manage_travelers_permission
  - get_user_conversations, get_payment_plan_minimum_at_booking
  - get_pending_reschedule_for_booking, get_garbage_bookings
  - generate_and_notify_platform_commissions (llamada desde admin panel vía authenticated)
*/

-- Función interna (prefijo _ indica privada), llamada desde get_user_conversations
REVOKE EXECUTE ON FUNCTION public._get_user_conversations_internal(uuid) FROM authenticated;

-- Llamada desde stripe-webhook/mercadopago-webhook (service_role), no desde frontend
REVOKE EXECUTE ON FUNCTION public.activate_featured_slot(uuid, uuid, uuid) FROM authenticated;

-- Llamada exclusivamente desde webhooks de pago (service_role)
REVOKE EXECUTE ON FUNCTION public.confirm_featured_slot_payment(uuid, text, text, numeric) FROM authenticated;

-- Interna: llamada desde edge function generate-featured-slot-cfdi (service_role)
REVOKE EXECUTE ON FUNCTION public.create_accounting_entry_for_featured_slot(uuid) FROM authenticated;

-- Llamada desde edge functions de pago (service_role): process-payment-plan-installment,
-- process-supplement-payment, confirm-booking-checkin, etc.
REVOKE EXECUTE ON FUNCTION public.deduct_points(uuid, integer, text, uuid, text) FROM authenticated;

-- Cron job únicamente, ejecutado por pg_cron con service_role
REVOKE EXECUTE ON FUNCTION public.expire_supplement_approvals() FROM authenticated;

-- Interna: llamada desde edge function (service_role), no directamente desde cliente
REVOKE EXECUTE ON FUNCTION public.increment_featured_stat(uuid, text) FROM authenticated;

-- Cron job únicamente
REVOKE EXECUTE ON FUNCTION public.process_payment_plan_deadlines() FROM authenticated;

-- Trigger function: solo la llama el motor de triggers, sin acceso externo
REVOKE EXECUTE ON FUNCTION public.update_payment_plan_updated_at() FROM authenticated;
