import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PayoutConfirmationRequest {
  agency_id: string;
  commission_ids: string[];
  total_amount: number;
  payment_method: string;
  payment_notes?: string;
  receipt_url?: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Transferencia Bancaria",
  check: "Cheque",
  paypal: "PayPal",
  mercadopago: "Mercado Pago",
  other: "Otro"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("🚀 send-payout-confirmation: Función iniciada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      agency_id,
      commission_ids,
      total_amount,
      payment_method,
      payment_notes,
      receipt_url
    }: PayoutConfirmationRequest = await req.json();

    console.log("📝 Agency ID:", agency_id);
    console.log("📝 Commission IDs:", commission_ids);
    console.log("💰 Total Amount:", total_amount);

    const { data: agency, error: agencyError } = await supabase
      .from("agencies")
      .select("*, users!agencies_user_id_fkey(email, first_name, last_name)")
      .eq("id", agency_id)
      .single();

    if (agencyError || !agency) {
      console.error("❌ Error al obtener agencia:", agencyError);
      throw new Error("Agencia no encontrada");
    }

    const { data: adminSettings, error: settingsError } = await supabase
      .from("platform_settings")
      .select("smtp_api_key, admin_email")
      .eq("id", 1)
      .single();

    if (settingsError || !adminSettings?.smtp_api_key) {
      console.error("❌ Error configuración email:", settingsError);
      throw new Error("Configuración de email no disponible");
    }

    const { data: logoData } = await supabase
      .from("platform_settings")
      .select("logo_url")
      .eq("id", 1)
      .single();

    const logoUrl = logoData?.logo_url || `${supabaseUrl}/storage/v1/object/public/images/logo.png`;

    const agencyEmail = agency.users?.email || agency.email;
    const agencyName = agency.name;
    const adminEmail = adminSettings.admin_email || "admin@toursred.com";
    const paymentMethodLabel = PAYMENT_METHOD_LABELS[payment_method] || payment_method;

    const formattedAmount = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(total_amount);

    const currentDate = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const receiptSection = receipt_url
      ? `
        <tr>
          <td style="padding: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 15px; background-color: #f0f9ff; border-radius: 8px;">
                  <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: 600;">📄 Comprobante de Pago</p>
                  <a href="${receipt_url}"
                     style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
                    Ver Comprobante
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
      : '';

    const notesSection = payment_notes
      ? `
        <tr>
          <td style="padding: 20px 0;">
            <p style="color: #4b5563; margin: 0 0 5px 0; font-weight: 600;">Notas:</p>
            <p style="color: #6b7280; margin: 0;">${payment_notes}</p>
          </td>
        </tr>
      `
      : '';

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Pago</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <img src="${logoUrl}" alt="ToursRed" style="max-width: 180px; height: auto; margin-bottom: 20px;">
                    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">💸 Pago Procesado</h1>
                    <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Se ha procesado un pago a tu agencia</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                      Hola <strong>${agencyName}</strong>,
                    </p>

                    <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 30px 0;">
                      Te informamos que se ha procesado un pago correspondiente a las comisiones de tus tours en ToursRed.
                    </p>

                    <!-- Payment Details -->
                    <table style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                      <tr>
                        <td style="padding: 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px;">
                          <table style="width: 100%;">
                            <tr>
                              <td style="padding: 10px 0;">
                                <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 14px;">Monto Total</p>
                                <p style="color: white; margin: 5px 0 0 0; font-size: 32px; font-weight: 700;">${formattedAmount}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 15px 0 5px 0; border-top: 1px solid rgba(255, 255, 255, 0.2);">
                                <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 13px;">Método de Pago</p>
                                <p style="color: white; margin: 5px 0 0 0; font-size: 16px; font-weight: 600;">${paymentMethodLabel}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0 5px 0;">
                                <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 13px;">Comisiones Pagadas</p>
                                <p style="color: white; margin: 5px 0 0 0; font-size: 16px; font-weight: 600;">${commission_ids.length}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0 0 0;">
                                <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 13px;">Fecha de Pago</p>
                                <p style="color: white; margin: 5px 0 0 0; font-size: 16px; font-weight: 600;">${currentDate}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    ${receiptSection}
                    ${notesSection}

                    <table style="width: 100%; margin: 30px 0;">
                      <tr>
                        <td style="text-align: center;">
                          <a href="${supabaseUrl.replace('https://', 'https://www.')}/agency/financials"
                             style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                            Ver Estado Financiero
                          </a>
                        </td>
                      </tr>
                    </table>

                    <div style="margin-top: 30px; padding: 20px; background-color: #f9fafb; border-left: 4px solid #10b981; border-radius: 6px;">
                      <p style="color: #059669; margin: 0 0 10px 0; font-weight: 600;">ℹ️ Información Importante</p>
                      <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">
                        El pago puede tardar de 1 a 3 días hábiles en reflejarse en tu cuenta, dependiendo del método de pago utilizado.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 14px;">
                      Si tienes alguna pregunta, contáctanos en
                    </p>
                    <p style="margin: 0 0 15px 0;">
                      <a href="mailto:${adminEmail}" style="color: #7c3aed; text-decoration: none; font-weight: 600;">${adminEmail}</a>
                    </p>
                    <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                      © ${new Date().getFullYear()} ToursRed. Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    console.log("📧 Enviando email a agencia:", agencyEmail);

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": adminSettings.smtp_api_key,
      },
      body: JSON.stringify({
        sender: {
          name: "ToursRed",
          email: "noreply@toursred.com",
        },
        to: [
          {
            email: agencyEmail,
            name: agencyName,
          },
          {
            email: adminEmail,
            name: "Admin ToursRed",
          }
        ],
        subject: `💸 Pago Procesado - ${formattedAmount}`,
        htmlContent: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("❌ Error enviando email:", errorText);
      throw new Error(`Error al enviar email: ${errorText}`);
    }

    console.log("✅ Email enviado exitosamente");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email de confirmación enviado exitosamente"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("❌ Error en send-payout-confirmation:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Error al enviar confirmación de pago"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
