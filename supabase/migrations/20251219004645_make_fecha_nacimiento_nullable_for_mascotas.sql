/*
  # Hacer fecha_nacimiento nullable para mascotas

  1. Cambios
    - Cambiar la columna `fecha_nacimiento` en `booking_travelers` para que sea nullable
    - Las mascotas no necesitan fecha de nacimiento
*/

ALTER TABLE booking_travelers 
ALTER COLUMN fecha_nacimiento DROP NOT NULL;
