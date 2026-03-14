/*
  # Add tour_announcement to notification_type enum

  Adds a new notification type for agency-sent tour announcements/broadcasts.
  Used when agencies send mass messages via the "Mensaje a Asistentes" feature.
*/

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tour_announcement';
