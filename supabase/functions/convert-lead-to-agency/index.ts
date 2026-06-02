import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConvertLeadPayload {
  leadId: string;
  agencyName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
  rfc: string | null;
  razonSocial: string | null;
  rnt: string | null;
  street: string | null;
  exteriorNumber: string | null;
  interiorNumber: string | null;
  colony: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  password: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the calling user is an active account_executive
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData || userData.role !== "account_executive") {
      return new Response(
        JSON.stringify({ error: "Solo los ejecutivos de cuenta pueden convertir leads" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the executive's record to get name and email for the credentials email
    const { data: execData } = await supabaseAdmin
      .from("account_executives")
      .select("id, first_name, last_name, email, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!execData || !execData.is_active) {
      return new Response(
        JSON.stringify({ error: "Ejecutivo no encontrado o inactivo" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: ConvertLeadPayload = await req.json();
    const {
      leadId,
      agencyName,
      contactFirstName,
      contactLastName,
      contactEmail,
      contactPhone,
      website,
      rfc,
      razonSocial,
      rnt,
      street,
      exteriorNumber,
      interiorNumber,
      colony,
      city,
      state,
      postalCode,
      country,
      password,
    } = payload;

    if (!leadId || !agencyName || !contactEmail || !contactFirstName || !password) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user with admin API — does NOT affect the executive's current session
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: contactEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "agency", first_name: contactFirstName, last_name: contactLastName },
    });

    if (createError || !authData.user) {
      return new Response(
        JSON.stringify({ error: createError?.message || "Error al crear el usuario de la agencia" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // Insert into public.users
    const { error: profileError } = await supabaseAdmin.from("users").insert({
      id: newUserId,
      email: contactEmail,
      first_name: contactFirstName,
      last_name: contactLastName || "",
      role: "agency",
      email_verified: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Error al crear perfil de usuario: " + profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert into agencies
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .insert({
        user_id: newUserId,
        name: agencyName,
        contact_email: contactEmail,
        contact_phone: contactPhone || null,
        website: website || null,
        rfc: rfc || null,
        razon_social: razonSocial || null,
        rnt: rnt || null,
        street: street || null,
        exterior_number: exteriorNumber || null,
        interior_number: interiorNumber || null,
        colony: colony || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        country: country || "México",
        is_active: true,
        account_executive_id: execData.id,
        registered_by_executive: true,
      })
      .select("id")
      .single();

    if (agencyError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from("users").delete().eq("id", newUserId);
      return new Response(
        JSON.stringify({ error: "Error al crear la agencia: " + agencyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update lead status
    await supabaseAdmin.from("agency_leads").update({
      status: "registrado",
      converted_agency_id: agencyData.id,
      converted_at: new Date().toISOString(),
    }).eq("id", leadId);

    // Send credentials email (fire-and-forget — conversion succeeds even if email fails)
    try {
      const executiveName = `${execData.first_name} ${execData.last_name || ""}`.trim();
      await fetch(`${supabaseUrl}/functions/v1/send-agency-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contactEmail,
          contactFirstName,
          contactLastName: contactLastName || "",
          agencyName,
          password,
          executiveEmail: execData.email,
          executiveName,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send agency credentials email:", emailErr);
    }

    return new Response(
      JSON.stringify({ success: true, agencyId: agencyData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in convert-lead-to-agency:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
