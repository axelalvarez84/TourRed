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

function generateFolio(agencyId: string): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `TRG-${Date.now()}-${hex}`;
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    // Must be admin
    const { data: adminUser } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    if (adminUser?.role !== "admin") return new Response(JSON.stringify({ error: "Acceso denegado" }), { status: 403, headers: corsHeaders });

    const body = await req.json();
    const { agency_id, document_ids, action } = body; // action: 'approve' | 'reject'
    const rejectionReason: string | undefined = body.rejection_reason;

    if (!agency_id || !document_ids?.length || !action) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), { status: 400, headers: corsHeaders });
    }

    if (!["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Acción inválida" }), { status: 400, headers: corsHeaders });
    }

    if (action === "reject" && !rejectionReason) {
      return new Response(JSON.stringify({ error: "Se requiere motivo de rechazo" }), { status: 422, headers: corsHeaders });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update individual documents
    const { error: updateErr } = await supabase
      .from("agency_documents")
      .update({
        status:           newStatus,
        rejection_reason: action === "reject" ? rejectionReason : null,
        reviewed_by:      user.id,
        reviewed_at:      new Date().toISOString(),
      })
      .in("id", document_ids)
      .eq("agency_id", agency_id);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Error al actualizar documentos" }), { status: 500, headers: corsHeaders });
    }

    // If all required current docs are approved → generate pre-signature contract PDF and advance to pending_signature
    if (action === "approve") {
      const { data: reqTypes } = await supabase
        .from("document_types")
        .select("key")
        .eq("required", true)
        .neq("key", "contrato_agencia");

      const requiredKeys = (reqTypes ?? []).map((r: any) => r.key);

      const { data: approvedDocs } = await supabase
        .from("agency_documents")
        .select("document_type_key")
        .eq("agency_id", agency_id)
        .eq("is_current", true)
        .eq("status", "approved")
        .neq("document_type_key", "contrato_agencia");

      const approvedKeys = (approvedDocs ?? []).map((d: any) => d.document_type_key);
      const allApproved = requiredKeys.every((k: string) => approvedKeys.includes(k));

      if (allApproved) {
        // Load agency data
        const { data: agency } = await supabase
          .from("agencies")
          .select("id, user_id, razon_social, rfc, domicilio_fiscal, representante_legal_nombre, name, contact_email")
          .eq("id", agency_id)
          .maybeSingle();

        if (!agency) {
          return new Response(JSON.stringify({ error: "Agencia no encontrada" }), { status: 404, headers: corsHeaders });
        }

        // Validate required contract fields — 422 if any missing
        const missingFields: string[] = [];
        if (!agency.razon_social?.trim())                 missingFields.push("razon_social");
        if (!agency.rfc?.trim())                          missingFields.push("rfc");
        if (!agency.domicilio_fiscal?.trim())             missingFields.push("domicilio_fiscal");
        if (!agency.representante_legal_nombre?.trim())   missingFields.push("representante_legal_nombre");

        if (missingFields.length > 0) {
          return new Response(
            JSON.stringify({
              error: `No se puede generar el contrato. Campos faltantes en el perfil de la agencia: ${missingFields.join(", ")}. Completa estos datos antes de aprobar los documentos.`,
              missing_fields: missingFields,
            }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Idempotency: if a pending contract_acceptances already exists, return success without re-generating
        const { data: existingAcceptance } = await supabase
          .from("contract_acceptances")
          .select("id, folio_contrato")
          .eq("agency_id", agency_id)
          .eq("status", "pending")
          .maybeSingle();

        if (existingAcceptance) {
          // Already generated — this is a retry. Respond with success.
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate folio
        const folio = generateFolio(agency_id);

        // Build contract data
        const nowDate   = new Date();
        const MESES     = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
        const contractData: ContractData = {
          razonSocial:        agency.razon_social!,
          rfcAgencia:         agency.rfc!,
          domicilioFiscal:    agency.domicilio_fiscal!,
          representanteLegal: agency.representante_legal_nombre!,
          emailContacto:      agency.contact_email ?? "",
          folioContrato:      folio,
          fechaDia:           String(nowDate.getDate()).padStart(2, "0"),
          fechaMes:           MESES[nowDate.getMonth()],
          fechaAnio:          String(nowDate.getFullYear()),
          versionContrato:    "1.0",
        };

        // Generate pre-signature PDF
        // deno-lint-ignore no-explicit-any
        const printer  = new (PdfPrinter as any)(fonts);
        const docDef   = buildContractDocDefinition(contractData);
        const pdfDoc   = printer.createPdfKitDocument(docDef);
        const pdfBytes = await pdfDocToBytes(pdfDoc);

        // Upload pre-signature PDF to storage
        const pdfPath = `${agency_id}/contrato_agencia/contrato_previo_${Date.now()}.pdf`;
        const { error: uploadErr } = await supabase.storage
          .from("agency-documents")
          .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });

        if (uploadErr) {
          console.error("Pre-signature PDF upload error:", uploadErr.message);
          return new Response(JSON.stringify({ error: "Error al generar el contrato PDF" }), { status: 500, headers: corsHeaders });
        }

        // Supersede any prior contrato_agencia documents
        await supabase.from("agency_documents")
          .update({ is_current: false, status: "superseded" })
          .eq("agency_id", agency_id)
          .eq("document_type_key", "contrato_agencia")
          .eq("is_current", true);

        // Insert new contrato_agencia document record
        await supabase.from("agency_documents").insert({
          agency_id:         agency_id,
          document_type_key: "contrato_agencia",
          storage_path:      pdfPath,
          file_name:         `Contrato_ToursRed_${folio}.pdf`,
          mime_type:         "application/pdf",
          is_current:        true,
          status:            "pending_review",
          uploaded_by:       user.id,
        });

        // Insert contract_acceptances record
        await supabase.from("contract_acceptances").insert({
          agency_id:        agency_id,
          contract_version: "1.0",
          folio_contrato:   folio,
          status:           "pending",
        });

        // Advance onboarding_status to pending_signature (no documents_completed_at touch)
        await supabase
          .from("agencies")
          .update({ onboarding_status: "pending_signature" })
          .eq("id", agency_id)
          .eq("onboarding_status", "pending_documents");

        // Notify agency
        if (agency.user_id) {
          await supabase.from("notifications").insert({
            user_id: agency.user_id,
            type:    "agency_documents_approved",
            title:   "Documentos aprobados — contrato listo para firmar",
            message: "Tus documentos han sido verificados. Ya puedes revisar y firmar tu contrato de colaboración con ToursRed.",
          }).select();
        }
      }
    } else {
      // Reject: notify agency & set status back to pending_documents
      await supabase
        .from("agencies")
        .update({ onboarding_status: "pending_documents" })
        .eq("id", agency_id)
        .in("onboarding_status", ["pending_review", "pending_documents"]);

      const { data: agencyRow } = await supabase.from("agencies").select("user_id").eq("id", agency_id).maybeSingle();
      if (agencyRow?.user_id) {
        await supabase.from("notifications").insert({
          user_id: agencyRow.user_id,
          type:    "agency_documents_rejected",
          title:   "Documentos requieren corrección",
          message: `Algunos de tus documentos fueron rechazados: ${rejectionReason}. Por favor súbelos nuevamente.`,
        }).select();
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
