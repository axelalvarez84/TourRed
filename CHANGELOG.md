# Changelog

## 2026-07-07

### Migracion — Stripe SDK a v22.3.0 y API version 2026-06-24.dahlia

**Alcance**

Se actualizaron los 10 Edge Functions que importan Stripe:

- `stripe-webhook`
- `manage-membership-subscription`
- `stripe-checkout`
- `create-checkout-session`
- `process-payment-plan-installment`
- `purchase-post-booking-extras`
- `process-supplement-payment`
- `purchase-gift-card`
- `create-featured-slot-checkout`
- `create-membership-subscription`

**Cambios aplicados en cada funcion**

1. Importacion actualizada: `npm:stripe@12.18.0` / `npm:stripe@14.10.0` → `npm:stripe@22.3.0`
2. `apiVersion` actualizado: `"2023-10-16"` → `"2026-06-24.dahlia"`

**Correccion critica por breaking change de Basil (2025-03-31)**

La API version Basil elimino `Subscription.current_period_start` y `Subscription.current_period_end`
del objeto raiz. Estos campos ahora viven en `subscription.items.data[0].current_period_start` /
`.current_period_end`.

Se corrigieron 8 lecturas afectadas:

- `stripe-webhook/index.ts` — 6 ocurrencias:
  - Handler `checkout.session.completed` (mixed-cart): upsert de membresía + cuerpo de correo de bienvenida
  - Handler `customer.subscription.updated`: upsert de membresía + cuerpo de correo de bienvenida
  - Handler `invoice.payment_succeeded`: upsert de membresía fallback + cuerpo de correo de bienvenida

- `manage-membership-subscription/index.ts` — 2 ocurrencias:
  - Accion `upgrade`: update en tabla `memberships` + payload JSON de respuesta

**Breaking changes auditados sin impacto**

- **Acacia 2024-09-30**: sin cambios relevantes para este proyecto.
- **Basil 2025-03-31** (`ui_mode`): `hosted`→`hosted_page`, etc. Sin impacto — ningun checkout usa `ui_mode`.
- **Basil 2025-03-31** (coupon singulares eliminados): sin impacto — `create-membership-subscription` ya usa `discounts: [{ coupon: ... }]`.
- **Clover 2025-09-30**: sin cambios relevantes para este proyecto.
- **Dahlia 2026-03-25 / 2026-06-24**: sin cambios relevantes para este proyecto.

**Nota**

La version del endpoint en el Stripe Dashboard (configuracion de webhooks) NO se modifico.
Solo se actualizo la version que el SDK usa en llamadas salientes a la API de Stripe.

---

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
