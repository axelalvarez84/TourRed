import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SessionEventBody {
  event_type: "login" | "logout" | "failed_login";
  user_id?: string;
  email?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  device_fingerprint?: string;
  login_method?: string;
  failure_reason?: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  device_type?: string;
  device_name?: string;
}

function maskIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    parts[parts.length - 1] = "xxx";
    return parts.join(".");
  }
  const parts = ip.split(":");
  if (parts.length >= 4) {
    parts[parts.length - 1] = "xxx";
    parts[parts.length - 2] = "xxx";
  }
  return parts.join(":");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: SessionEventBody = await req.json();
    const {
      event_type,
      user_id,
      email,
      session_id,
      ip_address,
      user_agent,
      device_fingerprint,
      login_method = "email_password",
      failure_reason,
      browser,
      browser_version,
      os,
      os_version,
      device_type,
      device_name,
    } = body;

    if (!event_type) {
      return new Response(
        JSON.stringify({ error: "event_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ipMasked = ip_address ? maskIp(ip_address) : null;

    // Async geo lookup — never blocks session recording
    let geoData: Record<string, unknown> = {};
    if (ip_address) {
      try {
        const geoRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/geo-lookup`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ ip: ip_address }),
            signal: AbortSignal.timeout(4000),
          }
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          geoData = {
            country: geo.country ?? null,
            country_code: geo.country_code ?? null,
            city: geo.city ?? null,
            region: geo.region ?? null,
            postal_code: geo.postal_code ?? null,
            latitude: geo.latitude ?? null,
            longitude: geo.longitude ?? null,
            is_proxy: geo.is_proxy ?? null,
            is_hosting: geo.is_hosting ?? null,
            geo_provider: geo.geo_provider ?? null,
          };
        }
      } catch {
        // geo lookup failed — continue without geo data
      }
    }

    if (event_type === "failed_login") {
      // Insert into failed_login_attempts
      await supabase.from("failed_login_attempts").insert({
        user_id: user_id ?? null,
        email: email ?? null,
        ip_address: ip_address ?? null,
        device_fingerprint: device_fingerprint ?? null,
        failure_reason: failure_reason ?? "unknown",
      });

      // Also write to audit_logs via RPC
      await supabase.rpc("insert_audit_log", {
        p_tenant_type: "system",
        p_actor_id: user_id ?? null,
        p_actor_email: email ?? null,
        p_target_table: "auth",
        p_action: "FAILED_LOGIN",
        p_ip_address: ip_address ?? null,
        p_ip_masked: ipMasked,
        p_user_agent: user_agent ?? null,
        p_session_id: session_id ?? null,
        p_metadata: JSON.stringify({ failure_reason, device_fingerprint, ...geoData }),
      });

      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // login or logout — write to user_sessions
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id required for login/logout events" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event_type === "login") {
      await supabase.from("user_sessions").insert({
        user_id,
        session_id: session_id ?? null,
        ip_address: ip_address ?? null,
        ip_masked: ipMasked,
        user_agent: user_agent ?? null,
        device_fingerprint: device_fingerprint ?? null,
        login_method,
        success: true,
        browser: browser ?? null,
        browser_version: browser_version ?? null,
        os: os ?? null,
        os_version: os_version ?? null,
        device_type: device_type ?? null,
        device_name: device_name ?? null,
        ...geoData,
      });

      await supabase.rpc("insert_audit_log", {
        p_tenant_type: "system",
        p_actor_id: user_id,
        p_actor_email: email ?? null,
        p_target_table: "auth",
        p_action: "LOGIN",
        p_ip_address: ip_address ?? null,
        p_ip_masked: ipMasked,
        p_user_agent: user_agent ?? null,
        p_session_id: session_id ?? null,
        p_metadata: JSON.stringify({ login_method, device_fingerprint, device_type }),
      });
    } else if (event_type === "logout") {
      // Mark matching open session as closed
      const { data: openSession } = await supabase
        .from("user_sessions")
        .select("id")
        .eq("user_id", user_id)
        .is("logout_at", null)
        .order("login_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openSession) {
        await supabase
          .from("user_sessions")
          .update({ logout_at: new Date().toISOString() })
          .eq("id", openSession.id);
      }

      await supabase.rpc("insert_audit_log", {
        p_tenant_type: "system",
        p_actor_id: user_id,
        p_actor_email: email ?? null,
        p_target_table: "auth",
        p_action: "LOGOUT",
        p_ip_address: ip_address ?? null,
        p_ip_masked: ipMasked,
        p_user_agent: user_agent ?? null,
        p_session_id: session_id ?? null,
        p_metadata: null,
      });
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
