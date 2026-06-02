/*
  # Agregar soporte de XML al bucket payment-receipts

  Los ejecutivos suben sus CFDI en formato XML para cobro de comisiones.
  El bucket payment-receipts no tenía text/xml ni application/xml en su lista
  de tipos MIME permitidos, lo que causaba el error "mime type text/xml is not supported".
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/pdf',
  'text/xml',
  'application/xml'
]
WHERE id = 'payment-receipts';
