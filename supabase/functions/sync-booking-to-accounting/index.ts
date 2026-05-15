import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("accounting_provider, accounting_sync_enabled")
      .maybeSingle();

    if (!settings?.accounting_sync_enabled || settings.accounting_provider === "none") {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        id, total_price, service_charge, booking_code, created_at, payment_provider,
        tours (name, agencies (id, rfc, razon_social, regimen_fiscal, postal_code)),
        traveler:users!bookings_user_id_fkey (id, full_name, email, rfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal_fiscal)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (error || !booking) {
      return new Response(JSON.stringify({ error: `Booking not found: ${error?.message || booking_id}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const traveler = (booking as any).traveler as {
      id: string; full_name: string; email?: string; rfc?: string;
      razon_social?: string; regimen_fiscal?: string; uso_cfdi?: string; codigo_postal_fiscal?: string;
    };
    const agency = ((booking as any).tours as { agencies: { id: string; rfc?: string; razon_social?: string } }).agencies;
    const tourName = ((booking as any).tours as { name: string }).name;

    // En edición México, Zoho requiere RFC para emitir facturas (CFDI).
    // Reservas de viajeros sin RFC se registran como contacto genérico "PUBLICO EN GENERAL".
    const travelerName = traveler.rfc
      ? (traveler.razon_social || traveler.full_name)
      : "PUBLICO EN GENERAL";
    const travelerRfc = traveler.rfc || "XAXX010101000";

    const { data: existingTravelerLog } = await supabase
      .from("accounting_sync_log")
      .select("external_entity_id")
      .eq("provider", settings.accounting_provider)
      .eq("record_type", "contact_traveler")
      .eq("record_id", traveler.id)
      .eq("status", "synced")
      .maybeSingle();

    let travelerExternalId = existingTravelerLog?.external_entity_id;

    if (!travelerExternalId) {
      const contactRes = await supabase.functions.invoke("sync-to-accounting", {
        body: {
          action: "sync_contact",
          record_type: "contact_traveler",
          record_id: traveler.id,
          data: {
            id: traveler.id,
            type: "traveler",
            name: travelerName,
            email: traveler.email,
            rfc: travelerRfc,
            razon_social: travelerName,
            regimen_fiscal: traveler.regimen_fiscal,
            codigo_postal: traveler.codigo_postal_fiscal,
          },
        },
      });

      if (contactRes.error) throw new Error(`Failed to sync traveler contact: ${contactRes.error.message}`);
      if (contactRes.data?.error) throw new Error(`Failed to sync traveler contact: ${contactRes.data.error}`);
      travelerExternalId = contactRes.data?.external_entity_id;
    }

    if (!travelerExternalId) {
      throw new Error("Could not obtain external contact ID for traveler");
    }

    const total = Number(booking.total_price);
    const subtotal = Math.round((total / 1.16) * 100) / 100;
    const iva = Math.round((total - subtotal) * 100) / 100;
    const serviceCharge = Number(booking.service_charge ?? 0);
    const tourSubtotal = Math.round(((total - serviceCharge) / 1.16) * 100) / 100;
    const svcSubtotal = serviceCharge > 0
      ? Math.round((serviceCharge / 1.16) * 100) / 100
      : 0;

    const invoiceRes = await supabase.functions.invoke("sync-to-accounting", {
      body: {
        action: "sync_invoice",
        record_id: booking_id,
        data: {
          id: booking_id,
          contact_external_id: travelerExternalId,
          date: new Date(booking.created_at).toISOString().split("T")[0],
          due_date: new Date(booking.created_at).toISOString().split("T")[0],
          currency: "MXN",
          reference: booking.booking_code || booking_id,
          notes: `Reserva de tour: ${tourName}. Agencia: ${agency?.razon_social || ""}`,
          line_items: [
            {
              description: `Servicio de viaje: ${tourName}`,
              quantity: 1,
              unit_price: tourSubtotal,
              tax_percentage: 16,
            },
            ...(svcSubtotal > 0 ? [{
              description: "Cargo por servicio de plataforma",
              quantity: 1,
              unit_price: svcSubtotal,
              tax_percentage: 16,
            }] : []),
          ],
          subtotal,
          tax_total: iva,
          total,
        },
      },
    });

    if (invoiceRes.error) throw new Error(`Failed to sync invoice: ${invoiceRes.error.message}`);
    if (invoiceRes.data?.error) throw new Error(`Failed to sync invoice: ${invoiceRes.data.error}`);

    return new Response(
      JSON.stringify({ success: true, invoice_external_id: invoiceRes.data?.external_entity_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("sync-booking-to-accounting error:", err);
    // Retornar 200 con error detallado para que el frontend pueda mostrar el mensaje real
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
