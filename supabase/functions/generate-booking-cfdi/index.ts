import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// =============================================
// BILLING PROVIDER INTERFACE (PAC-agnostic)
// =============================================
interface CfdiConcepto {
  clave_prod_serv: string;
  cantidad: number;
  clave_unidad: string;
  descripcion: string;
  valor_unitario: number;
  impuestos?: {
    traslados?: Array<{
      base: number;
      impuesto: string;
      tipo_factor: string;
      tasa_o_cuota: number;
      importe: number;
    }>;
  };
}

interface CfdiReceptor {
  rfc: string;
  nombre: string;
  domicilio_fiscal_receptor: string;
  regimen_fiscal_receptor: string;
  uso_cfdi: string;
}

interface CfdiTercero {
  rfc: string;
  nombre: string;
  regimen_fiscal: string;
  domicilio_fiscal: string;
}

interface CfdiRequest {
  tipo_de_comprobante: string;
  serie: string;
  receptor: CfdiReceptor;
  conceptos: CfdiConcepto[];
  tercero?: CfdiTercero;
}

interface CfdiResult {
  pac_invoice_id: string;
  uuid_fiscal: string;
  folio: string;
  serie: string;
  xml_url: string;
  pdf_url: string;
  stamped_at: string;
}

// =============================================
// FACTURAPI ADAPTER
// =============================================
async function facturapiStamp(
  apiKey: string,
  organizationId: string,
  request: CfdiRequest,
  sandboxMode: boolean
): Promise<CfdiResult> {
  const baseUrl = "https://www.facturapi.io/v2";

  const body: Record<string, unknown> = {
    tipo: request.tipo_de_comprobante,
    serie: request.serie,
    receptor: {
      uid: undefined,
      legal_name: request.receptor.nombre,
      tax_id: request.receptor.rfc,
      tax_system: request.receptor.regimen_fiscal_receptor,
      zip: request.receptor.domicilio_fiscal_receptor,
      uso_cfdi: request.receptor.uso_cfdi,
    },
    items: request.conceptos.map((c) => ({
      product: {
        description: c.descripcion,
        product_key: c.clave_prod_serv,
        unit_key: c.clave_unidad,
        price: c.valor_unitario,
        tax_included: false,
        taxes: [{ type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
      },
      quantity: c.cantidad,
    })),
  };

  if (request.tercero) {
    body.tercero = {
      tax_id: request.tercero.rfc,
      legal_name: request.tercero.nombre,
      tax_system: request.tercero.regimen_fiscal,
      zip: request.tercero.domicilio_fiscal,
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const res = await fetch(`${baseUrl}/invoices`, {
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
    serie: data.series ?? request.serie,
    xml_url: `${baseUrl}/invoices/${data.id}/xml`,
    pdf_url: `${baseUrl}/invoices/${data.id}/pdf`,
    stamped_at: data.created_at ?? new Date().toISOString(),
  };
}

// =============================================
// PROVIDER DISPATCHER (add new PACs here)
// =============================================
async function stampCfdi(
  provider: string,
  apiKey: string,
  orgId: string,
  request: CfdiRequest,
  sandboxMode: boolean
): Promise<CfdiResult> {
  switch (provider) {
    case "facturapi":
      return facturapiStamp(apiKey, orgId, request, sandboxMode);
    default:
      throw new Error(`Unknown PAC provider: ${provider}`);
  }
}

// =============================================
// MAIN HANDLER
// =============================================
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if a CFDI already exists (stamped or pending) for this booking
    const { data: existingCfdi } = await supabase
      .from("cfdi_invoices")
      .select("id, status")
      .eq("booking_id", booking_id)
      .eq("invoice_type", "booking")
      .in("status", ["stamped", "pending"])
      .maybeSingle();

    if (existingCfdi) {
      return new Response(
        JSON.stringify({ message: "CFDI already exists", cfdi_id: existingCfdi.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id, total_price, user_id, tour_id, booking_code,
        tours (name, agencies (id, rfc, razon_social, regimen_fiscal, postal_code)),
        users (id, full_name, rfc, razon_social, regimen_fiscal, uso_cfdi, codigo_postal_fiscal)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load platform settings
    const { data: settings } = await supabase
      .from("platform_settings")
      .select(
        "pac_provider, pac_api_key_encrypted, pac_organization_id, cfdi_serie_booking, pac_sandbox_mode, pac_issuer_rfc, pac_issuer_razon_social, pac_issuer_regimen_fiscal"
      )
      .maybeSingle();

    if (!settings || settings.pac_provider === "none" || !settings.pac_api_key_encrypted) {
      return new Response(
        JSON.stringify({ error: "PAC provider not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate IVA (price already includes IVA 16%)
    const total = Number(booking.total_price);
    const subtotal = Math.round((total / 1.16) * 100) / 100;
    const iva = Math.round((total - subtotal) * 100) / 100;

    // Build receptor data
    const traveler = booking.users as {
      id: string;
      full_name: string;
      rfc?: string;
      razon_social?: string;
      regimen_fiscal?: string;
      uso_cfdi?: string;
      codigo_postal_fiscal?: string;
    };

    const receptorRfc = traveler?.rfc || "XAXX010101000";
    const receptorNombre = traveler?.razon_social || traveler?.full_name || "PUBLICO EN GENERAL";
    const receptorRegimen = traveler?.regimen_fiscal || "616";
    const receptorUsoCfdi = traveler?.uso_cfdi || "S01";
    const receptorCP = traveler?.codigo_postal_fiscal || "06600";

    // Build "a cuenta de terceros" (agency pass-through)
    const agency = (booking.tours as { agencies: { id: string; rfc?: string; razon_social?: string; regimen_fiscal?: string; postal_code?: string } }).agencies;
    let tercero: CfdiTercero | undefined;
    if (agency?.rfc && agency?.razon_social) {
      tercero = {
        rfc: agency.rfc,
        nombre: agency.razon_social,
        regimen_fiscal: agency.regimen_fiscal || "612",
        domicilio_fiscal: agency.postal_code || "06600",
      };
    }

    const tourName = (booking.tours as { name: string }).name;
    const cfdiRequest: CfdiRequest = {
      tipo_de_comprobante: "I",
      serie: settings.cfdi_serie_booking || "A",
      receptor: {
        rfc: receptorRfc,
        nombre: receptorNombre,
        domicilio_fiscal_receptor: receptorCP,
        regimen_fiscal_receptor: receptorRegimen,
        uso_cfdi: receptorUsoCfdi,
      },
      conceptos: [
        {
          clave_prod_serv: "90121500",
          cantidad: 1,
          clave_unidad: "E48",
          descripcion: `Servicio de viaje: ${tourName} (Reserva ${booking.booking_code || booking.id})`,
          valor_unitario: subtotal,
        },
      ],
      tercero,
    };

    // Create pending CFDI record
    const { data: cfdiRecord, error: insertError } = await supabase
      .from("cfdi_invoices")
      .insert({
        invoice_type: "booking",
        booking_id: booking.id,
        agency_id: agency?.id || null,
        pac_provider: settings.pac_provider,
        serie: settings.cfdi_serie_booking || "A",
        receptor_rfc: receptorRfc,
        receptor_razon_social: receptorNombre,
        receptor_regimen_fiscal: receptorRegimen,
        receptor_uso_cfdi: receptorUsoCfdi,
        receptor_codigo_postal: receptorCP,
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

    // Stamp with PAC
    let cfdiResult: CfdiResult;
    try {
      cfdiResult = await stampCfdi(
        settings.pac_provider,
        settings.pac_api_key_encrypted!,
        settings.pac_organization_id || "",
        cfdiRequest,
        settings.pac_sandbox_mode
      );
    } catch (stampError) {
      // Update record with error
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

    // Update CFDI record with stamped data
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

    // Send email notification (fire and forget)
    EdgeRuntime.waitUntil(
      supabase.functions.invoke("send-cfdi-email", {
        body: { cfdi_invoice_id: cfdiRecord.id, recipient_type: "traveler" },
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
