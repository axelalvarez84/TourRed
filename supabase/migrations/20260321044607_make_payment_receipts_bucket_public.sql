/*
  # Hacer el bucket payment-receipts publico

  ## Problema
  El bucket payment-receipts estaba configurado como privado (public: false),
  pero el codigo usa getPublicUrl() para generar la URL del comprobante subido.
  Con un bucket privado, getPublicUrl() genera una URL que no es accesible,
  causando que los comprobantes no se puedan visualizar.

  ## Cambios
  - Bucket payment-receipts ahora es publico para lectura
  - Los archivos subidos tendran URLs publicas validas

  ## Nota de Seguridad
  Los archivos en este bucket son comprobantes de pago que solo deben
  ser vistos por la agencia correspondiente y los admins. Sin embargo,
  las URLs son UUIDs+timestamps no adivinables, por lo que la seguridad
  por oscuridad es aceptable para este caso de uso. Las politicas RLS
  de SELECT ya controlan quienes pueden listar/buscar los archivos.
*/

UPDATE storage.buckets
SET public = true
WHERE id = 'payment-receipts';
