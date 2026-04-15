import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const cfdiId = url.searchParams.get("cfdi_id");
    const fileType = url.searchParams.get("file_type"); // "xml" or "pdf"

    if (!cfdiId || !fileType || !["xml", "pdf"].includes(fileType)) {
      return new Response(JSON.stringify({ error: "cfdi_id y file_type (xml|pdf) son requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("role, agency_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: cfdi } = await supabaseAdmin
      .from("cfdi_invoices")
      .select("id, pac_invoice_id, pac_provider, invoice_type, booking_id, agency_id")
      .eq("id", cfdiId)
      .maybeSingle();

    if (!cfdi) {
      return new Response(JSON.stringify({ error: "Factura no encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const role = userRow?.role;
    const isAdmin = role === "admin" || role === "super_admin";
    const isAgency = role === "agency";
    const isTraveler = role === "traveler";

    let hasAccess = false;

    if (isAdmin) {
      hasAccess = true;
    } else if (isAgency) {
      hasAccess = cfdi.agency_id === userRow?.agency_id;
    } else if (isTraveler && cfdi.booking_id) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("user_id")
        .eq("id", cfdi.booking_id)
        .maybeSingle();
      hasAccess = booking?.user_id === user.id;
    }

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Acceso denegado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabaseAdmin
      .from("platform_settings")
      .select("pac_provider, pac_api_key_encrypted, pac_organization_id")
      .maybeSingle();

    if (!settings?.pac_api_key_encrypted) {
      return new Response(JSON.stringify({ error: "Proveedor PAC no configurado" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const facturApiUrl = `https://www.facturapi.io/v2/invoices/${cfdi.pac_invoice_id}/${fileType}`;

    const facturHeaders: Record<string, string> = {
      Authorization: `Bearer ${settings.pac_api_key_encrypted}`,
    };
    if (settings.pac_organization_id) {
      facturHeaders["X-Organization-Id"] = settings.pac_organization_id;
    }

    const fileRes = await fetch(facturApiUrl, { headers: facturHeaders });

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      return new Response(JSON.stringify({ error: `FacturAPI error ${fileRes.status}`, detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = fileType === "pdf" ? "application/pdf" : "application/xml";
    const disposition = fileType === "pdf" ? "inline" : "attachment";
    const filename = `factura-${cfdi.pac_invoice_id}.${fileType}`;

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
