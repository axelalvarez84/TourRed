import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InsuranceNotificationRequest {
  booking_id: string;
  booking_code: string;
  tour_name: string;
  tour_start_date: string;
  tour_end_date: string;
  agency_name: string;
  traveler_name: string;
  traveler_email: string;
  count_adultos: number;
  count_ninos: number;
  count_infantes: number;
  count_adultos_mayores: number;
  total_travelers: number;
  tour_days: number;
  insurance_cost: number;
}

function formatMXN(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: InsuranceNotificationRequest = await req.json();

    const {
      booking_id,
      booking_code,
      tour_name,
      tour_start_date,
      tour_end_date,
      agency_name,
      traveler_name,
      traveler_email,
      count_adultos,
      count_ninos,
      count_infantes,
      count_adultos_mayores,
      total_travelers,
      tour_days,
      insurance_cost,
    } = payload;

    // Obtener configuración de email
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("smtp_api_key, contact_email")
      .maybeSingle();

    if (!emailSettings?.smtp_api_key) {
      throw new Error("Email settings no configurados");
    }

    const recipientEmail = "seguros@toursred.com.mx";
    const pricePerDay = total_travelers > 0 ? insurance_cost / tour_days / total_travelers : insurance_cost;

    const travelerRows = [
      count_adultos > 0 ? `<tr><td style="padding:6px 12px;color:#374151;">Adultos</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${count_adultos}</td></tr>` : "",
      count_ninos > 0 ? `<tr><td style="padding:6px 12px;color:#374151;">Niños</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${count_ninos}</td></tr>` : "",
      count_infantes > 0 ? `<tr><td style="padding:6px 12px;color:#374151;">Infantes</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${count_infantes}</td></tr>` : "",
      count_adultos_mayores > 0 ? `<tr><td style="padding:6px 12px;color:#374151;">Adultos mayores</td><td style="padding:6px 12px;text-align:right;font-weight:600;">${count_adultos_mayores}</td></tr>` : "",
    ].filter(Boolean).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Nueva solicitud de seguro de viaje</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b,#065f46);padding:32px 40px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">🛡️</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;">Nueva solicitud de seguro de viaje</h1>
              <p style="color:#a7f3d0;font-size:14px;margin:0;">Emitir póliza con Assist Card o Universal Assistance según corresponda</p>
            </td>
          </tr>

          <!-- Alert box -->
          <tr>
            <td style="padding:24px 40px 0;">
              <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:14px 18px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:20px;">✅</span>
                <div>
                  <p style="margin:0;font-weight:600;color:#065f46;font-size:14px;">Pago recibido — seguro contratado</p>
                  <p style="margin:4px 0 0;color:#047857;font-size:13px;">El viajero pagó <strong>${formatMXN(insurance_cost)}</strong> por cobertura de seguro de viaje. Favor de emitir la póliza correspondiente.</p>
                </div>
              </div>
            </td>
          </tr>

          <!-- Booking data -->
          <tr>
            <td style="padding:24px 40px;">
              <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
                📋 Datos de la Reserva
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;width:45%;">Código de reserva</td>
                  <td style="padding:8px 12px;font-weight:700;font-size:13px;font-family:monospace;color:#111827;">${booking_code}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Tour</td>
                  <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#111827;">${tour_name}</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Agencia</td>
                  <td style="padding:8px 12px;font-size:13px;color:#374151;">${agency_name || "—"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Fecha de salida</td>
                  <td style="padding:8px 12px;font-size:13px;color:#374151;">${formatDate(tour_start_date)}</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Fecha de regreso</td>
                  <td style="padding:8px 12px;font-size:13px;color:#374151;">${formatDate(tour_end_date)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Días de cobertura</td>
                  <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#111827;">${tour_days} día${tour_days !== 1 ? "s" : ""}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Traveler data -->
          <tr>
            <td style="padding:0 40px 24px;">
              <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
                👤 Datos del Viajero Titular
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;width:45%;">Nombre</td>
                  <td style="padding:8px 12px;font-weight:600;font-size:13px;color:#111827;">${traveler_name || "—"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Email</td>
                  <td style="padding:8px 12px;font-size:13px;color:#374151;"><a href="mailto:${traveler_email}" style="color:#059669;">${traveler_email || "—"}</a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Travelers count -->
          <tr>
            <td style="padding:0 40px 24px;">
              <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
                👥 Personas a Asegurar
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                ${travelerRows}
                <tr style="background:#ecfdf5;border-top:2px solid #6ee7b7;">
                  <td style="padding:8px 12px;color:#065f46;font-weight:700;font-size:13px;">Total de personas</td>
                  <td style="padding:8px 12px;text-align:right;font-weight:700;color:#065f46;font-size:15px;">${total_travelers}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Insurance cost -->
          <tr>
            <td style="padding:0 40px 32px;">
              <h2 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 16px;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
                💰 Costo del Seguro
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Precio por día por viajero</td>
                  <td style="padding:8px 12px;text-align:right;font-size:13px;color:#374151;">${formatMXN(pricePerDay)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;color:#6b7280;font-size:13px;">Días × viajeros</td>
                  <td style="padding:8px 12px;text-align:right;font-size:13px;color:#374151;">${tour_days} × ${total_travelers}</td>
                </tr>
                <tr style="background:#ecfdf5;border-top:2px solid #6ee7b7;">
                  <td style="padding:10px 12px;color:#065f46;font-weight:700;font-size:15px;">Total pagado (MXN)</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;color:#065f46;font-size:18px;">${formatMXN(insurance_cost)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action required -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;">
                <p style="margin:0 0 8px;font-weight:700;color:#92400e;font-size:14px;">⚡ Acción requerida</p>
                <p style="margin:0;color:#78350f;font-size:13px;line-height:1.6;">
                  Por favor emitir la póliza de asistencia de viaje para los viajeros indicados.
                  Usar <strong>Assist Card</strong> o <strong>Universal Assistance</strong> según disponibilidad y cobertura del destino.
                  Enviar la póliza al email del viajero titular: <strong>${traveler_email}</strong>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Este correo fue generado automáticamente por la plataforma ToursRed.<br/>
                Reserva ID: <code style="background:#e5e7eb;padding:1px 6px;border-radius:4px;">${booking_id}</code>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailPayload = {
      api_key: emailSettings.smtp_api_key,
      to: [{ email: recipientEmail, name: "Seguros ToursRed" }],
      sender: { email: emailSettings.contact_email, name: "ToursRed Plataforma" },
      subject: `🛡️ Seguro de viaje — ${booking_code} | ${tour_name}`,
      html_body: html,
      reply_to: emailSettings.contact_email,
    };

    const smtpResponse = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });

    const smtpData = await smtpResponse.json();

    if (smtpData.data?.succeeded !== 1) {
      console.error("SMTP error:", smtpData);
      throw new Error("Error al enviar email de seguro");
    }

    // Marcar como enviado
    await supabase
      .from("bookings")
      .update({ insurance_email_sent: true })
      .eq("id", booking_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-travel-insurance-notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
