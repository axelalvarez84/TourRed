/*
  # Agregar slot_reschedule_auto_cancelled al enum notification_type

  Necesario para que process_expired_slot_reschedules() pueda insertar
  notificaciones cuando una reserva es cancelada automaticamente por no
  responder a tiempo a una reagendacion de slot.
*/

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'slot_reschedule_auto_cancelled';
