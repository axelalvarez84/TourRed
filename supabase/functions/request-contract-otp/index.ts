import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import PdfPrinter from "npm:pdfmake@0.2.20";
import { Buffer } from "node:buffer";
import { buildContractDocDefinition, type ContractData } from "../_shared/contractDocDefinition.ts";
import {
  ROBOTO_NORMAL_B64,
  ROBOTO_BOLD_B64,
  ROBOTO_ITALICS_B64,
  ROBOTO_BOLDITALICS_B64,
} from "../_shared/robotoFonts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fonts built once — reused across warm invocations
const fonts = {
  Roboto: {
    normal:      Buffer.from(ROBOTO_NORMAL_B64,      "base64"),
    bold:        Buffer.from(ROBOTO_BOLD_B64,        "base64"),
    italics:     Buffer.from(ROBOTO_ITALICS_B64,     "base64"),
    bolditalics: Buffer.from(ROBOTO_BOLDITALICS_B64, "base64"),
  },
  Courier: {
    normal:      Buffer.from(ROBOTO_NORMAL_B64,  "base64"),
    bold:        Buffer.from(ROBOTO_BOLD_B64,    "base64"),
    italics:     Buffer.from(ROBOTO_ITALICS_B64, "base64"),
    bolditalics: Buffer.from(ROBOTO_BOLDITALICS_B64, "base64"),
  },
};

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function pdfDocToBytes(pdfDoc: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  return new Promise((resolve, reject) => {
    pdfDoc.on("data",  (c: Uint8Array) => chunks.push(c));
    pdfDoc.on("error", reject);
    pdfDoc.on("end", () => {
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const out   = new Uint8Array(total);
      let off     = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      resolve(out);
    });
    pdfDoc.end();
  });
}

function generateFolio(agencyId: string): string {
  const year  = new Date().getFullYear();
  const short = agencyId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `TRG-${year}-${short}`;
}

async function sendOtpEmail(email: string, otp: string, supabaseUrl: string, serviceKey: string): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-verification-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email,
      subject: "Código de verificación para firma de contrato — ToursRed",
      otp,
      context: "contract_signature",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email send failed: ${text}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, onboarding_status, contact_email, razon_social, rfc, domicilio_fiscal, representante_legal_nombre, name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agency) return new Response(JSON.stringify({ error: "Agencia no encontrada" }), { status: 404, headers: corsHeaders });

    if (agency.onboarding_status !== "pending_signature") {
      return new Response(JSON.stringify({ error: "La agencia no está en etapa de firma" }), { status: 409, headers: corsHeaders });
    }

    // Rate-limit check
    const { data: existing } = await supabase
      .from("contract_acceptances")
      .select("id, otp_request_count, otp_window_started_at, folio_contrato")
      .eq("agency_id", agency.id)
      .eq("status", "pending")
      .maybeSingle();

    const now = new Date();
    const WINDOW_MINUTES = 15;
    const MAX_REQUESTS   = 3;

    let newCount         = 1;
    let newWindowStarted = now.toISOString();
    let existingId: string | null = existing?.id ?? null;

    if (existing) {
      const windowStarted = existing.otp_window_started_at ? new Date(existing.otp_window_started_at) : null;
      const windowExpired = !windowStarted || (now.getTime() - windowStarted.getTime()) > WINDOW_MINUTES * 60 * 1000;

      if (windowExpired) {
        newCount         = 1;
        newWindowStarted = now.toISOString();
      } else {
        const currentCount = existing.otp_request_count ?? 0;
        if (currentCount >= MAX_REQUESTS) {
          const msRemaining   = WINDOW_MINUTES * 60 * 1000 - (now.getTime() - windowStarted!.getTime());
          const minsRemaining = Math.ceil(msRemaining / 60000);
          return new Response(
            JSON.stringify({
              error: `Demasiados intentos. Espera ${minsRemaining} minuto${minsRemaining !== 1 ? "s" : ""} para solicitar un nuevo código.`,
              retry_after_minutes: minsRemaining,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        newCount         = currentCount + 1;
        newWindowStarted = windowStarted!.toISOString();
      }
    }

    // Generate OTP
    const otp       = generateOtp();
    const otpHash   = await hashOtp(otp);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const body = await req.json().catch(() => ({}));
    const contractVersion = (body?.contract_version as string | undefined) ?? "1.0";

    // Build folio — reuse existing one if available
    const folio = (existing?.folio_contrato as string | undefined) ?? generateFolio(agency.id);

    if (existingId) {
      const { error: updErr } = await supabase
        .from("contract_acceptances")
        .update({
          otp_code_hash:         otpHash,
          otp_expires_at:        expiresAt,
          otp_request_count:     newCount,
          otp_window_started_at: newWindowStarted,
          folio_contrato:        folio,
        })
        .eq("id", existingId)
        .eq("status", "pending");

      if (updErr) throw updErr;
    } else {
      // First request — create record AND generate pre-signature PDF
      const nowDate = new Date();
      const fechaDia  = String(nowDate.getDate()).padStart(2, "0");
      const MESES     = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
      const fechaMes  = MESES[nowDate.getMonth()];
      const fechaAnio = String(nowDate.getFullYear());

      const contractData: ContractData = {
        razonSocial:        agency.razon_social ?? agency.name ?? "Sin nombre",
        rfcAgencia:         agency.rfc ?? "PENDIENTE",
        domicilioFiscal:    agency.domicilio_fiscal ?? "A confirmar",
        representanteLegal: agency.representante_legal_nombre ?? "Representante Legal",
        emailContacto:      agency.contact_email ?? user.email ?? "",
        folioContrato:      folio,
        fechaDia,
        fechaMes,
        fechaAnio,
        versionContrato:    contractVersion,
      };

      // Generate pre-signature PDF
      // deno-lint-ignore no-explicit-any
      const printer      = new (PdfPrinter as any)(fonts);
      const docDef       = buildContractDocDefinition(contractData);
      const pdfDoc       = printer.createPdfKitDocument(docDef);
      const pdfBytes     = await pdfDocToBytes(pdfDoc);

      // Upload pre-signature PDF to storage
      const pdfPath = `${agency.id}/contrato_agencia/contrato_previo_${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("agency-documents")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadErr) console.error("Pre-signature PDF upload error:", uploadErr.message);

      // Supersede any stale pre-signature docs
      await supabase.from("agency_documents")
        .update({ is_current: false, status: "superseded" })
        .eq("agency_id", agency.id)
        .eq("document_type_key", "contrato_agencia")
        .eq("is_current", true);

      if (!uploadErr) {
        await supabase.from("agency_documents").insert({
          agency_id:         agency.id,
          document_type_key: "contrato_agencia",
          storage_path:      pdfPath,
          file_name:         `Contrato_ToursRed_${folio}.pdf`,
          mime_type:         "application/pdf",
          is_current:        true,
          status:            "pending",
          uploaded_by:       user.id,
        });
      }

      // Insert contract acceptance record
      const { data: inserted, error: insErr } = await supabase
        .from("contract_acceptances")
        .insert({
          agency_id:             agency.id,
          contract_version:      contractVersion,
          folio_contrato:        folio,
          status:                "pending",
          otp_code_hash:         otpHash,
          otp_expires_at:        expiresAt,
          otp_request_count:     1,
          otp_window_started_at: newWindowStarted,
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      existingId = inserted.id;
    }

    // Send OTP via email
    const recipientEmail = agency.contact_email ?? user.email ?? "";
    await sendOtpEmail(recipientEmail, otp, supabaseUrl, serviceKey);

    return new Response(
      JSON.stringify({ ok: true, message: "Código enviado al correo registrado.", folio }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
