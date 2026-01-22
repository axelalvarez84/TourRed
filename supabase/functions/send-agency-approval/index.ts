import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ApprovalData {
  email: string;
  firstName: string;
  agencyName: string;
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

    const { email, firstName, agencyName }: ApprovalData = await req.json();

    if (!email || !firstName || !agencyName) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .maybeSingle();

    if (settingsError || !emailSettings) {
      console.error("Error fetching email settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Error al obtener configuración de email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!emailSettings.smtp_api_key) {
      console.error("SMTP API key not configured");
      return new Response(
        JSON.stringify({ error: "API key de SMTP no configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const textContent = `
¡Felicidades ${firstName}!

Tu agencia "${agencyName}" ha sido aprobada exitosamente en ToursRed.

A partir de ahora puedes:
✓ Publicar tus tours y experiencias
✓ Recibir reservas de viajeros
✓ Gestionar tus bookings desde el panel de control
✓ Configurar tus tarifas y disponibilidad
✓ Recibir pagos de los clientes

PRÓXIMOS PASOS:

1. Completa tu Perfil de Agencia
   - Agrega una descripción atractiva de tu empresa
   - Sube tu logo y fotos representativas
   - Completa tu información de contacto

2. Crea tu Primer Tour
   - Ve a "Mis Tours" en tu panel de control
   - Haz clic en "Crear Nuevo Tour"
   - Agrega fotos, descripción, precio y disponibilidad

3. Configura tus Métodos de Pago
   - Revisa tu información bancaria en tu perfil
   - Asegúrate de que tu CLABE esté correcta

4. Promociona tus Tours
   - Comparte el enlace de tu perfil
   - Invita a tus clientes actuales
   - Aprovecha las redes sociales

IMPORTANTE:
- Los pagos se procesarán automáticamente a través de la plataforma
- Recibirás tus ganancias después de cada tour completado
- Mantén actualizada tu disponibilidad para evitar problemas

¿Tienes alguna duda?
Estamos aquí para ayudarte: contacto@toursred.com

¡Bienvenido oficialmente a la familia ToursRed!
Estamos emocionados de trabajar contigo.

Saludos,
Equipo ToursRed
    `;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; text-align: center; }
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
    .content { background-color: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; }
    .success-box { background-color: #d1fae5; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0; border-radius: 6px; }
    .success-box h2 { color: #10b981; margin-top: 0; font-size: 24px; }
    .benefits-box { background-color: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #e5e7eb; }
    .benefits-box ul { margin: 10px 0; padding-left: 20px; }
    .benefits-box li { padding: 8px 0; color: #374151; }
    .steps-section { margin: 25px 0; }
    .step { background-color: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #1e40af; }
    .step h3 { color: #1e40af; margin-top: 0; font-size: 18px; }
    .step p { color: #6b7280; margin: 5px 0; }
    .important-box { background-color: #fef3c7; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 6px; }
    .important-box h3 { color: #f59e0b; margin-top: 0; }
    .important-box ul { margin: 10px 0; padding-left: 20px; }
    .important-box li { padding: 5px 0; }
    .button { display: inline-block; padding: 15px 30px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: bold; }
    .button:hover { background-color: #1e3a8a; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; margin-top: 20px; }
    .emoji { font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://huzsedewwzjywcpbkjkm.supabase.co/storage/v1/object/public/images/email-logo.png" alt="ToursRed Logo" class="logo" />
      <h1 style="margin: 10px 0;">¡Tu Agencia ha sido Aprobada!</h1>
      <p style="margin: 0; font-size: 16px; opacity: 0.9;">Ya puedes comenzar a publicar tus tours</p>
    </div>

    <div class="content">
      <div class="success-box">
        <h2><span class="emoji">🎉</span> ¡Felicidades ${firstName}!</h2>
        <p style="font-size: 16px; margin: 10px 0;">Tu agencia <strong>${agencyName}</strong> ha sido validada y aprobada exitosamente en ToursRed.</p>
      </div>

      <div class="benefits-box">
        <h3 style="color: #1e40af; margin-top: 0;">A partir de ahora puedes:</h3>
        <ul>
          <li>✅ Publicar tus tours y experiencias</li>
          <li>✅ Recibir reservas de viajeros de toda la plataforma</li>
          <li>✅ Gestionar tus bookings desde el panel de control</li>
          <li>✅ Configurar tus tarifas y disponibilidad</li>
          <li>✅ Recibir pagos automáticos de los clientes</li>
        </ul>
      </div>

      <div class="steps-section">
        <h2 style="color: #1e40af; text-align: center;">Próximos Pasos</h2>

        <div class="step">
          <h3>1. Completa tu Perfil de Agencia</h3>
          <p>• Agrega una descripción atractiva de tu empresa</p>
          <p>• Sube tu logo y fotos representativas</p>
          <p>• Completa tu información de contacto</p>
        </div>

        <div class="step">
          <h3>2. Crea tu Primer Tour</h3>
          <p>• Ve a "Mis Tours" en tu panel de control</p>
          <p>• Haz clic en "Crear Nuevo Tour"</p>
          <p>• Agrega fotos, descripción, precio y disponibilidad</p>
        </div>

        <div class="step">
          <h3>3. Configura tus Métodos de Pago</h3>
          <p>• Revisa tu información bancaria en tu perfil</p>
          <p>• Asegúrate de que tu CLABE esté correcta para recibir pagos</p>
        </div>

        <div class="step">
          <h3>4. Promociona tus Tours</h3>
          <p>• Comparte el enlace de tu perfil público</p>
          <p>• Invita a tus clientes actuales a reservar en línea</p>
          <p>• Aprovecha las redes sociales para difundir tus tours</p>
        </div>
      </div>

      <div class="important-box">
        <h3>⚠️ Importante</h3>
        <ul>
          <li>Los pagos se procesarán automáticamente a través de la plataforma</li>
          <li>Recibirás tus ganancias después de cada tour completado</li>
          <li>Mantén actualizada tu disponibilidad para evitar problemas con las reservas</li>
          <li>Responde rápido a las consultas de los viajeros para mejorar tu reputación</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://www.toursred.com/dashboard" class="button">Ir a Mi Panel de Control</a>
      </div>

      <p style="text-align: center; color: #6b7280; margin-top: 30px;">
        ¿Tienes alguna duda? Estamos aquí para ayudarte:<br>
        <a href="mailto:contacto@toursred.com" style="color: #1e40af;">contacto@toursred.com</a>
      </p>

      <p style="text-align: center; margin-top: 30px; font-size: 18px; color: #1e40af;">
        <strong>¡Bienvenido oficialmente a la familia ToursRed!</strong><br>
        <span style="font-size: 14px; color: #6b7280;">Estamos emocionados de trabajar contigo.</span>
      </p>
    </div>

    <div class="footer">
      <p><strong>Equipo ToursRed</strong></p>
      <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
      <p>Para soporte, contacta a: contacto@toursred.com</p>
    </div>
  </div>
</body>
</html>
    `;

    const emailPayload = {
      api_key: emailSettings.smtp_api_key,
      to: [email],
      sender: "no-reply@toursred.com",
      subject: `🎉 ¡Tu agencia ${agencyName} ha sido aprobada!`,
      text_body: textContent,
      html_body: htmlContent,
    };

    console.log("Sending agency approval email via SMTP2GO API...");

    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok || result.data?.error) {
      console.error("SMTP2GO API Error:", result);
      throw new Error(result.data?.error || `SMTP2GO API Error: ${response.status}`);
    }

    console.log("Approval email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, message: "Email de aprobación enviado correctamente" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending approval email:", error);
    return new Response(
      JSON.stringify({ error: "Error al enviar el email de aprobación", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});