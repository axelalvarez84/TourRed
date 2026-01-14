import { createClient } from 'npm:@supabase/supabase-js@2.39.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface MapboxFeature {
  id: string;
  text: string;
  place_name: string;
  place_type: string[];
  center: [number, number];
  context?: Array<{
    id: string;
    text: string;
  }>;
}

interface MapboxGeocodingResponse {
  type: string;
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
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const proximityLng = url.searchParams.get('lng');
    const proximityLat = url.searchParams.get('lat');
    const limit = parseInt(url.searchParams.get('limit') || '8');

    console.log('🔍 Search locations request:', { query, proximityLng, proximityLat, limit });

    if (!query || query.trim().length < 2) {
      console.log('⚠️ Query too short, returning empty results');
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

    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseAnonKey,
      hasMapboxToken: !!mapboxToken,
      mapboxTokenLength: mapboxToken?.length || 0,
    });

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const suggestions: any[] = [];

    // First, search featured POIs (monuments, metro stations, etc.)
    console.log('🌟 Searching featured POIs...');
    const { data: poiResults, error: poiError } = await supabase
      .rpc('search_featured_pois', {
        search_query: query,
        limit_results: limit,
      });

    if (poiError) {
      console.error('❌ POI search error:', poiError);
    } else {
      console.log('✅ Featured POI results found:', poiResults?.length || 0);
    }

    // Add featured POI results
    if (!poiError && poiResults && poiResults.length > 0) {
      suggestions.push(
        ...poiResults.map((poi: any) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          city: poi.city,
          state: poi.state,
          place_type: poi.category,
          coordinates: {
            lat: poi.latitude,
            lng: poi.longitude,
          },
          source: 'featured_poi',
        }))
      );
      console.log('📍 Added featured POI suggestions:', suggestions.length);
    }

    // Second, search local database for existing departure locations
    console.log('🗄️ Searching departure locations...');
    const { data: localResults, error: localError } = await supabase
      .rpc('get_departure_location_suggestions', {
        search_text: query,
        limit_results: Math.min(limit - suggestions.length, 5),
      });

    if (localError) {
      console.error('❌ Local search error:', localError);
    } else {
      console.log('✅ Local results found:', localResults?.length || 0);
    }

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
      console.log('📍 Total suggestions after local search:', suggestions.length);
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

    // Otherwise, supplement with Mapbox suggestions using Geocoding API v5
    if (mapboxToken) {
      console.log('🗺️ Calling Mapbox Geocoding API...');
      try {
        // Build base URL with proximity if available
        let baseUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}`;

        if (proximityLng && proximityLat) {
          baseUrl += `&proximity=${proximityLng},${proximityLat}`;
        }

        // First try: Search for POIs only (landmarks, monuments, stations, etc.)
        const poiUrl = `${baseUrl}&types=poi&language=es&limit=${limit - suggestions.length}`;
        console.log('📡 Trying POI search first...');

        let mapboxResponse = await fetch(poiUrl);
        let mapboxData: any = null;

        if (mapboxResponse.ok) {
          mapboxData = await mapboxResponse.json();
          console.log('✅ POI search results:', mapboxData.features?.length || 0);
        }

        // If no POI results, try broader search
        if (!mapboxData?.features || mapboxData.features.length === 0) {
          console.log('📡 No POIs found, trying broader search...');
          const broadUrl = `${baseUrl}&types=poi,place,address,locality&language=es&limit=${limit - suggestions.length}`;
          mapboxResponse = await fetch(broadUrl);

          if (mapboxResponse.ok) {
            mapboxData = await mapboxResponse.json();
            console.log('✅ Broad search results:', mapboxData.features?.length || 0);
          }
        }

        if (mapboxData?.features && mapboxData.features.length > 0) {
          suggestions.push(
            ...mapboxData.features.map((feature: any) => {
              const placeType = feature.place_type?.[0] || 'place';
              const city = feature.context?.find((c: any) => c.id.startsWith('place.'))?.text || '';
              const state = feature.context?.find((c: any) => c.id.startsWith('region.'))?.text || '';

              console.log('📍 Feature:', {
                name: feature.text,
                type: placeType,
                id: feature.id,
              });

              return {
                mapbox_id: feature.id,
                name: feature.text,
                address: feature.place_name,
                city,
                state,
                place_type: placeType,
                coordinates: {
                  lng: feature.center[0],
                  lat: feature.center[1],
                },
                source: 'mapbox',
              };
            })
          );
          console.log('📍 Total suggestions after Mapbox:', suggestions.length);
        } else {
          const errorText = await mapboxResponse.text();
          console.error('❌ Mapbox API error:', mapboxResponse.status, errorText);
        }
      } catch (mapboxError) {
        console.error('❌ Mapbox suggestion error:', mapboxError);
        // Continue with just local results
      }
    } else {
      console.warn('⚠️ MAPBOX_SECRET_TOKEN not configured, skipping Mapbox API call');
    }

    const finalSuggestions = suggestions.slice(0, limit);
    console.log('✅ Returning suggestions:', finalSuggestions.length);

    return new Response(
      JSON.stringify({ suggestions: finalSuggestions }),
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