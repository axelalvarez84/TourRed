import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CfdiResult {
  pac_invoice_id: string;
  uuid_fiscal: string;
  folio: string;
  serie: string;
  xml_url: string;
  pdf_url: string;
  stamped_at: string;
}

async function facturapiStamp(
  apiKey: string,
  orgId: string,
  body: Record<string, unknown>
): Promise<CfdiResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch("https://www.facturapi.io/v2/invoices", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FacturAPI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    pac_invoice_id: data.id,
    uuid_fiscal: data.uuid,
    folio: data.folio_number?.toString() ?? "",
    serie: data.series ?? "",
    xml_url: `https://www.facturapi.io/v2/invoices/${data.id}/xml`,
    pdf_url: `https://www.facturapi.io/v2/invoices/${data.id}/pdf`,
    stamped_at: data.created_at ?? new Date().toISOString(),
  };
}

async function stampCfdi(
  provider: string,
  apiKey: string,
  orgId: string,
  body: Record<string, unknown>
): Promise<CfdiResult> {
  switch (provider) {
    case "facturapi":
      return facturapiStamp(apiKey, orgId, body);
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

    const { payout_id } = await req.json();
    if (!payout_id) {
      return new Response(JSON.stringify({ error: "payout_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if CFDI already exists for this payout
    const { data: existing } = await supabase
      .from("cfdi_invoices")
      .select("id, status")
      .eq("payout_id", payout_id)
      .eq("invoice_type", "commission")
      .in("status", ["stamped", "pending"])
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ message: "CFDI already exists", cfdi_id: existing.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load payout details
    const { data: payout, error: payoutError } = await supabase
      .from("agency_payouts")
      .select(`
        id, net_amount, payout_code,
        agencies (id, rfc, razon_social, regimen_fiscal, postal_code)
      `)
      .eq("id", payout_id)
      .maybeSingle();

    if (payoutError || !payout) {
      return new Response(JSON.stringify({ error: "Payout not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load platform settings
    const { data: settings } = await supabase
      .from("platform_settings")
      .select(
        "pac_provider, pac_api_key_encrypted, pac_organization_id, cfdi_serie_commission, pac_sandbox_mode, pac_issuer_rfc, pac_issuer_razon_social, pac_issuer_regimen_fiscal"
      )
      .maybeSingle();

    if (!settings || settings.pac_provider === "none" || !settings.pac_api_key_encrypted) {
      return new Response(
        JSON.stringify({ error: "PAC provider not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agency = payout.agencies as {
      id: string;
      rfc?: string;
      razon_social?: string;
      regimen_fiscal?: string;
      postal_code?: string;
    };

    if (!agency?.rfc || !agency?.razon_social) {
      return new Response(
        JSON.stringify({ error: "Agency fiscal data (RFC, razon_social) is incomplete" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Commission CFDI: ToursRed bills the agency directly (no tercero node)
    // IVA already included in commission amount
    const total = Number(payout.net_amount);
    const subtotal = Math.round((total / 1.16) * 100) / 100;
    const iva = Math.round((total - subtotal) * 100) / 100;

    const serie = settings.cfdi_serie_commission || "B";
    const facturapiBody = {
      tipo: "I",
      series: serie,
      receptor: {
        legal_name: agency.razon_social,
        tax_id: agency.rfc,
        tax_system: agency.regimen_fiscal || "612",
        zip: agency.postal_code || "06600",
        uso_cfdi: "G03",
      },
      items: [
        {
          product: {
            description: `Comision por servicios de plataforma - Pago ${payout.payout_code || payout_id}`,
            product_key: "80141600",
            unit_key: "E48",
            price: subtotal,
            tax_included: false,
            taxes: [
              { type: "IVA", rate: 0.16, factor: "Tasa", withholding: false },
            ],
          },
          quantity: 1,
        },
      ],
    };

    // Create pending CFDI record
    const { data: cfdiRecord, error: insertError } = await supabase
      .from("cfdi_invoices")
      .insert({
        invoice_type: "commission",
        payout_id: payout.id,
        agency_id: agency.id,
        pac_provider: settings.pac_provider,
        serie,
        receptor_rfc: agency.rfc,
        receptor_razon_social: agency.razon_social,
        receptor_regimen_fiscal: agency.regimen_fiscal || "612",
        receptor_uso_cfdi: "G03",
        receptor_codigo_postal: agency.postal_code || "06600",
        subtotal,
        iva_amount: iva,
        total,
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !cfdiRecord) {
      throw new Error(`Failed to create CFDI record: ${insertError?.message}`);
    }

    let cfdiResult: CfdiResult;
    try {
      cfdiResult = await stampCfdi(
        settings.pac_provider,
        settings.pac_api_key_encrypted!,
        settings.pac_organization_id || "",
        facturapiBody
      );
    } catch (stampError) {
      await supabase
        .from("cfdi_invoices")
        .update({
          status: "error",
          error_message: String(stampError),
          retry_count: cfdiRecord.retry_count + 1,
        })
        .eq("id", cfdiRecord.id);

      return new Response(
        JSON.stringify({ error: "PAC stamping failed", detail: String(stampError) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("cfdi_invoices")
      .update({
        pac_invoice_id: cfdiResult.pac_invoice_id,
        uuid_fiscal: cfdiResult.uuid_fiscal,
        folio: cfdiResult.folio,
        serie: cfdiResult.serie,
        xml_url: cfdiResult.xml_url,
        pdf_url: cfdiResult.pdf_url,
        stamped_at: cfdiResult.stamped_at,
        status: "stamped",
        error_message: null,
      })
      .eq("id", cfdiRecord.id);

    EdgeRuntime.waitUntil(
      supabase.functions.invoke("send-cfdi-email", {
        body: { cfdi_invoice_id: cfdiRecord.id, recipient_type: "agency" },
      }).catch(() => {})
    );

    return new Response(
      JSON.stringify({
        success: true,
        cfdi_id: cfdiRecord.id,
        uuid_fiscal: cfdiResult.uuid_fiscal,
        xml_url: cfdiResult.xml_url,
        pdf_url: cfdiResult.pdf_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
