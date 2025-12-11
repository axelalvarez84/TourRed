import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ContactFormData {
  name: string;
  email: string;
  message: string;
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

    const { name, email, message }: ContactFormData = await req.json();

    if (!name || !email || !message) {
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
        JSON.stringify({ error: "Error al obtener configuraci\u00f3n de email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const transporter = nodemailer.createTransport({
      host: emailSettings.smtp_host,
      port: emailSettings.smtp_port,
      secure: false,
      auth: {
        user: emailSettings.smtp_user,
        pass: emailSettings.smtp_password,
      },
    });

    const textContent = `
Has recibido un nuevo mensaje desde el formulario de contacto de ToursRed:

Nombre: ${name}
Email: ${email}

Mensaje:
${message}

---
Este mensaje fue enviado desde el formulario de contacto de ToursRed.
    `;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #1e40af; }
    .message-box { background-color: white; padding: 15px; border-left: 4px solid #1e40af; margin-top: 10px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nuevo Mensaje de Contacto</h1>
    </div>
    <div class="content">
      <p>Has recibido un nuevo mensaje desde el formulario de contacto de ToursRed:</p>
      
      <div class="field">
        <span class="label">Nombre:</span> ${name}
      </div>
      
      <div class="field">
        <span class="label">Email:</span> <a href="mailto:${email}">${email}</a>
      </div>
      
      <div class="field">
        <span class="label">Mensaje:</span>
        <div class="message-box">
          ${message.replace(/\n/g, "<br>")}
        </div>
      </div>
    </div>
    <div class="footer">
      <p>Este mensaje fue enviado desde el formulario de contacto de ToursRed.</p>
    </div>
  </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `\"ToursRed\" <${emailSettings.smtp_user}@smtp2go.com>`,
      to: emailSettings.contact_email,
      replyTo: email,
      subject: `Nuevo mensaje de contacto de ${name}`,
      text: textContent,
      html: htmlContent,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Email enviado correctamente" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: "Error al enviar el email", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});