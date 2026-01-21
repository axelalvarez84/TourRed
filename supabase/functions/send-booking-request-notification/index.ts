import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BookingRequestNotificationRequest {
  booking_id: string;
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

    const { booking_id }: BookingRequestNotificationRequest = await req.json();

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "El ID de reserva es requerido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        tour:tours(*),
        traveler:users!bookings_user_id_fkey(id, first_name, last_name, email, phone_number),
        agency:agencies(*)
      `)
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "No se encontró la reserva" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const [emailSettingsResult] = await Promise.all([
      supabase.from("email_settings").select("*").maybeSingle(),
    ]);

    if (emailSettingsResult.error || !emailSettingsResult.data || !emailSettingsResult.data.smtp_api_key) {
      console.error("Email settings not configured:", emailSettingsResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Configuración de email no disponible"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailSettings = emailSettingsResult.data;

    const bookingDate = new Date(booking.booking_date).toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const agencyEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          h1 { margin: 0; font-size: 24px; }
          h2 { color: #2563eb; font-size: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Nueva Solicitud de Reserva</h1>
          </div>
          <div class="content">
            <p>Estimado/a ${booking.agency.agency_name},</p>

            <p>Has recibido una nueva solicitud de reserva que requiere tu aprobación.</p>

            <div class="info-box">
              <h2>Detalles de la Reserva</h2>
              <p><strong>Tour:</strong> ${booking.tour.name}</p>
              <p><strong>ID de Reserva:</strong> ${booking.id}</p>
              <p><strong>Fecha del Tour:</strong> ${bookingDate}</p>
              <p><strong>Número de Viajeros:</strong> ${booking.travelers_count}</p>
              <p><strong>Monto Total:</strong> $${booking.total_price?.toLocaleString() || '0'} MXN</p>
            </div>

            <div class="info-box">
              <h2>Información del Viajero</h2>
              <p><strong>Nombre:</strong> ${booking.traveler.first_name} ${booking.traveler.last_name}</p>
              <p><strong>Email:</strong> ${booking.traveler.email}</p>
              ${booking.traveler.phone_number ? `<p><strong>Teléfono:</strong> ${booking.traveler.phone_number}</p>` : ''}
            </div>

            <p style="text-align: center; margin-top: 30px;">
              <a href="${supabaseUrl.replace('//', '//www.')}/agency/bookings" class="button">
                Ver en Dashboard
              </a>
            </p>

            <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
              Por favor, revisa la solicitud y apruébala o recházala lo antes posible.
              El viajero recibirá una notificación con tu decisión.
            </p>
          </div>
          <div class="footer">
            <p>Este es un correo automático de ToursRed. Por favor, no respondas a este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': emailSettings.smtp_api_key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: emailSettings.smtp_from_name || 'ToursRed',
          email: emailSettings.smtp_from_email
        },
        to: [
          {
            email: booking.agency.contact_email,
            name: booking.agency.agency_name
          }
        ],
        subject: `Nueva Solicitud de Reserva - ${booking.tour.name}`,
        htmlContent: agencyEmailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Error sending agency email:', errorText);
      throw new Error(`Failed to send agency email: ${errorText}`);
    }

    console.log(`✅ Email de solicitud enviado a la agencia ${booking.agency.agency_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notificación enviada exitosamente"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error sending booking request notification:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error al enviar la notificación"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
