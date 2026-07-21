import type { Config, Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context): Promise<Response | void> => {
  const url = new URL(request.url);

  // Only handle /tours/{slug} paths
  const match = url.pathname.match(/^\/tours\/([^/]+)$/);
  if (!match) {
    return context.next();
  }

  const slug = decodeURIComponent(match[1]);

  // Skip UUIDs — handled by _redirects
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  if (isUuid) {
    return context.next();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return context.next();
  }

  try {
    const apiUrl = `${supabaseUrl}/rest/v1/rpc/resolve_tour_slug?p_old_slug=${encodeURIComponent(slug)}`;
    const response = await fetch(apiUrl, {
      headers: {
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return context.next();
    }

    const data = await response.json();

    if (data && data.length > 0 && data[0].current_slug) {
      const newSlug = data[0].current_slug;
      if (newSlug !== slug) {
        const redirectUrl = `${url.origin}/tours/${newSlug}`;
        return new Response(null, {
          status: 301,
          headers: {
            "Location": redirectUrl,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
  } catch (err) {
    console.error("tour-slug-redirect error:", err);
  }

  return context.next();
};

export const config: Config = {
  path: "/tours/*",
};
