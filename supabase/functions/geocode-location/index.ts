import { createClient } from 'npm:@supabase/supabase-js@2.39.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GeocodeRequest {
  query: string;
  forceRefresh?: boolean;
}

interface MapboxFeature {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  properties: {
    mapbox_id?: string;
    [key: string]: any;
  };
  text: string;
  place_name: string;
  center: [number, number];
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
}

interface MapboxResponse {
  type: string;
  query: string[];
  features: MapboxFeature[];
  attribution: string;
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mapboxToken = Deno.env.get('MAPBOX_SECRET_TOKEN');

    if (!mapboxToken) {
      throw new Error('MAPBOX_SECRET_TOKEN not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { query, forceRefresh = false }: GeocodeRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cacheData, error: cacheError } = await supabase
        .from('geocoding_cache')
        .select('location_id, mapbox_response')
        .eq('search_query', normalizedQuery)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!cacheError && cacheData?.location_id) {
        // Increment usage count
        await supabase.rpc('increment_geocoding_cache_usage', {
          query_text: normalizedQuery,
        });

        // Fetch full location details
        const { data: locationData, error: locationError } = await supabase
          .from('departure_locations')
          .select('*')
          .eq('id', cacheData.location_id)
          .maybeSingle();

        if (!locationError && locationData) {
          return new Response(
            JSON.stringify({
              success: true,
              cached: true,
              location: locationData,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      }
    }

    // Call Mapbox Geocoding API
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&country=MX&types=poi,address,place,neighborhood,locality&limit=1&language=es`;

    const mapboxResponse = await fetch(mapboxUrl);
    
    if (!mapboxResponse.ok) {
      throw new Error(`Mapbox API error: ${mapboxResponse.status}`);
    }

    const mapboxData: MapboxResponse = await mapboxResponse.json();

    if (!mapboxData.features || mapboxData.features.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No results found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const feature = mapboxData.features[0];
    const [lng, lat] = feature.center;

    // Extract address components from context
    let city = '';
    let state = '';
    let postalCode = '';

    if (feature.context) {
      for (const item of feature.context) {
        if (item.id.startsWith('place.')) {
          city = item.text;
        } else if (item.id.startsWith('region.')) {
          state = item.text;
        } else if (item.id.startsWith('postcode.')) {
          postalCode = item.text;
        }
      }
    }

    // Check if location already exists by mapbox_id or nearby coordinates
    let locationId: string;
    const mapboxId = feature.properties?.mapbox_id || feature.id;

    const { data: existingLocation } = await supabase
      .from('departure_locations')
      .select('id')
      .eq('mapbox_id', mapboxId)
      .maybeSingle();

    if (existingLocation) {
      locationId = existingLocation.id;
      
      // Update location data
      await supabase
        .from('departure_locations')
        .update({
          name: feature.text,
          address: feature.place_name,
          city: city,
          state: state,
          postal_code: postalCode,
          place_type: feature.place_type[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', locationId);
    } else {
      // Insert new location
      const { data: newLocation, error: insertError } = await supabase
        .from('departure_locations')
        .insert({
          name: feature.text,
          location: `POINT(${lng} ${lat})`,
          address: feature.place_name,
          city: city,
          state: state,
          postal_code: postalCode,
          mapbox_id: mapboxId,
          place_type: feature.place_type[0],
          is_active: true,
        })
        .select('id')
        .single();

      if (insertError) {
        throw new Error(`Failed to insert location: ${insertError.message}`);
      }

      locationId = newLocation.id;
    }

    // Update or insert cache
    await supabase
      .from('geocoding_cache')
      .upsert({
        search_query: normalizedQuery,
        location_id: locationId,
        mapbox_response: mapboxData as any,
        usage_count: 1,
        last_used_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

    // Fetch complete location data
    const { data: finalLocation } = await supabase
      .from('departure_locations')
      .select('*')
      .eq('id', locationId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        location: finalLocation,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Geocoding error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
