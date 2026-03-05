/*
  # Agregar tipo de promoción "N x Precio Especial" (nxprecio)

  ## Descripcion
  Agrega un nuevo valor al enum `promotion_type_enum` para soportar el tipo de promocion
  "N por precio especial", donde la agencia define un precio especial para un grupo de N personas.

  Por ejemplo: "2 personas por $3,500" donde cada persona normalmente cuesta $2,000.

  ## Cambios
  1. Agrega el valor 'nxprecio' al enum `promotion_type_enum`

  ## Notas
  - Los campos existentes `min_travelers` y `fixed_group_price` son suficientes para este tipo:
    - `min_travelers`: cuantas personas forman el grupo (ej. 2)
    - `fixed_group_price`: precio total para ese grupo (ej. $3,500)
  - Si hay mas viajeros que `min_travelers`, se aplican multiples grupos segun usos disponibles
  - Los usos se controlan con `max_uses` y `times_used` (ya existentes)
*/

ALTER TYPE promotion_type_enum ADD VALUE IF NOT EXISTS 'nxprecio';
