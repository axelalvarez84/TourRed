import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    const {
      tour_id,
      new_start_date,
      new_end_date,
      reason
    } = await req.json();

    if (!tour_id || !new_start_date || !new_end_date || !reason) {
      throw new Error("Missing required fields");
    }

    // Validar que el reason tenga al menos 20 caracteres
    if (reason.trim().length < 20) {
      throw new Error("El motivo debe tener al menos 20 caracteres");
    }

    // Obtener información del tour y verificar que pertenece a la agencia del usuario
    const { data: tour, error: tourError } = await supabase
      .from("tours")
      .select("*, agency:agencies!tours_agency_id_fkey(id, user_id, name)")
      .eq("id", tour_id)
      .single();

    if (tourError || !tour) {
      throw new Error("Tour no encontrado");
    }

    if (tour.agency.user_id !== user.id) {
      throw new Error("No tienes permiso para reagendar este tour");
    }

    // Validar que el tour no haya iniciado ya
    const tourStartDate = new Date(tour.start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tourStartDate <= today) {
      throw new Error("No se puede reagendar un tour que ya inició");
    }

    // Validar que quedan al menos 48 horas para el inicio
    const now = new Date();
    const hoursUntilStart = (tourStartDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilStart < 48) {
      throw new Error(`Deben quedar al menos 48 horas para reagendar un tour. Quedan ${Math.round(hoursUntilStart)} horas.`);
    }

    // Validar que la nueva fecha sea al menos 4 días en el futuro
    const newStartDate = new Date(new_start_date);
    const daysUntilNewStart = (newStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilNewStart < 4) {
      throw new Error("La nueva fecha debe ser al menos 4 días en el futuro");
    }

    // Verificar que no haya un reagendamiento activo para este tour
    const { data: existingReschedule } = await supabase
      .from("tour_reschedules")
      .select("id")
      .eq("tour_id", tour_id)
      .eq("status", "pending_responses")
      .maybeSingle();

    if (existingReschedule) {
      throw new Error("Ya existe un reagendamiento activo para este tour");
    }

    // Obtener todas las reservas activas del tour (confirmed o pending con aprobación)
    const { data: activeBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("*, user:users!bookings_user_id_fkey(id, first_name, last_name, email)")
      .eq("tour_id", tour_id)
      .in("status", ["confirmed", "pending"])
      .eq("is_no_show", false)
      .neq("cancellation_type", "no_show");

    if (bookingsError) {
      throw new Error("Error al obtener reservas");
    }

    if (!activeBookings || activeBookings.length === 0) {
      throw new Error("No hay reservas activas para este tour");
    }

    // Calcular fecha límite para respuestas (96 horas = 4 días)
    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + 96);

    // Crear el registro de reagendamiento
    const { data: reschedule, error: rescheduleError } = await supabase
      .from("tour_reschedules")
      .insert({
        tour_id: tour_id,
        agency_id: tour.agency_id,
        original_start_date: tour.start_date,
        original_end_date: tour.end_date,
        new_start_date: new_start_date,
        new_end_date: new_end_date,
        reason: reason.trim(),
        created_by: user.id,
        affected_bookings_count: activeBookings.length,
        response_deadline: responseDeadline.toISOString()
      })
      .select()
      .single();

    if (rescheduleError || !reschedule) {
      throw new Error("Error al crear el reagendamiento");
    }

    // Crear respuestas pendientes para cada reserva y enviar notificaciones
    let notificationsSent = 0;
    let emailsSent = 0;

    for (const booking of activeBookings) {
      // Crear registro de respuesta
      const { error: responseError } = await supabase
        .from("booking_reschedule_responses")
        .insert({
          tour_reschedule_id: reschedule.id,
          booking_id: booking.id,
          user_id: booking.user_id,
          response: "pending"
        });

      if (responseError) {
        console.error("Error creating response record:", responseError);
        continue;
      }

      // Actualizar booking
      await supabase
        .from("bookings")
        .update({
          has_pending_reschedule: true,
          original_booking_date: booking.booking_date
        })
        .eq("id", booking.id);

      // Crear notificación in-app
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: booking.user_id,
          type: "tour_rescheduled",
          title: "Tour Reagendado - Respuesta Requerida",
          message: `El tour "${tour.name}" ha sido reagendado. Por favor revisa y responde antes del ${responseDeadline.toLocaleDateString('es-MX')}.`,
          data: {
            booking_id: booking.id,
            tour_id: tour_id,
            tour_reschedule_id: reschedule.id,
            original_date: tour.start_date,
            new_date: new_start_date,
            deadline: responseDeadline.toISOString()
          }
        });

      if (!notifError) {
        notificationsSent++;

        // Actualizar flag de notificación enviada
        await supabase
          .from("booking_reschedule_responses")
          .update({ notification_sent: true })
          .eq("booking_id", booking.id)
          .eq("tour_reschedule_id", reschedule.id);
      }

      // Enviar email de notificación
      try {
        const { error: emailError } = await supabase.functions.invoke("send-tour-reschedule-notification", {
          body: {
            booking_id: booking.id,
            tour_reschedule_id: reschedule.id
          }
        });

        if (!emailError) {
          emailsSent++;

          // Actualizar flag de email enviado
          await supabase
            .from("booking_reschedule_responses")
            .update({ email_sent: true })
            .eq("booking_id", booking.id)
            .eq("tour_reschedule_id", reschedule.id);
        }
      } catch (emailErr) {
        console.error("Error sending email:", emailErr);
      }
    }

    // Actualizar el tour con las nuevas fechas
    await supabase
      .from("tours")
      .update({
        start_date: new_start_date,
        end_date: new_end_date
      })
      .eq("id", tour_id);

    return new Response(
      JSON.stringify({
        success: true,
        reschedule_id: reschedule.id,
        affected_bookings: activeBookings.length,
        notifications_sent: notificationsSent,
        emails_sent: emailsSent,
        response_deadline: responseDeadline.toISOString(),
        message: `Reagendamiento creado exitosamente. ${activeBookings.length} viajeros han sido notificados.`
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error: any) {
    console.error("Error in process-tour-reschedule:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Error al procesar el reagendamiento"
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
