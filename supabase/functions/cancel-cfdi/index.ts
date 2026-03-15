import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function facturapiCancel(
  apiKey: string,
  orgId: string,
  pacInvoiceId: string,
  motivo: string,
  uuidSustitucion?: string
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["X-Organization-Id"] = orgId;

  const body: Record<string, unknown> = { motive: motivo };
  if (uuidSustitucion) body.substitution = uuidSustitucion;

  const res = await fetch(`https://www.facturapi.io/v2/invoices/${pacInvoiceId}/cancel`, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FacturAPI cancel error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.id ?? pacInvoiceId;
}

async function cancelWithProvider(
  provider: string,
  apiKey: string,
  orgId: string,
  pacInvoiceId: string,
  motivo: string,
  uuidSustitucion?: string
): Promise<string> {
  switch (provider) {
    case "facturapi":
      return facturapiCancel(apiKey, orgId, pacInvoiceId, motivo, uuidSustitucion);
    default:
      throw new Error(`Unknown PAC provider: ${provider}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { cfdi_invoice_id, motivo, uuid_sustitucion } = await req.json();

    if (!cfdi_invoice_id || !motivo) {
      return new Response(
        JSON.stringify({ error: "cfdi_invoice_id and motivo are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["01", "02", "03", "04"].includes(motivo)) {
      return new Response(
        JSON.stringify({ error: "motivo must be 01, 02, 03, or 04" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: cfdi, error: cfdiError } = await supabase
      .from("cfdi_invoices")
      .select("id, pac_provider, pac_invoice_id, status")
      .eq("id", cfdi_invoice_id)
      .maybeSingle();

    if (cfdiError || !cfdi) {
      return new Response(JSON.stringify({ error: "CFDI not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cfdi.status !== "stamped") {
      return new Response(
        JSON.stringify({ error: "Only stamped CFDIs can be cancelled" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("pac_provider, pac_api_key_encrypted, pac_organization_id")
      .maybeSingle();

    if (!settings?.pac_api_key_encrypted) {
      return new Response(
        JSON.stringify({ error: "PAC provider not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get requesting user
    const authHeader = req.headers.get("Authorization");
    let requestedBy: string | null = null;
    if (authHeader) {
      const { data: userData } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      requestedBy = userData?.user?.id ?? null;
    }

    // Create cancellation request record
    const { data: cancellationRecord, error: cancellationError } = await supabase
      .from("cfdi_cancellation_requests")
      .insert({
        cfdi_invoice_id,
        motivo,
        uuid_sustitucion: uuid_sustitucion || null,
        status: "pending",
        requested_by: requestedBy,
      })
      .select()
      .single();

    if (cancellationError || !cancellationRecord) {
      throw new Error(`Failed to create cancellation record: ${cancellationError?.message}`);
    }

    let pacCancellationId: string;
    try {
      pacCancellationId = await cancelWithProvider(
        cfdi.pac_provider,
        settings.pac_api_key_encrypted!,
        settings.pac_organization_id || "",
        cfdi.pac_invoice_id,
        motivo,
        uuid_sustitucion
      );
    } catch (cancelErr) {
      await supabase
        .from("cfdi_cancellation_requests")
        .update({ status: "rejected", error_message: String(cancelErr), processed_at: new Date().toISOString() })
        .eq("id", cancellationRecord.id);

      return new Response(
        JSON.stringify({ error: "PAC cancellation failed", detail: String(cancelErr) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark cancellation as accepted
    await supabase
      .from("cfdi_cancellation_requests")
      .update({
        status: "accepted",
        pac_cancellation_id: pacCancellationId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", cancellationRecord.id);

    // Mark CFDI as cancelled
    await supabase
      .from("cfdi_invoices")
      .update({ status: "cancelled" })
      .eq("id", cfdi_invoice_id);

    return new Response(
      JSON.stringify({ success: true, cancellation_id: cancellationRecord.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
