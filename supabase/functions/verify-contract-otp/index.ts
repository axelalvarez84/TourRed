import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
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

    const body = await req.json();
    const { otp } = body;

    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return new Response(JSON.stringify({ error: "Código OTP inválido" }), { status: 400, headers: corsHeaders });
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("id, onboarding_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agency) return new Response(JSON.stringify({ error: "Agencia no encontrada" }), { status: 404, headers: corsHeaders });

    if (agency.onboarding_status !== "pending_signature") {
      return new Response(JSON.stringify({ error: "La agencia no está en etapa de firma" }), { status: 409, headers: corsHeaders });
    }

    const { data: acceptance } = await supabase
      .from("contract_acceptances")
      .select("id, otp_code_hash, otp_expires_at")
      .eq("agency_id", agency.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!acceptance || !acceptance.otp_code_hash) {
      return new Response(JSON.stringify({ error: "No hay un código activo. Solicita uno nuevo." }), { status: 404, headers: corsHeaders });
    }

    // Check expiry
    if (acceptance.otp_expires_at && new Date(acceptance.otp_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "El código ha expirado. Solicita uno nuevo." }), { status: 410, headers: corsHeaders });
    }

    // Verify OTP
    const inputHash = await hashOtp(otp);
    if (inputHash !== acceptance.otp_code_hash) {
      return new Response(JSON.stringify({ error: "Código incorrecto." }), { status: 422, headers: corsHeaders });
    }

    const now = new Date().toISOString();
    const ip  = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
    const ua  = req.headers.get("user-agent") ?? null;

    // Mark contract as signed
    await supabase.from("contract_acceptances").update({
      status:        "signed",
      signed_at:     now,
      signer_user_id:user.id,
      ip_address:    ip,
      user_agent:    ua,
      otp_code_hash: null, // clear hash after use
      otp_expires_at:null,
    }).eq("id", acceptance.id);

    // Mark contrato_agencia doc as approved (creates record if not yet)
    const storagePath = `${agency.id}/contrato_agencia/signed_${Date.now()}.txt`;
    // Supersede any prior
    await supabase.from("agency_documents")
      .update({ is_current: false, status: "superseded" })
      .eq("agency_id", agency.id)
      .eq("document_type_key", "contrato_agencia")
      .eq("is_current", true);

    await supabase.from("agency_documents").insert({
      agency_id:         agency.id,
      document_type_key: "contrato_agencia",
      storage_path:      storagePath,
      file_name:         `Contrato_firmado_${now.slice(0,10)}.pdf`,
      mime_type:         "application/pdf",
      is_current:        true,
      status:            "approved",
      reviewed_by:       user.id,
      reviewed_at:       now,
      uploaded_by:       user.id,
    });

    // Advance onboarding_status to active
    await supabase.from("agencies").update({
      onboarding_status: "active",
      is_approved:       true,
      approved_at:       now,
    }).eq("id", agency.id);

    return new Response(JSON.stringify({ ok: true, message: "Contrato firmado exitosamente." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
