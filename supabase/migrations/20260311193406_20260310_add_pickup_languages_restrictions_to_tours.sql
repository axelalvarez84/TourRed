/*
  # Agregar campos de Pick Up, Idiomas y Restricciones a Tours Receptivos

  ## Resumen
  Esta migración agrega los campos faltantes del plan de tours receptivos:
  
  1. **Pick Up (Recogida en Hotel)**
     - `pickup_available` (boolean): Si el tour ofrece recogida en hotel
     - `pickup_free_zone` (text): Descripción de zona sin costo adicional
     - `pickup_zones` (jsonb): Array de zonas con costo [{name, extra_cost, cost_type}]
  
  2. **Idiomas Disponibles**
     - `tour_languages` (jsonb): Array de idiomas [{language, extra_cost, cost_type}]
  
  3. **Restricciones Físicas**
     - `restriction_pregnant` (boolean): No apto para embarazadas
     - `restriction_disability` (boolean): No apto para personas con discapacidad
     - `restriction_physical` (boolean): No apto para personas con mala condición física
  
  4. **Bookings - Datos de la reserva receptiva**
     - `pickup_type` (text): 'meeting_point' | 'pickup'
     - `pickup_zone_name` (text): Nombre de la zona de recogida elegida
     - `pickup_zone_extra_cost` (decimal): Costo extra del pickup
     - `pickup_cost_type` (text): 'por_persona' | 'por_reserva'
     - `selected_language` (text): Idioma elegido por el viajero
     - `language_extra_cost` (decimal): Costo extra del idioma seleccionado
     - `language_cost_type` (text): 'por_persona' | 'fijo'
     - `restrictions_accepted` (boolean): Si el viajero aceptó las restricciones
  
  ## Notas
  - Todos los campos son opcionales (nullable o con default false) para compatibilidad con tours existentes
  - Los campos JSONB permiten flexibilidad en zonas e idiomas sin tablas adicionales
*/

-- Columnas de Pick Up en tours
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'pickup_available') THEN
    ALTER TABLE tours ADD COLUMN pickup_available boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'pickup_free_zone') THEN
    ALTER TABLE tours ADD COLUMN pickup_free_zone text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'pickup_zones') THEN
    ALTER TABLE tours ADD COLUMN pickup_zones jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Columna de idiomas en tours
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'tour_languages') THEN
    ALTER TABLE tours ADD COLUMN tour_languages jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Columnas de restricciones físicas en tours
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'restriction_pregnant') THEN
    ALTER TABLE tours ADD COLUMN restriction_pregnant boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'restriction_disability') THEN
    ALTER TABLE tours ADD COLUMN restriction_disability boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tours' AND column_name = 'restriction_physical') THEN
    ALTER TABLE tours ADD COLUMN restriction_physical boolean DEFAULT false;
  END IF;
END $$;

-- Columnas de reserva receptiva en bookings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'pickup_type') THEN
    ALTER TABLE bookings ADD COLUMN pickup_type text CHECK (pickup_type IN ('meeting_point', 'pickup'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'pickup_zone_name') THEN
    ALTER TABLE bookings ADD COLUMN pickup_zone_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'pickup_zone_extra_cost') THEN
    ALTER TABLE bookings ADD COLUMN pickup_zone_extra_cost decimal(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'pickup_cost_type') THEN
    ALTER TABLE bookings ADD COLUMN pickup_cost_type text CHECK (pickup_cost_type IN ('por_persona', 'por_reserva'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'selected_language') THEN
    ALTER TABLE bookings ADD COLUMN selected_language text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'language_extra_cost') THEN
    ALTER TABLE bookings ADD COLUMN language_extra_cost decimal(10,2) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'language_cost_type') THEN
    ALTER TABLE bookings ADD COLUMN language_cost_type text CHECK (language_cost_type IN ('por_persona', 'fijo'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'restrictions_accepted') THEN
    ALTER TABLE bookings ADD COLUMN restrictions_accepted boolean DEFAULT false;
  END IF;
END $$;
