import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

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
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
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
      <img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgogIDwhLS0gUmVkIGxvY2F0aW9uIHBpbiBiYWNrZ3JvdW5kIC0tPgogIDxwYXRoIGQ9Ik0xMDAgMTBDNzguNSAxMCA2MS4yNSAyNy4yNSA2MS4yNSA0OC43NUM2MS4yNSA3Ny41IDEwMCAxNDAgMTAwIDE0MEMxMDAgMTQwIDEzOC43NSA3Ny41IDEzOC43NSA0OC43NUMxMzguNzUgMjcuMjUgMTIxLjUgMTAgMTAwIDEwWiIgZmlsbD0iI0U1MzkzNSIvPgogIAogIDwhLS0gQWlycGxhbmUgaWNvbiAtLT4KICA8cGF0aCBkPSJNMTI1IDU1TDEwNSA3NUw2NSA2MEw1NSA3MEw4NSA4NUw2NSAxMDVMNTAgMTAwTDQ1IDEwNUw2MCAxMTVMNzAgMTMwTDc1IDEyNUw3MCAxMTBMOTAgOTBMMTA1IDEyMEwxMTUgMTEwTDEwMCA3MEwxMjAgNTBDMTIzLjc1IDQ2LjI1IDEzMCA0Ni4yNSAxMzMuNzUgNTBDMTM3LjUgNTMuNzUgMTM3LjUgNjAgMTMzLjc1IDYzLjc1TDEyNSA1NVoiIGZpbGw9IndoaXRlIi8+CiAgCiAgPCEtLSBQYWxtIHRyZWUgaWNvbiAtLT4KICA8cGF0aCBkPSJNMTAwIDEyMEMxMDAgMTIwIDk1IDExMCA5MCAxMDVDODUgMTAwIDgwIDEwMCA4MCAxMDBDODAgMTAwIDg1IDk1IDk1IDEwMEM5NSAxMDAgOTAgOTAgODUgODVDODAgODAgNzUgODAgNzUgODBDNzUgODAgODAgNzUgOTAgODBDOTAgODAgODUgNzAgODAgNjVDNzUgNjAgNzAgNjAgNzAgNjBDNzAgNjAgNzUgNTUgODUgNjBDODUgNjAgODUgNTAgOTAgNTVDOTUgNjAgMTAwIDcwIDEwMCA3MEwxMDUgMTIwTDk1IDEyMEwxMDAgMTIwWiIgZmlsbD0id2hpdGUiLz4KICAKICA8IS0tIFRyaWFuZ2xlIGF0IGJvdHRvbSBvZiBwaW4gLS0+CiAgPHBhdGggZD0iTTEwMCAxNDBMODUgMTIwSDExNUwxMDAgMTQwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+" alt="ToursRed Logo" class="logo" />
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

    const emailPayload = {
      api_key: emailSettings.smtp_api_key,
      to: [emailSettings.contact_email],
      sender: `no-reply@toursred.com`,
      subject: `Nuevo mensaje de contacto de ${name}`,
      text_body: textContent,
      html_body: htmlContent,
      custom_headers: [
        {
          header: "Reply-To",
          value: email
        }
      ]
    };

    console.log("Sending email via SMTP2GO API...");

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

    console.log("Email sent successfully:", result);

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
