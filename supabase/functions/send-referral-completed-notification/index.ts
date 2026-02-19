import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EmailRequest {
  referrerEmail: string;
  referrerName: string;
  referredName: string;
  pointsAwarded: number;
  bookingCode: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { referrerEmail, referrerName, referredName, pointsAwarded, bookingCode }: EmailRequest = await req.json();

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_password, email_from, email_from_name')
      .single();

    if (!settings || !settings.smtp_host) {
      console.log('SMTP not configured, skipping email');
      return new Response(
        JSON.stringify({ success: true, message: 'Email skipped - SMTP not configured' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>¡Referido Completado!</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 40px 30px 40px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">¡Referido Completado!</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 24px;">
                      Hola <strong>${referrerName}</strong>,
                    </p>
                    <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 24px;">
                      ¡Excelentes noticias! <strong>${referredName}</strong> ha completado su primera reserva (${bookingCode}) en ToursRed.
                    </p>
                    <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 24px 0; border-radius: 4px; text-align: center;">
                      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                        Puntos Ganados
                      </p>
                      <p style="margin: 0; color: #065f46; font-size: 36px; font-weight: bold;">
                        +${pointsAwarded.toLocaleString()} puntos
                      </p>
                    </div>
                    <div style="background-color: #eff6ff; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 20px;">
                        <strong>💡 Recuerda:</strong> Los puntos se acumulan siempre, pero solo puedes usarlos si tienes una membresía ToursRed Plus activa.
                      </p>
                    </div>
                    <p style="margin: 24px 0 0 0; color: #374151; font-size: 16px; line-height: 24px;">
                      Inicia sesión en tu cuenta para ver tus puntos acumulados y seguir refiriendo amigos.
                    </p>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${supabaseUrl.replace('.supabase.co', '')}/traveler/points"
                         style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                        Ver Mis Puntos
                      </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 20px;">
                      Gracias por ser parte de ToursRed
                    </p>
                    <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">
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

    const textContent = `
¡Referido Completado!

Hola ${referrerName},

¡Excelentes noticias! ${referredName} ha completado su primera reserva (${bookingCode}) en ToursRed.

PUNTOS GANADOS: +${pointsAwarded.toLocaleString()} puntos

Recuerda: Los puntos se acumulan siempre, pero solo puedes usarlos si tienes una membresía ToursRed Plus activa.

Inicia sesión en tu cuenta para ver tus puntos acumulados y seguir refiriendo amigos.

Gracias por ser parte de ToursRed
© ${new Date().getFullYear()} ToursRed. Todos los derechos reservados.
    `.trim();

    const emailData = {
      from: `${settings.email_from_name} <${settings.email_from}>`,
      to: referrerEmail,
      subject: `¡Has ganado ${pointsAwarded.toLocaleString()} puntos ToursRed por tu referido!`,
      text: textContent,
      html: htmlContent,
    };

    const auth = btoa(`api:${settings.smtp_password}`);

    const response = await fetch(`https://api.mailgun.net/v3/${settings.smtp_user}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(emailData).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mailgun error:', errorText);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Referral completed notification sent successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-referral-completed-notification function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
