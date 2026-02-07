import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InquiryData {
  name: string;
  email: string;
  phone: string;
  destination: string;
  travel_date?: string;
  num_people: number;
  tour_code?: string;
  message?: string;
  source?: string;
  user_id?: string;
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

    const inquiryData: InquiryData = await req.json();
    const { name, email, phone, destination, travel_date, num_people, tour_code, message, source, user_id } = inquiryData;

    if (!name || !email || !phone || !destination || !num_people) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const inquirySource = source || "mega_travel";
    const formattedTourCode = tour_code
      ? (inquirySource === 'mega_travel' ? `MT-${tour_code}` : tour_code)
      : null;
    const isNefertari = inquirySource === 'nefertari_travel';
    const destinationLabel = isNefertari ? 'Nombre del Viaje' : 'Destino de Interes';
    const sourceLabel = isNefertari ? 'Nefertari Travel' : (inquirySource === 'mega_travel' ? 'Mega Travel' : inquirySource);

    // Insert inquiry into database
    const { data: inquiry, error: insertError } = await supabase
      .from("international_tour_inquiries")
      .insert({
        user_id: user_id || null,
        name,
        email,
        phone,
        destination,
        travel_date: travel_date || null,
        num_people,
        tour_code: formattedTourCode,
        message: message || null,
        source: inquirySource,
        status: "pending"
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting inquiry:", insertError);
      return new Response(
        JSON.stringify({ error: "Error al guardar la cotización" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get email settings
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

    // Send email to admin
    const adminTextContent = `
Nueva Cotización de Tour Internacional - ${destination}

Detalles del Viajero:
Nombre: ${name}
Email: ${email}
Teléfono: ${phone}

Detalles del Viaje:
${destinationLabel}: ${destination}
${formattedTourCode ? `Codigo de Viaje: ${formattedTourCode}` : ''}
Fecha Aproximada: ${travel_date || "No especificada"}
Numero de Personas: ${num_people}
Fuente: ${sourceLabel}

Mensaje/Comentarios:
${message || "Sin comentarios adicionales"}

---
Esta cotización fue enviada desde ToursRed.
ID de Cotización: ${inquiry.id}
    `;

    const adminHtmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px 20px; text-align: center; }
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
    .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .section { margin-bottom: 20px; }
    .field { margin-bottom: 12px; padding: 10px; background: white; border-radius: 4px; }
    .label { font-weight: bold; color: #2563eb; display: block; margin-bottom: 4px; }
    .value { color: #1f2937; }
    .message-box { background-color: white; padding: 15px; border-left: 4px solid #f59e0b; margin-top: 10px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .btn { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .badge { display: inline-block; padding: 4px 8px; background-color: #fef3c7; color: #92400e; border-radius: 4px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class=\"container\">
    <div class=\"header\">
      <h1>Nueva Cotización Internacional</h1>
      <p style=\"margin: 0; font-size: 18px;\">${destination}</p>
    </div>
    <div class=\"content\">
      <div class=\"section\">
        <h3 style=\"color: #2563eb; margin-top: 0;\">Información del Viajero</h3>
        <div class=\"field\">
          <span class=\"label\">Nombre Completo:</span>
          <span class=\"value\">${name}</span>
        </div>
        <div class=\"field\">
          <span class=\"label\">Email:</span>
          <span class=\"value\"><a href=\"mailto:${email}\">${email}</a></span>
        </div>
        <div class=\"field\">
          <span class=\"label\">Teléfono:</span>
          <span class=\"value\"><a href=\"tel:${phone}\">${phone}</a></span>
        </div>
      </div>
      
      <div class=\"section\">
        <h3 style=\"color: #2563eb;\">Detalles del Viaje</h3>
        <div class=\"field\">
          <span class=\"label\">${destinationLabel}:</span>
          <span class=\"value\">${destination}</span>
        </div>
        ${formattedTourCode ? `
        <div class=\"field\">
          <span class=\"label\">Código de Viaje:</span>
          <span class=\"value\"><strong style=\"color: #f59e0b; font-size: 16px;\">${formattedTourCode}</strong></span>
        </div>
        ` : ''}
        <div class=\"field\">
          <span class=\"label\">Fecha Aproximada:</span>
          <span class=\"value\">${travel_date || "No especificada"}</span>
        </div>
        <div class=\"field\">
          <span class=\"label\">Número de Personas:</span>
          <span class=\"value\">${num_people}</span>
        </div>
        <div class=\"field\">
          <span class=\"label\">Fuente:</span>
          <span class=\"value\"><span class=\"badge\">${sourceLabel}</span></span>
        </div>
      </div>
      
      ${message ? `
      <div class=\"section\">
        <h3 style=\"color: #2563eb;\">Mensaje/Comentarios</h3>
        <div class=\"message-box\">
          ${message.replace(/\n/g, "<br>")}
        </div>
      </div>
      ` : ''}
      
      <div style=\"text-align: center; margin-top: 30px;\">
        <a href=\"mailto:${email}\" class=\"btn\">Responder al Viajero</a>
      </div>
    </div>
    <div class=\"footer\">
      <p>ID de Cotización: ${inquiry.id}</p>
      <p>Recibida el ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  </div>
</body>
</html>
    `;

    const adminEmailPayload = {
      api_key: emailSettings.smtp_api_key,
      to: [emailSettings.contact_email],
      sender: `no-reply@toursred.com`,
      subject: `Nueva Cotización Internacional - ${destination}`,
      text_body: adminTextContent,
      html_body: adminHtmlContent,
      custom_headers: [
        {
          header: "Reply-To",
          value: email
        }
      ]
    };

    console.log("Sending admin email via SMTP2GO API...");

    const adminResponse = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(adminEmailPayload),
    });

    const adminResult = await adminResponse.json();

    if (!adminResponse.ok || adminResult.data?.error) {
      console.error("SMTP2GO API Error (Admin):", adminResult);
    } else {
      console.log("Admin email sent successfully");
    }

    // Send confirmation email to user
    const userTextContent = `
Hola ${name},

¡Gracias por tu interés en nuestros tours internacionales!

Hemos recibido tu solicitud de cotización para: ${destination}

Resumen de tu solicitud:
- ${destinationLabel}: ${destination}
${formattedTourCode ? `- Codigo de Viaje: ${formattedTourCode}` : ''}
- Fecha aproximada: ${travel_date || "Por definir"}
- Numero de personas: ${num_people}

Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo en un máximo de 24 horas para proporcionarte una cotización personalizada y resolver cualquier duda que tengas.

Mientras tanto, si tienes alguna pregunta urgente, no dudes en responder a este correo.

¡Gracias por elegir ToursRed para tu próxima aventura internacional!

Saludos,
Equipo ToursRed
    `;

    const userHtmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; padding: 30px 20px; text-align: center; }
    .content { background-color: #f9fafb; padding: 30px 20px; border: 1px solid #e5e7eb; }
    .greeting { font-size: 18px; color: #1f2937; margin-bottom: 20px; }
    .info-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
    .info-item { margin: 10px 0; }
    .label { font-weight: 600; color: #2563eb; }
    .highlight { background-color: #dbeafe; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class=\"container\">
    <div class=\"header\">
      <h1>¡Solicitud Recibida!</h1>
    </div>
    <div class=\"content\">
      <div class=\"greeting\">
        Hola <strong>${name}</strong>,
      </div>
      
      <p>¡Gracias por tu interés en nuestros tours internacionales!</p>
      
      <p>Hemos recibido tu solicitud de cotización para <strong>${destination}</strong>.</p>
      
      <div class=\"info-box\">
        <h3 style=\"margin-top: 0; color: #2563eb;\">Resumen de tu Solicitud</h3>
        <div class=\"info-item\">
          <span class=\"label\">${destinationLabel}:</span> ${destination}
        </div>
        ${formattedTourCode ? `
        <div class=\"info-item\">
          <span class=\"label\">Código de Viaje:</span> <strong style=\"color: #f59e0b; font-size: 16px;\">${formattedTourCode}</strong>
        </div>
        ` : ''}
        <div class=\"info-item\">
          <span class=\"label\">Fecha aproximada:</span> ${travel_date || "Por definir"}
        </div>
        <div class=\"info-item\">
          <span class=\"label\">Número de personas:</span> ${num_people}
        </div>
      </div>
      
      <div class=\"highlight\">
        <p style=\"margin: 0; font-size: 16px;\">
          <strong>⏱️ Tiempo de respuesta: Máximo 24 horas</strong>
        </p>
      </div>
      
      <p>Nuestro equipo revisará tu solicitud y se pondrá en contacto contigo para proporcionarte una cotización personalizada y resolver cualquier duda que tengas.</p>
      
      <p>Mientras tanto, si tienes alguna pregunta urgente, no dudes en responder a este correo.</p>
      
      <p style=\"margin-top: 30px;\">
        ¡Gracias por elegir ToursRed para tu próxima aventura internacional!
      </p>
      
      <p style=\"margin-top: 20px; font-weight: 600;\">
        Saludos,<br>
        Equipo ToursRed
      </p>
    </div>
    <div class=\"footer\">
      <p>Este es un correo automático, por favor no respondas directamente.</p>
      <p>Si tienes preguntas, espera nuestro contacto o escribe a ${emailSettings.contact_email}</p>
    </div>
  </div>
</body>
</html>
    `;

    const userEmailPayload = {
      api_key: emailSettings.smtp_api_key,
      to: [email],
      sender: `no-reply@toursred.com`,
      subject: "Hemos recibido tu solicitud de cotización - ToursRed",
      text_body: userTextContent,
      html_body: userHtmlContent,
      custom_headers: [
        {
          header: "Reply-To",
          value: emailSettings.contact_email
        }
      ]
    };

    console.log("Sending user confirmation email via SMTP2GO API...");

    const userResponse = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userEmailPayload),
    });

    const userResult = await userResponse.json();

    if (!userResponse.ok || userResult.data?.error) {
      console.error("SMTP2GO API Error (User):", userResult);
    } else {
      console.log("User confirmation email sent successfully");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Cotización enviada correctamente",
        inquiry_id: inquiry.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing inquiry:", error);
    return new Response(
      JSON.stringify({ error: "Error al procesar la cotización", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});