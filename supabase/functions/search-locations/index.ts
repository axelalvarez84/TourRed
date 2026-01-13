import { createClient } from 'npm:@supabase/supabase-js@2.39.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface MapboxSuggestion {
  mapbox_id: string;
  name: string;
  name_preferred?: string;
  place_formatted: string;
  place_type: string;
  context?: {
    place?: { name: string };
    region?: { name: string };
  };
  coordinates: {
    longitude: number;
    latitude: number;
  };
}

interface MapboxSuggestResponse {
  suggestions: MapboxSuggestion[];
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
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const proximityLng = url.searchParams.get('lng');
    const proximityLat = url.searchParams.get('lat');
    const limit = parseInt(url.searchParams.get('limit') || '8');

    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const mapboxToken = Deno.env.get('MAPBOX_SECRET_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // First, search local database for existing locations
    const { data: localResults, error: localError } = await supabase
      .rpc('get_departure_location_suggestions', {
        search_text: query,
        limit_results: Math.min(limit, 5),
      });

    const suggestions: any[] = [];

    // Add local results
    if (!localError && localResults) {
      suggestions.push(
        ...localResults.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          city: loc.city,
          state: loc.state,
          place_type: loc.place_type,
          tour_count: loc.tour_count,
          source: 'local',
        }))
      );
    }

    // If we have enough local results, return them
    if (suggestions.length >= limit) {
      return new Response(
        JSON.stringify({ suggestions: suggestions.slice(0, limit) }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Otherwise, supplement with Mapbox suggestions
    if (mapboxToken) {
      try {
        let mapboxUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(query)}&access_token=${mapboxToken}&country=MX&types=poi,address,place,neighborhood&language=es&limit=${limit - suggestions.length}`;
        
        // Add proximity bias if coordinates provided
        if (proximityLng && proximityLat) {
          mapboxUrl += `&proximity=${proximityLng},${proximityLat}`;
        }

        const mapboxResponse = await fetch(mapboxUrl);
        
        if (mapboxResponse.ok) {
          const mapboxData: MapboxSuggestResponse = await mapboxResponse.json();
          
          if (mapboxData.suggestions) {
            suggestions.push(
              ...mapboxData.suggestions.map((s: MapboxSuggestion) => ({
                mapbox_id: s.mapbox_id,
                name: s.name_preferred || s.name,
                address: s.place_formatted,
                city: s.context?.place?.name || '',
                state: s.context?.region?.name || '',
                place_type: s.place_type,
                coordinates: {
                  lng: s.coordinates.longitude,
                  lat: s.coordinates.latitude,
                },
                source: 'mapbox',
              }))
            );
          }
        }
      } catch (mapboxError) {
        console.error('Mapbox suggestion error:', mapboxError);
        // Continue with just local results
      }
    }

    return new Response(
      JSON.stringify({ suggestions: suggestions.slice(0, limit) }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Search locations error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        suggestions: [],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
