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
        bookings!booking_id (
          *,
          tours!tour_id (id, name, start_date),
          users!user_id (id, first_name, last_name, email, phone_number),
          agencies!agency_id (id, name, contact_email)
        )
      `)
      .eq('id', cancellation_id)
      .single();

    if (cancellationError || !cancellation) {
      throw new Error('No se encontró la cancelación');
    }

    const booking = (cancellation as any).bookings;
    if (!booking) throw new Error('No se encontró la reserva');

    const tour = booking.tours;
    if (!tour) throw new Error('No se encontró el tour');

    const user = booking.users;
    if (!user) throw new Error('No se encontró el usuario');

    const agency = booking.agencies;
    if (!agency) throw new Error('No se encontró la agencia');

    const { data: emailSettings } = await supabase
      .from('email_settings')
      .select('contact_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_api_key')
      .single();

    if (!emailSettings || !emailSettings.smtp_host || !emailSettings.contact_email) {
      throw new Error('SMTP o email de administrador no configurado');
    }

    const { data: platformSettings } = await supabase
      .from('platform_settings')
      .select('agency_commission_percentage')
      .single();

    const commissionRate = platformSettings?.agency_commission_percentage || 15;

    let policyTitle = '';
    let policyColor = '';

    switch (cancellation.cancellation_policy_type) {
      case '100_percent':
        policyTitle = 'Reembolso Completo (15+ días)';
        policyColor = '#10b981';
        break;
      case '50_percent':
        policyTitle = 'Reembolso Parcial (7-14 días)';
        policyColor = '#f59e0b';
        break;
      case 'no_refund':
        policyTitle = 'Sin Reembolso (1-6 días)';
        policyColor = '#ef4444';
        break;
      case 'no_show':
        policyTitle = 'Cancelación Tardía - No Show';
        policyColor = '#991b1b';
        break;
      case 'pending_approval':
        policyTitle = 'Reserva Pendiente Cancelada';
        policyColor = '#6b7280';
        break;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Cancelación - Admin</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="700" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

          <tr>
            <td style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">📊 Reporte de Cancelación</h1>
              <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 16px;">Notificación para Administración</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px;">
              <p style="color: #1f2937; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Se ha procesado una nueva cancelación en el sistema.
              </p>

              <div style="background-color: #f9fafb; border-left: 4px solid ${policyColor}; padding: 20px; margin-bottom: 25px; border-radius: 4px;">
                <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">${policyTitle}</h3>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">ID de Cancelación:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 13px; font-family: monospace; text-align: right;">${cancellation.id}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">ID de Reserva:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 13px; font-family: monospace; text-align: right;">${booking.id}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Fecha de cancelación:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${new Date(cancellation.cancelled_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Días antes del tour:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${cancellation.days_before_tour} día(s)</td>
                  </tr>
                </table>
              </div>

              <div style="background-color: #eff6ff; border: 2px solid #3b82f6; padding: 20px; margin-bottom: 25px; border-radius: 8px;">
                <h3 style="color: #1e40af; margin: 0 0 15px 0; font-size: 16px;">👤 Información del Viajero</h3>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px; width: 40%;">Nombre:</td>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px; font-weight: 600; text-align: right;">${user.first_name} ${user.last_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px;">Email:</td>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px; text-align: right;">${user.email}</td>
                  </tr>
                  ${user.phone_number ? `
                  <tr>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px;">Teléfono:</td>
                    <td style="padding: 6px 0; color: #1e3a8a; font-size: 14px; text-align: right;">${user.phone_number}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <div style="background-color: #f0fdf4; border: 2px solid #10b981; padding: 20px; margin-bottom: 25px; border-radius: 8px;">
                <h3 style="color: #065f46; margin: 0 0 15px 0; font-size: 16px;">🏢 Información del Tour y Agencia</h3>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px; width: 40%;">Tour:</td>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px; font-weight: 600; text-align: right;">${tour.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px;">Fecha del tour:</td>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px; text-align: right;">${new Date(tour.start_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px;">Agencia:</td>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px; font-weight: 600; text-align: right;">${agency.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px;">Email agencia:</td>
                    <td style="padding: 6px 0; color: #047857; font-size: 14px; text-align: right;">${agency.contact_email}</td>
                  </tr>
                </table>
              </div>

              <div style="background-color: #fef9c3; border: 2px solid #eab308; padding: 20px; margin-bottom: 25px; border-radius: 8px;">
                <h3 style="color: #713f12; margin: 0 0 15px 0; font-size: 16px;">💰 Desglose Financiero</h3>
                <table width="100%" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #854d0e; font-size: 14px;">Anticipo original:</td>
                    <td style="padding: 8px 0; color: #854d0e; font-size: 14px; font-weight: 600; text-align: right;">$${cancellation.original_deposit_amount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #854d0e; font-size: 14px;">Cargo por servicio original:</td>
                    <td style="padding: 8px 0; color: #854d0e; font-size: 14px; font-weight: 600; text-align: right;">$${cancellation.original_service_charge.toFixed(2)}</td>
                  </tr>
                  <tr style="border-top: 2px solid #eab308;">
                    <td style="padding: 12px 0 8px 0; color: #713f12; font-size: 14px; font-weight: bold;">Reembolsado al viajero (ToursRed Cash):</td>
                    <td style="padding: 12px 0 8px 0; color: #10b981; font-size: 16px; font-weight: bold; text-align: right;">$${cancellation.refund_amount_to_traveler.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #713f12; font-size: 14px; font-weight: bold;">A pagar a la agencia:</td>
                    <td style="padding: 8px 0; color: #3b82f6; font-size: 16px; font-weight: bold; text-align: right;">$${cancellation.amount_to_agency.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #713f12; font-size: 14px; font-weight: bold;">Ganancia de la plataforma:</td>
                    <td style="padding: 8px 0; color: #8b5cf6; font-size: 16px; font-weight: bold; text-align: right;">$${cancellation.amount_to_platform.toFixed(2)}</td>
                  </tr>
                </table>
              </div>

              ${cancellation.cancellation_reason ? `
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; margin-bottom: 25px; border-radius: 8px;">
                <h4 style="color: #374151; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">Motivo de cancelación:</h4>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                  "${cancellation.cancellation_reason}"
                </p>
              </div>
              ` : ''}

              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <p style="color: #991b1b; font-size: 13px; line-height: 1.6; margin: 0;">
                  <strong>Nota importante:</strong> Los cargos por servicio y beneficios de ToursRed+ no son reembolsables ya que fueron cobrados por Stripe al momento de la reserva. ${cancellation.cancellation_policy_type === 'no_show' ? 'Esta cancelación incrementó el contador de No Show del viajero.' : ''}
                </p>
              </div>

              <div style="text-align: center; margin-top: 30px;">
                <a href="https://toursred.com/admin/dashboard"
                   style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; font-size: 15px; margin-right: 10px;">
                  Ver Dashboard
                </a>
                <a href="https://toursred.com/admin/agencies"
                   style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; font-size: 15px;">
                  Gestionar Agencias
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 0;">
                © ${new Date().getFullYear()} ToursRed - Panel de Administración<br>
                Este es un correo automático de sistema.
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
      to: emailSettings.contact_email,
      subject: `[Admin] Cancelación de Reserva - ${tour.name}`,
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
      JSON.stringify({ success: true, message: 'Email enviado al administrador' }),
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
