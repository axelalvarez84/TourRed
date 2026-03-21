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

    const { contact_type, contact_id } = await req.json();

    if (!contact_type || !contact_id) {
      return new Response(JSON.stringify({ error: "contact_type and contact_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["agency", "traveler"].includes(contact_type)) {
      return new Response(JSON.stringify({ error: "contact_type must be 'agency' or 'traveler'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("accounting_provider, accounting_sync_enabled")
      .maybeSingle();

    if (!settings?.accounting_sync_enabled || settings.accounting_provider === "none") {
      return new Response(JSON.stringify({ skipped: true, reason: "Accounting sync disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let contactPayload: Record<string, unknown>;
    const recordType = contact_type === "agency" ? "contact_agency" : "contact_traveler";

    if (contact_type === "agency") {
      const { data: agency, error } = await supabase
        .from("agencies")
        .select(`
          id, rfc, razon_social, regimen_fiscal, postal_code, phone, city, state,
          users (email, full_name)
        `)
        .eq("id", contact_id)
        .maybeSingle();

      if (error || !agency) {
        return new Response(JSON.stringify({ error: "Agency not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const agencyUser = agency.users as { email?: string; full_name?: string };
      contactPayload = {
        id: agency.id,
        type: "agency",
        name: agency.razon_social || agencyUser?.full_name || "Agencia",
        email: agencyUser?.email,
        phone: agency.phone,
        rfc: agency.rfc,
        razon_social: agency.razon_social,
        regimen_fiscal: agency.regimen_fiscal,
        codigo_postal: agency.postal_code,
        city: agency.city,
        state: agency.state,
        country: "Mexico",
      };
    } else {
      const { data: traveler, error } = await supabase
        .from("users")
        .select("id, full_name, email, rfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal_fiscal")
        .eq("id", contact_id)
        .maybeSingle();

      if (error || !traveler) {
        return new Response(JSON.stringify({ error: "Traveler not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      contactPayload = {
        id: traveler.id,
        type: "traveler",
        name: traveler.full_name,
        email: traveler.email,
        rfc: traveler.rfc,
        razon_social: traveler.razon_social,
        regimen_fiscal: traveler.regimen_fiscal,
        codigo_postal: traveler.codigo_postal_fiscal,
        country: "Mexico",
      };
    }

    const result = await supabase.functions.invoke("sync-to-accounting", {
      body: {
        action: "sync_contact",
        record_type: recordType,
        record_id: contact_id,
        data: contactPayload,
      },
    });

    if (result.error) throw new Error(result.error.message);

    return new Response(
      JSON.stringify({ success: true, ...result.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("sync-contact-to-accounting error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
