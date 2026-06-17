import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GeoResult {
  country?: string;
  country_code?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  is_proxy?: boolean;
  is_hosting?: boolean;
  geo_provider: string;
  error?: string;
}

async function lookupIPInfoLite(ip: string, apiKey: string): Promise<GeoResult> {
  const token = apiKey && apiKey.length > 0 ? `?token=${apiKey}` : "";
  const url = `https://ipinfo.io/${ip}/json${token}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`ipinfo responded ${res.status}`);

  const data = await res.json();

  let latitude: number | undefined;
  let longitude: number | undefined;
  if (data.loc) {
    const [lat, lon] = data.loc.split(",").map(Number);
    if (!isNaN(lat)) latitude = lat;
    if (!isNaN(lon)) longitude = lon;
  }

  return {
    country: data.country_name ?? data.country ?? undefined,
    country_code: data.country ?? undefined,
    city: data.city ?? undefined,
    region: data.region ?? undefined,
    postal_code: data.postal ?? undefined,
    latitude,
    longitude,
    is_proxy: data.privacy?.proxy ?? false,
    is_hosting: data.privacy?.hosting ?? false,
    geo_provider: "ipinfo_lite",
  };
}

function maskIp(ip: string): string {
  if (!ip) return "";
  // IPv4: replace last octet with xxx
  if (ip.includes(".")) {
    const parts = ip.split(".");
    parts[parts.length - 1] = "xxx";
    return parts.join(".");
  }
  // IPv6: replace last two groups with xxx:xxx
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
    const body = await req.json();
    const ip: string = body.ip ?? "";

    if (!ip) {
      return new Response(
        JSON.stringify({ error: "ip is required", geo_provider: "none" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip private/loopback IPs
    const privateRanges = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^::1$/, /^fc/, /^fd/];
    if (privateRanges.some((r) => r.test(ip))) {
      return new Response(
        JSON.stringify({ geo_provider: "none", error: "private_ip", ip_masked: maskIp(ip) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read settings from platform_settings
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("geo_provider, geo_api_key")
      .limit(1)
      .maybeSingle();

    const provider: string = settings?.geo_provider ?? "ipinfo_lite";
    const apiKey: string = settings?.geo_api_key ?? "";

    let geoResult: GeoResult;

    try {
      if (provider === "ipinfo_lite" || provider === "ipinfo_paid") {
        geoResult = await lookupIPInfoLite(ip, apiKey);
        if (provider === "ipinfo_paid") geoResult.geo_provider = "ipinfo_paid";
      } else {
        // Unknown provider — return minimal result
        geoResult = { geo_provider: provider, error: "unsupported_provider" };
      }
    } catch (lookupErr) {
      // Geo lookup failed — never block the caller, return empty geo
      geoResult = {
        geo_provider: provider,
        error: lookupErr instanceof Error ? lookupErr.message : "lookup_failed",
      };
    }

    return new Response(
      JSON.stringify({ ...geoResult, ip_masked: maskIp(ip) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error", geo_provider: "none" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
