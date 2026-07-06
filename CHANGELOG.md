# Changelog

## 2026-07-06

### Correccion critica — Stripe webhook retornaba HTTP 500 en `checkout.session.completed`

**Descripcion del problema**

El manejador del evento `checkout.session.completed` en `supabase/functions/stripe-webhook/index.ts`
usaba la siguiente sintaxis para insertar un registro en `stripe_orders`:

```typescript
await supabase
  .from('stripe_orders')
  .insert({ ... })
  .on_conflict(['checkout_session_id'])
  .merge();
```

Los metodos `.on_conflict()` y `.merge()` no existen en supabase-js v2. La llamada lanzaba un
`TypeError` que no estaba capturado localmente y burbujeba hasta el `try/catch` global del handler,
causando que la funcion retornara HTTP 500.

**Impacto**

- Stripe reintentaba el webhook de forma indefinida ante cada respuesta 500.
- La tabla `stripe_orders` acumulo **0 filas** desde su creacion (2026-07-02), a pesar de ~124
  entregas registradas por Stripe en ese periodo.
- Los pagos completados SI se registraron en `payment_transactions` (escrita antes del punto de
  fallo), por lo que los cobros procesados no se perdieron.

**Causa raiz**

Uso de la API de PostgREST/supabase-js v1 (`.on_conflict().merge()`) en un entorno que ejecuta
supabase-js v2, donde el patron correcto para upsert es:

```typescript
.upsert(data, { onConflict: 'column_name' })
```

**Correccion aplicada**

Se reemplazo el bloque roto por `.upsert({ ... }, { onConflict: 'checkout_session_id' })` en
`supabase/functions/stripe-webhook/index.ts`. Se redesplego la edge function.

---

## 2026-07-06

### Correccion — `refund_points_for_cancelled_booking` llamada con parametro obsoleto

**Descripcion del problema**

La funcion SQL `refund_points_for_cancelled_booking` fue modificada en la migracion
`20260702000005_fix_refund_points_derive_user_from_booking.sql` para eliminar el parametro
`p_user_id` (el usuario ahora se deriva internamente desde el `booking_id`). Sin embargo, dos
llamadas en `stripe-webhook/index.ts` seguian pasando `p_user_id: booking.user_id`, lo que causaba
un error de "funcion no encontrada" en PostgreSQL.

**Handlers afectados**

- `checkout.session.expired` — puntos usados en una reserva nunca se reembolsaban al expirar el checkout.
- `payment_intent.payment_failed` / `payment_intent.canceled` — mismo problema ante fallo de pago.

**Correccion aplicada**

Se elimino el parametro `p_user_id` de ambas llamadas RPC en `stripe-webhook/index.ts`. Se
redesplego la edge function.
