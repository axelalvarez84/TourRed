/*
  # Agregar campos de seguro de viaje a reservas

  ## Cambios

  ### Tabla `bookings`
  - `travel_insurance_included` (boolean, default false): indica si el viajero aceptó el seguro
  - `travel_insurance_cost` (decimal 10,2, default 0): monto total cobrado por el seguro
  - `insurance_email_sent` (boolean, default false): evita envíos duplicados del email a seguros@toursred.com.mx

  ### Notas
  - El costo se calcula como: precio_por_dia × dias_del_tour × total_viajeros
  - El campo insurance_email_sent se usa como semáforo para el trigger de email post-pago
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'travel_insurance_included'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN travel_insurance_included boolean DEFAULT false,
      ADD COLUMN travel_insurance_cost decimal(10,2) DEFAULT 0,
      ADD COLUMN insurance_email_sent boolean DEFAULT false;
  END IF;
END $$;
