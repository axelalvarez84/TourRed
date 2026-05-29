/*
  # Agregar precio de seguro de viaje a configuración de plataforma

  ## Cambios

  ### Tabla `platform_settings`
  - Nuevo campo: `travel_insurance_price_per_day_per_traveler` (decimal 10,2)
    - Precio en MXN por día por viajero del seguro de viaje
    - Default: 79.00 (precio inicial basado en tipo de cambio actual)
    - Configurable desde el módulo de administración

  ### Notas
  - Este campo es variable según el tipo de cambio del dólar, por eso es configurable
  - Afecta el cálculo del seguro en todas las reservas nuevas
  - Tours de 1 día: precio × 1 × viajeros
  - Tours de N días: precio × N × viajeros
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name = 'travel_insurance_price_per_day_per_traveler'
  ) THEN
    ALTER TABLE platform_settings
      ADD COLUMN travel_insurance_price_per_day_per_traveler decimal(10,2) DEFAULT 79.00;
  END IF;
END $$;
