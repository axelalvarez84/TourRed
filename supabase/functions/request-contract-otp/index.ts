import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
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
      .select("id, onboarding_status, contact_email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agency) return new Response(JSON.stringify({ error: "Agencia no encontrada" }), { status: 404, headers: corsHeaders });

    if (agency.onboarding_status !== "pending_signature") {
      return new Response(JSON.stringify({ error: "La agencia no está en etapa de firma" }), { status: 409, headers: corsHeaders });
    }

    // Verify that a pending contract_acceptances record exists (created by approve-agency-documents)
    const { data: existing } = await supabase
      .from("contract_acceptances")
      .select("id, otp_request_count, otp_window_started_at, folio_contrato")
      .eq("agency_id", agency.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!existing) {
      console.error(`Inconsistent state: agency ${agency.id} is pending_signature but has no pending contract_acceptances record`);
      return new Response(
        JSON.stringify({ error: "Error de estado: no se encontró el registro del contrato. Contacta a soporte." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existing.folio_contrato) {
      console.error(`Inconsistent state: contract_acceptances ${existing.id} has null folio_contrato`);
      return new Response(
        JSON.stringify({ error: "Error de estado: folio de contrato ausente. Contacta a soporte." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate-limit: 3 requests per 15-minute window
    const now            = new Date();
    const WINDOW_MINUTES = 15;
    const MAX_REQUESTS   = 3;

    const windowStarted  = existing.otp_window_started_at ? new Date(existing.otp_window_started_at) : null;
    const windowExpired  = !windowStarted || (now.getTime() - windowStarted.getTime()) > WINDOW_MINUTES * 60 * 1000;

    let newCount         = 1;
    let newWindowStarted = now.toISOString();

    if (!windowExpired) {
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

    // Generate OTP
    const otp       = generateOtp();
    const otpHash   = await hashOtp(otp);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const { error: updErr } = await supabase
      .from("contract_acceptances")
      .update({
        otp_code_hash:         otpHash,
        otp_expires_at:        expiresAt,
        otp_request_count:     newCount,
        otp_window_started_at: newWindowStarted,
      })
      .eq("id", existing.id)
      .eq("status", "pending");

    if (updErr) throw updErr;

    // Send OTP via email
    const recipientEmail = agency.contact_email ?? user.email ?? "";
    await sendOtpEmail(recipientEmail, otp, supabaseUrl, serviceKey);

    return new Response(
      JSON.stringify({ ok: true, message: "Código enviado al correo registrado.", folio: existing.folio_contrato }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500, headers: corsHeaders });
  }
});
