import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BookingConfirmationRequest {
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

    const { booking_id }: BookingConfirmationRequest = await req.json();

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

    const [emailSettingsResult, platformSettingsResult] = await Promise.all([
      supabase.from("email_settings").select("*").maybeSingle(),
      supabase.from("platform_settings").select("*").maybeSingle()
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

    if (platformSettingsResult.error || !platformSettingsResult.data) {
      console.error("Platform settings not configured:", platformSettingsResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Configuración de plataforma no disponible"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailSettings = emailSettingsResult.data;
    const platformSettings = platformSettingsResult.data;

    const totalPrice = booking.total_price;
    const depositAmount = booking.deposit_amount;
    const depositPercentage = booking.tour.deposit_percentage;
    const serviceChargePercentage = platformSettings.service_charge_percentage;
    const agencyCommissionPercentage = platformSettings.agency_commission_percentage;
    const serviceCharge = booking.service_charge || (totalPrice * (serviceChargePercentage / 100));
    const userPayment = depositAmount + serviceCharge;
    const remainingAmount = totalPrice - depositAmount;

    const agencyCommission = totalPrice * (agencyCommissionPercentage / 100);
    const agencyReceives = depositAmount - agencyCommission;

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const formatCurrency = (amount: number) => {
      return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    console.log("Sending booking confirmation emails for booking:", booking_id);

    const travelerEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #b8dfe6; padding: 30px 20px; text-align: center; }
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; }
    .title { font-size: 24px; font-weight: bold; color: #1e40af; margin-bottom: 20px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; color: #1e40af; margin-bottom: 10px; font-size: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; }
    .highlight { background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
    .total-box { background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://www.toursred.com/logo.png" alt="ToursRed Logo" class="logo" />
      <h1 style="margin: 0; color: #1e40af;">¡Reserva Confirmada!</h1>
    </div>
    <div class="content">
      <div class="title">¡Tu reserva ha sido confirmada!</div>

      <p>Estimado/a ${booking.traveler.first_name} ${booking.traveler.last_name},</p>

      <p>Tu pago ha sido procesado exitosamente. A continuación encontrarás los detalles de tu reserva:</p>

      <div class="section">
        <div class="section-title">📍 Detalles del Tour</div>
        <div class="info-row">
          <span class="info-label">Tour:</span>
          <span class="info-value">${booking.tour.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Destino:</span>
          <span class="info-value">${booking.tour.destination}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha de inicio:</span>
          <span class="info-value">${formatDate(booking.tour.start_date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha de finalización:</span>
          <span class="info-value">${formatDate(booking.tour.end_date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Número de viajeros:</span>
          <span class="info-value">${booking.travelers_count}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Desglose de Pagos</div>
        <div class="info-row">
          <span class="info-label">Precio total del tour:</span>
          <span class="info-value">${formatCurrency(totalPrice)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Anticipo (${depositPercentage}%):</span>
          <span class="info-value">${formatCurrency(depositAmount)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cargo por uso de plataforma (${serviceChargePercentage}%):</span>
          <span class="info-value">${formatCurrency(serviceCharge)}</span>
        </div>
        <div class="total-box">
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
            <span>Total pagado:</span>
            <span style="color: #059669;">${formatCurrency(userPayment)}</span>
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">Monto restante a pagar a la agencia:</span>
          <span class="info-value" style="color: #dc2626;">${formatCurrency(remainingAmount)}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">🏢 Información de Contacto de la Agencia</div>
        <div class="info-row">
          <span class="info-label">Agencia:</span>
          <span class="info-value">${booking.agency.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${booking.agency.contact_email}</span>
        </div>
        ${booking.agency.contact_phone ? `
        <div class="info-row">
          <span class="info-label">Teléfono:</span>
          <span class="info-value">${booking.agency.contact_phone}</span>
        </div>
        ` : ''}
      </div>

      <div class="highlight">
        <strong>Importante:</strong> El saldo restante de ${formatCurrency(remainingAmount)} debe ser pagado directamente a la agencia según las condiciones acordadas. Por favor, contacta a la agencia para coordinar los detalles del pago y el viaje.
      </div>

      <p style="margin-top: 30px;">¡Esperamos que tengas un viaje inolvidable!</p>
      <p><strong>El equipo de ToursRed</strong></p>
    </div>
    <div class="footer">
      <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
    </div>
  </div>
</body>
</html>
    `;

    const agencyEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #b8dfe6; padding: 30px 20px; text-align: center; }
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; }
    .title { font-size: 24px; font-weight: bold; color: #1e40af; margin-bottom: 20px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; color: #1e40af; margin-bottom: 10px; font-size: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; }
    .highlight { background-color: #dcfce7; padding: 15px; border-left: 4px solid #16a34a; margin: 20px 0; }
    .total-box { background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://www.toursred.com/logo.png" alt="ToursRed Logo" class="logo" />
      <h1 style="margin: 0; color: #1e40af;">Nueva Reserva Confirmada</h1>
    </div>
    <div class="content">
      <div class="title">¡Has recibido una nueva reserva!</div>

      <p>Estimado/a ${booking.agency.name},</p>

      <p>Te informamos que se ha confirmado una nueva reserva para uno de tus tours:</p>

      <div class="section">
        <div class="section-title">📍 Detalles del Tour</div>
        <div class="info-row">
          <span class="info-label">Tour:</span>
          <span class="info-value">${booking.tour.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Destino:</span>
          <span class="info-value">${booking.tour.destination}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha de inicio:</span>
          <span class="info-value">${formatDate(booking.tour.start_date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha de finalización:</span>
          <span class="info-value">${formatDate(booking.tour.end_date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Número de viajeros:</span>
          <span class="info-value">${booking.travelers_count}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Información Financiera</div>
        <div class="info-row">
          <span class="info-label">Precio total del tour:</span>
          <span class="info-value">${formatCurrency(totalPrice)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Anticipo pagado por el viajero (${depositPercentage}%):</span>
          <span class="info-value">${formatCurrency(depositAmount)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Comisión de plataforma (${agencyCommissionPercentage}% del total):</span>
          <span class="info-value" style="color: #dc2626;">-${formatCurrency(agencyCommission)}</span>
        </div>
        <div class="total-box">
          <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold;">
            <span>Monto a depositar a tu cuenta:</span>
            <span style="color: #059669;">${formatCurrency(agencyReceives)}</span>
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">Monto restante que el viajero pagará directamente:</span>
          <span class="info-value">${formatCurrency(remainingAmount)}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">👤 Información de Contacto del Viajero</div>
        <div class="info-row">
          <span class="info-label">Nombre:</span>
          <span class="info-value">${booking.traveler.first_name} ${booking.traveler.last_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${booking.traveler.email}</span>
        </div>
        ${booking.traveler.phone_number ? `
        <div class="info-row">
          <span class="info-label">Teléfono:</span>
          <span class="info-value">${booking.traveler.phone_number}</span>
        </div>
        ` : ''}
      </div>

      <div class="highlight">
        <strong>Próximos pasos:</strong><br>
        • El monto de ${formatCurrency(agencyReceives)} será depositado en tu cuenta en los próximos 2-3 días hábiles.<br>
        • El viajero debe pagar el saldo restante de ${formatCurrency(remainingAmount)} directamente a ti según tus políticas.<br>
        • Por favor, contacta al viajero para coordinar los detalles finales del tour.
      </div>

      <p style="margin-top: 30px;"><strong>El equipo de ToursRed</strong></p>
    </div>
    <div class="footer">
      <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
    </div>
  </div>
</body>
</html>
    `;

    const adminEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #b8dfe6; padding: 30px 20px; text-align: center; }
    .logo { max-width: 200px; height: auto; margin-bottom: 10px; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; }
    .title { font-size: 24px; font-weight: bold; color: #1e40af; margin-bottom: 20px; }
    .section { margin-bottom: 25px; }
    .section-title { font-weight: bold; color: #1e40af; margin-bottom: 10px; font-size: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; }
    .highlight { background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://www.toursred.com/logo.png" alt="ToursRed Logo" class="logo" />
      <h1 style="margin: 0; color: #1e40af;">Resumen de Nueva Reserva</h1>
    </div>
    <div class="content">
      <div class="title">Resumen de Reserva Confirmada</div>

      <p>Se ha procesado una nueva reserva en la plataforma:</p>

      <div class="section">
        <div class="section-title">📍 Detalles del Tour</div>
        <div class="info-row">
          <span class="info-label">Tour:</span>
          <span class="info-value">${booking.tour.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Destino:</span>
          <span class="info-value">${booking.tour.destination}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Costo del tour:</span>
          <span class="info-value">${formatCurrency(totalPrice)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Porcentaje de anticipo:</span>
          <span class="info-value">${depositPercentage}%</span>
        </div>
        <div class="info-row">
          <span class="info-label">Número de viajeros:</span>
          <span class="info-value">${booking.travelers_count}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Información Financiera</div>
        <div class="info-row">
          <span class="info-label">Monto cobrado al usuario:</span>
          <span class="info-value">${formatCurrency(userPayment)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">- Anticipo:</span>
          <span class="info-value">${formatCurrency(depositAmount)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">- Cargo por plataforma (${serviceChargePercentage}%):</span>
          <span class="info-value">${formatCurrency(serviceCharge)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Comisión descontada a la agencia (${agencyCommissionPercentage}%):</span>
          <span class="info-value" style="color: #16a34a;">${formatCurrency(agencyCommission)}</span>
        </div>
        <div class="highlight">
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
            <span>Ingresos netos de la plataforma:</span>
            <span style="color: #059669;">${formatCurrency(agencyCommission + serviceCharge)}</span>
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">Monto a depositar a la agencia:</span>
          <span class="info-value">${formatCurrency(agencyReceives)}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">👤 Información del Viajero</div>
        <div class="info-row">
          <span class="info-label">Nombre:</span>
          <span class="info-value">${booking.traveler.first_name} ${booking.traveler.last_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${booking.traveler.email}</span>
        </div>
        ${booking.traveler.phone_number ? `
        <div class="info-row">
          <span class="info-label">Teléfono:</span>
          <span class="info-value">${booking.traveler.phone_number}</span>
        </div>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">🏢 Información de la Agencia</div>
        <div class="info-row">
          <span class="info-label">Agencia:</span>
          <span class="info-value">${booking.agency.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${booking.agency.contact_email}</span>
        </div>
        ${booking.agency.contact_phone ? `
        <div class="info-row">
          <span class="info-label">Teléfono:</span>
          <span class="info-value">${booking.agency.contact_phone}</span>
        </div>
        ` : ''}
        ${booking.agency.cuenta_clabe ? `
        <div class="info-row">
          <span class="info-label">Cuenta CLABE:</span>
          <span class="info-value">${booking.agency.cuenta_clabe}</span>
        </div>
        ` : ''}
        ${booking.agency.banco ? `
        <div class="info-row">
          <span class="info-label">Banco:</span>
          <span class="info-value">${booking.agency.banco}</span>
        </div>
        ` : ''}
        ${booking.agency.titular_cuenta ? `
        <div class="info-row">
          <span class="info-label">Titular:</span>
          <span class="info-value">${booking.agency.titular_cuenta}</span>
        </div>
        ` : ''}
      </div>

      <p style="margin-top: 30px;"><strong>Sistema de ToursRed</strong></p>
    </div>
    <div class="footer">
      <p>Este es un mensaje automático del sistema.</p>
    </div>
  </div>
</body>
</html>
    `;

    const emails = [
      {
        to: booking.traveler.email,
        subject: `¡Reserva Confirmada! - ${booking.tour.name}`,
        html: travelerEmailHtml,
        recipient: "viajero"
      },
      {
        to: booking.agency.contact_email,
        subject: `Nueva Reserva Confirmada - ${booking.tour.name}`,
        html: agencyEmailHtml,
        recipient: "agencia"
      },
      {
        to: "contacto@toursred.com",
        subject: `Resumen de Reserva - ${booking.tour.name}`,
        html: adminEmailHtml,
        recipient: "admin"
      }
    ];

    const emailResults = [];

    for (const email of emails) {
      const emailPayload = {
        api_key: emailSettings.smtp_api_key,
        to: [email.to],
        sender: "no-reply@toursred.com",
        subject: email.subject,
        html_body: email.html,
      };

      console.log(`Sending email to ${email.recipient}:`, email.to);

      const response = await fetch("https://api.smtp2go.com/v3/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      const result = await response.json();

      if (!response.ok || result.data?.error) {
        console.error(`Error sending email to ${email.recipient}:`, result);
        emailResults.push({ recipient: email.recipient, success: false, error: result });
      } else {
        console.log(`Email sent successfully to ${email.recipient}`);
        emailResults.push({ recipient: email.recipient, success: true });
      }
    }

    const allSuccess = emailResults.every(r => r.success);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message: allSuccess
          ? "Todos los emails de confirmación fueron enviados exitosamente"
          : "Algunos emails no pudieron ser enviados",
        results: emailResults
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in booking confirmation:", error);
    return new Response(
      JSON.stringify({
        error: "Error al procesar la confirmación de reserva",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});