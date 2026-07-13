import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import PdfPrinter from "npm:pdfmake@0.2.20";
import { Buffer } from "node:buffer";
import {
  buildSignedContractDocDefinition,
  type ContractData,
  type AnexoBData,
} from "../_shared/contractDocDefinition.ts";
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

const MAX_OTP_ATTEMPTS = 5;

const fonts = {
  Roboto: {
    normal:      Buffer.from(ROBOTO_NORMAL_B64,      "base64"),
    bold:        Buffer.from(ROBOTO_BOLD_B64,        "base64"),
    italics:     Buffer.from(ROBOTO_ITALICS_B64,     "base64"),
    bolditalics: Buffer.from(ROBOTO_BOLDITALICS_B64, "base64"),
  },
  Courier: {
    normal:      Buffer.from(ROBOTO_NORMAL_B64,      "base64"),
    bold:        Buffer.from(ROBOTO_BOLD_B64,        "base64"),
    italics:     Buffer.from(ROBOTO_ITALICS_B64,     "base64"),
    bolditalics: Buffer.from(ROBOTO_BOLDITALICS_B64, "base64"),
  },
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { otp } = body;

    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "Código OTP inválido" }), { status: 400, headers: corsHeaders });
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, onboarding_status, contact_email, razon_social, rfc, domicilio_fiscal, representante_legal_nombre, name, commission_percentage, pending_amendment_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agency) return new Response(JSON.stringify({ error: "Agencia no encontrada" }), { status: 404, headers: corsHeaders });

    const isInitialFlow   = agency.onboarding_status === "pending_signature";
    const isAmendmentFlow = agency.pending_amendment_id != null;

    if (!isInitialFlow && !isAmendmentFlow) {
      return new Response(JSON.stringify({ error: "La agencia no tiene una firma pendiente" }), { status: 409, headers: corsHeaders });
    }

    const { data: acceptance } = await supabase
      .from("contract_acceptances")
      .select("id, otp_code_hash, otp_expires_at, otp_attempts, contract_version, folio_contrato, amendment_type, commission_percentage_proposed")
      .eq("agency_id", agency.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!acceptance?.otp_code_hash) {
      return new Response(JSON.stringify({ error: "No hay un código activo. Solicita uno nuevo." }), { status: 404, headers: corsHeaders });
    }

    if (acceptance.otp_expires_at && new Date(acceptance.otp_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "El código ha expirado. Solicita uno nuevo." }), { status: 410, headers: corsHeaders });
    }

    // ── Verify OTP ──────────────────────────────────────────────────────────
    const inputHash = await hashOtp(otp);
    if (inputHash !== acceptance.otp_code_hash) {
      const newAttempts = (acceptance.otp_attempts ?? 0) + 1;

      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await supabase.from("contract_acceptances").update({
          otp_attempts:   newAttempts,
          status:         "failed",
          otp_code_hash:  null,
          otp_expires_at: null,
        }).eq("id", acceptance.id);

        return new Response(
          JSON.stringify({ error: "Demasiados intentos fallidos. Solicita un código nuevo." }),
          { status: 429, headers: corsHeaders },
        );
      }

      await supabase.from("contract_acceptances").update({ otp_attempts: newAttempts }).eq("id", acceptance.id);

      const remaining = MAX_OTP_ATTEMPTS - newAttempts;
      return new Response(
        JSON.stringify({ error: `Código incorrecto. Te quedan ${remaining} intento${remaining === 1 ? "" : "s"}.` }),
        { status: 422, headers: corsHeaders },
      );
    }

    // ── OTP válido — build contract data ─────────────────────────────────────
    const now    = new Date();
    const nowIso = now.toISOString();
    const ip     = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "No disponible";
    const ua     = req.headers.get("user-agent") ?? "No disponible";

    const MESES    = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const fechaDia  = String(now.getDate()).padStart(2, "0");
    const fechaMes  = MESES[now.getMonth()];
    const fechaAnio = String(now.getFullYear());

    const folio           = acceptance.folio_contrato as string | null;
    const contractVersion = (acceptance.contract_version as string | null) ?? "1.0";

    if (!folio) {
      console.error(`Inconsistent state: contract_acceptances ${acceptance.id} has null folio_contrato`);
      return new Response(JSON.stringify({ error: "Error de estado: folio de contrato ausente. Contacta a soporte." }), { status: 500, headers: corsHeaders });
    }

    const signerEmail = agency.contact_email ?? user.email ?? "";

    // Resolve effective commission: for amendments use the proposed value; for initial use agency or platform default
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("agency_commission_percentage")
      .limit(1)
      .maybeSingle();

    const platformDefault = platformSettings?.agency_commission_percentage ?? 15;

    const isAmendment         = acceptance.amendment_type === "commission_change";
    const proposedCommission  = acceptance.commission_percentage_proposed as number | null;
    const effectiveCommission = isAmendment
      ? (proposedCommission ?? platformDefault)
      : (agency.commission_percentage ?? platformDefault);

    const specialClause = isAmendment && proposedCommission !== null && proposedCommission !== platformDefault
      ? `No obstante lo dispuesto en la Cláusula Quinta, las partes acuerdan que la comisión aplicable a "${agency.razon_social ?? agency.name}" será del ${proposedCommission}% conforme a negociación particular formalizada en la aprobación de su expediente.`
      : !isAmendment && agency.commission_percentage !== null && agency.commission_percentage !== undefined
        ? `No obstante lo dispuesto en la Cláusula Quinta, las partes acuerdan que la comisión aplicable a "${agency.razon_social ?? agency.name}" será del ${agency.commission_percentage}% conforme a negociación particular formalizada en la aprobación de su expediente.`
        : undefined;

    if (!agency.representante_legal_nombre) {
      console.error(`Inconsistent state: agency ${agency.id} has no representante_legal_nombre`);
      return new Response(JSON.stringify({ error: "Error de estado: nombre del firmante ausente. Contacta a soporte." }), { status: 500, headers: corsHeaders });
    }

    const contractData: ContractData = {
      razonSocial:         agency.razon_social ?? agency.name ?? "Sin nombre",
      rfcAgencia:          agency.rfc ?? "PENDIENTE",
      domicilioFiscal:     agency.domicilio_fiscal ?? "A confirmar",
      representanteLegal:  agency.representante_legal_nombre,
      emailContacto:       signerEmail,
      folioContrato:       folio,
      fechaDia,
      fechaMes,
      fechaAnio,
      versionContrato:     contractVersion,
      commissionPercentage: effectiveCommission,
      specialCommissionClause: specialClause,
    };

    const fechaHoraFormatted = now.toLocaleString("es-MX", {
      timeZone:  "America/Mexico_City",
      dateStyle: "long",
      timeStyle: "medium",
    }) + " (hora Ciudad de México)";

    const anexoData: AnexoBData = {
      contractFolio:        folio,
      contractVersion,
      razonSocial:          contractData.razonSocial,
      rfcAgencia:           contractData.rfcAgencia,
      emailAceptacion:      signerEmail,
      fechaHoraAceptacion:  fechaHoraFormatted,
      ipAceptacion:         ip,
      userAgentAceptacion:  ua.length > 120 ? ua.slice(0, 120) + "…" : ua,
      otpEstatus:           "Verificado — código de 6 dígitos validado correctamente",
    };

    // deno-lint-ignore no-explicit-any
    const printer   = new (PdfPrinter as any)(fonts);
    const docDef    = buildSignedContractDocDefinition(contractData, anexoData);
    const pdfDoc    = printer.createPdfKitDocument(docDef);
    const pdfBytes  = await pdfDocToBytes(pdfDoc);

    const hashBuffer   = await crypto.subtle.digest("SHA-256", pdfBytes);
    const documentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const pdfName = isAmendment
      ? `enmienda_firmada_${Date.now()}.pdf`
      : `contrato_firmado_${Date.now()}.pdf`;
    const pdfPath = `${agency.id}/contrato_agencia/${pdfName}`;
    const { error: uploadErr } = await supabase.storage
      .from("agency-documents")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    // Mark acceptance as signed + record commission at signing (always)
    await supabase.from("contract_acceptances").update({
      status:                       "signed",
      signed_at:                    nowIso,
      signer_user_id:               user.id,
      ip_address:                   ip,
      user_agent:                   ua,
      otp_code_hash:                null,
      otp_expires_at:               null,
      document_hash:                documentHash,
      folio_contrato:               folio,
      accepted_email:               signerEmail,
      commission_percentage_at_signing: effectiveCommission,
    }).eq("id", acceptance.id);

    // Supersede previous contrato_agencia doc + insert signed one
    await supabase.from("agency_documents")
      .update({ is_current: false, status: "superseded" })
      .eq("agency_id", agency.id)
      .eq("document_type_key", "contrato_agencia")
      .eq("is_current", true);

    await supabase.from("agency_documents").insert({
      agency_id:         agency.id,
      document_type_key: "contrato_agencia",
      storage_path:      pdfPath,
      file_name:         isAmendment
        ? `Enmienda_firmada_${folio}_${nowIso.slice(0, 10)}.pdf`
        : `Contrato_firmado_${folio}_${nowIso.slice(0, 10)}.pdf`,
      mime_type:         "application/pdf",
      is_current:        true,
      status:            "pending_review",
      uploaded_by:       user.id,
    });

    if (isAmendment) {
      // Apply commission change + clear pending amendment — keep onboarding_status untouched
      await supabase.from("agencies").update({
        commission_percentage:  effectiveCommission,
        pending_amendment_id:   null,
        signed_contract_url:    pdfPath,
      }).eq("id", agency.id);

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id:   user.id,
        event_type: "commission_amendment_signed",
        severity:   "info",
        old_values: { commission_percentage: agency.commission_percentage },
        new_values: { commission_percentage: effectiveCommission },
        metadata:   { agency_id: agency.id, folio, acceptance_id: acceptance.id },
      }).select();
    } else {
      // Initial signing: advance agency to active
      await supabase.from("agencies").update({
        onboarding_status:   "active",
        is_approved:         true,
        approved_at:         nowIso,
        signed_contract_url: pdfPath,
        // Persist effective commission on first signing for reference
        commission_percentage: agency.commission_percentage, // keep null if was null (uses platform default)
      }).eq("id", agency.id);
    }

    return new Response(
      JSON.stringify({
        ok:            true,
        message:       isAmendment ? "Enmienda firmada exitosamente." : "Contrato firmado exitosamente.",
        folio,
        document_hash: documentHash,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
