import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.39.6';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  booking_id: string;
  cancellation_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { booking_id, cancellation_id }: RequestBody = await req.json();

    const { data: cancellation, error: cancellationError } = await supabase
      .from('booking_cancellations')
      .select(`
        *,
        bookings:booking_id (
          *,
          tours:tour_id (id, name, start_date),
          users:user_id (id, first_name, last_name, email, phone_number),
          agencies:agency_id (id, name, contact_email)
        )
      `)
      .eq('id', cancellation_id)
      .single();

    if (cancellationError || !cancellation) {
      throw new Error('No se encontró la cancelación');
    }

    const booking = (cancellation as any).bookings;
    const tour = booking.tours;
    const user = booking.users;
    const agency = booking.agencies;

    const { data: emailSettings } = await supabase
      .from('email_settings')
      .select('contact_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_api_key')
      .single();

    if (!emailSettings || !emailSettings.smtp_host) {
      throw new Error('SMTP no configurado');
    }

    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('agency_commission_percentage')
      .single();

    const commissionRate = platformSettings?.agency_commission_percentage || 15;

    let policyTitle = '';
    let policyColor = '';
    let policyDescription = '';
    let paymentInfo = '';

    switch (cancellation.cancellation_policy_type) {
      case '100_percent':
        policyTitle = 'Reembolso Completo (15+ días)';
        policyColor = '#10b981';
        policyDescription = 'El viajero canceló con más de 15 días de anticipación y recibió un reembolso del 100% en su ToursRed Cash.';
        paymentInfo = 'No recibirá ningún pago por esta reserva.';
        break;
      case '50_percent':
        policyTitle = 'Reembolso Parcial (7-14 días)';
        policyColor = '#f59e0b';
        policyDescription = 'El viajero canceló entre 7 y 14 días antes del tour. Se reembolsó el 50% del anticipo al viajero.';
        paymentInfo = `<strong>Recibirá $${cancellation.amount_to_agency.toFixed(2)}</strong> (70% del 50% retenido) en su próximo depósito de comisiones.`;
        break;
      case 'no_refund':
        policyTitle = 'Sin Reembolso (1-6 días)';
        policyColor = '#ef4444';
        policyDescription = 'El viajero canceló entre 1 y 6 días antes del tour. No hay reembolso para el viajero.';
        paymentInfo = `<strong>Recibirá $${cancellation.amount_to_agency.toFixed(2)}</strong> (anticipo menos comisión del ${(settings.commission_rate * 100).toFixed(0)}%) en su próximo depósito de comisiones.`;
        break;
      case 'no_show':
        policyTitle = 'Cancelación Tardía - No Show';
        policyColor = '#991b1b';
        policyDescription = 'El viajero canceló con menos de 1 día de anticipación y se marcó como No Show.';
        paymentInfo = `<strong>Recibirá $${cancellation.amount_to_agency.toFixed(2)}</strong> (anticipo menos comisión del ${(settings.commission_rate * 100).toFixed(0)}%) en su próximo depósito de comisiones.`;
        break;
      case 'pending_approval':
        policyTitle = 'Reserva Pendiente Cancelada';
        policyColor = '#6b7280';
        policyDescription = 'El viajero canceló una reserva que aún estaba pendiente de su aprobación. No se había realizado ningún pago.';
        paymentInfo = 'No había pago asociado a esta reserva.';
        break;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notificación de Cancelación</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Cancelación de Reserva</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px;">Un viajero ha cancelado su reserva</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="color: #1f2937; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Estimado equipo de ${agency.name},
              </p>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                Le informamos que se ha cancelado una reserva para uno de sus tours.
              </p>

              <div style="background-color: #f9fafb; border-left: 4px solid ${policyColor}; padding: 20px; margin-bottom: 25px; border-radius: 4px;">
                <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">${policyTitle}</h3>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tour:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${tour.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fecha del tour:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${new Date(tour.start_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Viajero:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${user.first_name} ${user.last_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email del viajero:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${user.email}</td>
                  </tr>
                  ${user.phone_number ? `
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Teléfono:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${user.phone_number}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Cancelado con:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${cancellation.days_before_tour} día(s) de anticipación</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fecha de cancelación:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${new Date(cancellation.cancelled_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                </table>
              </div>

              <div style="background-color: #eff6ff; border: 2px solid #3b82f6; padding: 20px; margin-bottom: 25px; border-radius: 8px;">
                <h3 style="color: #1e40af; margin: 0 0 10px 0; font-size: 16px;">📋 Política Aplicada</h3>
                <p style="color: #1e3a8a; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">
                  ${policyDescription}
                </p>
                <p style="color: #1e3a8a; font-size: 14px; line-height: 1.6; margin: 0;">
                  ${paymentInfo}
                </p>
              </div>

              ${cancellation.cancellation_reason ? `
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; margin-bottom: 25px; border-radius: 8px;">
                <h4 style="color: #374151; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Motivo de cancelación:</h4>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                  "${cancellation.cancellation_reason}"
                </p>
              </div>
              ` : ''}

              ${cancellation.cancellation_policy_type !== 'pending_approval' ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <p style="color: #92400e; font-size: 13px; line-height: 1.6; margin: 0;">
                  <strong>Nota:</strong> El botón "Marcar No Show" ya no aparecerá para esta reserva en su panel de control, ya que el viajero canceló con anticipación.
                </p>
              </div>
              ` : ''}

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 25px 0 0 0;">
                Si tiene alguna pregunta sobre esta cancelación, por favor contáctenos.
              </p>

              <div style="text-align: center; margin-top: 30px;">
                <a href="https://toursred.com/agency/bookings"
                   style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; font-size: 15px;">
                  Ver Mis Reservas
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0;">
                © ${new Date().getFullYear()} ToursRed. Todos los derechos reservados.<br>
                Este es un correo automático, por favor no respondas a este mensaje.
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

    const emailData = {
      from: `ToursRed <${emailSettings.contact_email}>`,
      to: agency.contact_email,
      subject: `Cancelación de Reserva - ${tour.name}`,
      html: emailHtml,
    };

    const apiKey = emailSettings.smtp_api_key || emailSettings.smtp_password;
    const sendEmailResponse = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify({
        sender: emailData.from,
        recipients: [emailData.to],
        subject: emailData.subject,
        html_body: emailData.html,
      }),
    });

    if (!sendEmailResponse.ok) {
      const errorText = await sendEmailResponse.text();
      throw new Error(`Error enviando email: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email enviado a la agencia' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
