import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendGiftCardEmailRequest {
  giftCardId: string;
  sendToRecipient?: boolean;
  sendToPurchaser?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { giftCardId, sendToRecipient = true, sendToPurchaser = true }: SendGiftCardEmailRequest = await req.json();

    if (!giftCardId) {
      return new Response(
        JSON.stringify({ error: "Gift card ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: giftCard, error: giftCardError } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("id", giftCardId)
      .single();

    if (giftCardError || !giftCard) {
      return new Response(
        JSON.stringify({ error: "Gift card not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("smtp_api_key")
      .single();

    if (!emailSettings?.smtp_api_key) {
      throw new Error("Email settings not configured");
    }

    const originUrl = req.headers.get("origin") || "https://toursred.com";
    const redeemUrl = `${originUrl}/gift-card/redeem?code=${giftCard.code}`;

    const results = {
      recipientSent: false,
      purchaserSent: false,
      errors: [] as string[],
    };

    if (sendToRecipient && giftCard.recipient_email) {
      try {
        await sendGiftCardEmail(
          emailSettings.smtp_api_key,
          giftCard,
          giftCard.recipient_email,
          giftCard.recipient_name || "Estimado viajero",
          redeemUrl,
          false
        );
        results.recipientSent = true;
      } catch (error) {
        results.errors.push(`Failed to send to recipient: ${error.message}`);
      }
    }

    if (sendToPurchaser) {
      try {
        await sendGiftCardEmail(
          emailSettings.smtp_api_key,
          giftCard,
          giftCard.purchaser_email,
          giftCard.purchaser_name,
          redeemUrl,
          true
        );
        results.purchaserSent = true;
      } catch (error) {
        results.errors.push(`Failed to send to purchaser: ${error.message}`);
      }
    }

    if (results.recipientSent || results.purchaserSent) {
      await supabase
        .from("gift_cards")
        .update({
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", giftCardId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-gift-card-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function sendGiftCardEmail(
  apiKey: string,
  giftCard: any,
  recipientEmail: string,
  recipientName: string,
  redeemUrl: string,
  isPurchaserCopy: boolean
): Promise<void> {
  const formattedAmount = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(giftCard.amount);

  const expiryDate = new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(giftCard.expires_at));

  const subject = isPurchaserCopy
    ? `Confirmación de tu Tarjeta de Regalo ToursRed - ${formattedAmount}`
    : `¡Has recibido una Tarjeta de Regalo ToursRed! ${formattedAmount}`;

  const greeting = isPurchaserCopy
    ? `Hola ${recipientName},`
    : giftCard.recipient_name
    ? `Hola ${giftCard.recipient_name},`
    : "Hola,";

  const introMessage = isPurchaserCopy
    ? `<p>Gracias por comprar una Tarjeta de Regalo ToursRed de <strong>${formattedAmount}</strong>.</p>`
    : giftCard.personal_message
    ? `<p><strong>${giftCard.purchaser_name}</strong> te ha enviado una Tarjeta de Regalo ToursRed de <strong>${formattedAmount}</strong>.</p>
       <div style="background: #FFF8E6; border-left: 4px solid #F59E0B; padding: 16px; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0; font-style: italic; color: #92400E;">"${giftCard.personal_message}"</p>
         <p style="margin: 8px 0 0 0; font-size: 14px; color: #92400E;">- ${giftCard.purchaser_name}</p>
       </div>`
    : `<p><strong>${giftCard.purchaser_name}</strong> te ha enviado una Tarjeta de Regalo ToursRed de <strong>${formattedAmount}</strong>.</p>`;

  const recipientInfo = isPurchaserCopy && giftCard.recipient_email
    ? `<p style="color: #6B7280; font-size: 14px; margin-top: 20px;">Esta tarjeta de regalo fue enviada a: <strong>${giftCard.recipient_email}</strong></p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #F3F4F6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: bold;">Tarjeta de Regalo ToursRed</h1>
              <p style="color: #FEF3C7; margin: 10px 0 0 0; font-size: 16px;">¡Regala experiencias inolvidables!</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${greeting}
              ${introMessage}

              <!-- Gift Card Display -->
              <div style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border: 3px solid #F59E0B; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                <div style="background: #FFFFFF; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                  <p style="color: #92400E; font-size: 14px; margin: 0 0 10px 0; font-weight: 600;">CÓDIGO DE LA TARJETA</p>
                  <p style="color: #1F2937; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 3px; font-family: 'Courier New', monospace;">${giftCard.code}</p>
                </div>
                <p style="color: #92400E; font-size: 24px; font-weight: bold; margin: 0;">Valor: ${formattedAmount}</p>
              </div>

              <p>Para canjear tu tarjeta de regalo:</p>
              <ol style="color: #4B5563; line-height: 1.6;">
                <li>Haz clic en el botón de abajo o copia el código</li>
                <li>Crea una cuenta en ToursRed (si aún no tienes una)</li>
                <li>El monto se agregará automáticamente a tu ToursRed Cash</li>
                <li>Úsalo para pagar tus reservas de tours</li>
              </ol>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${redeemUrl}" style="display: inline-block; background-color: #F59E0B; color: #FFFFFF; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Canjear Tarjeta de Regalo</a>
              </div>

              ${recipientInfo}

              <div style="background: #FEF3C7; border-radius: 8px; padding: 20px; margin-top: 30px;">
                <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
                  <strong>Importante:</strong> Esta tarjeta de regalo es válida hasta el <strong>${expiryDate}</strong>.
                  El código puede usarse una sola vez y no puede ser canjeado por dinero en efectivo.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
              <p style="margin: 0 0 10px 0; color: #6B7280; font-size: 14px;">¿Tienes preguntas? Contáctanos en:</p>
              <p style="margin: 0; color: #F59E0B; font-size: 14px; font-weight: 600;">soporte@toursred.com</p>
              <p style="margin: 20px 0 0 0; color: #9CA3AF; font-size: 12px;">© 2025 ToursRed. Todos los derechos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textBody = `
${greeting}

${isPurchaserCopy
  ? `Gracias por comprar una Tarjeta de Regalo ToursRed de ${formattedAmount}.`
  : `${giftCard.purchaser_name} te ha enviado una Tarjeta de Regalo ToursRed de ${formattedAmount}.`}

${giftCard.personal_message ? `Mensaje: "${giftCard.personal_message}" - ${giftCard.purchaser_name}` : ""}

CÓDIGO DE LA TARJETA: ${giftCard.code}
Valor: ${formattedAmount}

Para canjear tu tarjeta:
1. Visita: ${redeemUrl}
2. Crea una cuenta en ToursRed (si no tienes una)
3. El monto se agregará a tu ToursRed Cash
4. Úsalo para pagar tus reservas

${recipientInfo ? `Esta tarjeta fue enviada a: ${giftCard.recipient_email}` : ""}

Válida hasta: ${expiryDate}

¿Preguntas? Contáctanos en soporte@toursred.com

© 2025 ToursRed
  `;

  const emailPayload = {
    api_key: apiKey,
    to: [recipientEmail],
    sender: "ToursRed <noreply@toursred.com>",
    subject: subject,
    html_body: htmlBody,
    text_body: textBody,
  };

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`);
  }
}
