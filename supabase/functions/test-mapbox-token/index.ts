const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const mapboxToken = Deno.env.get('MAPBOX_SECRET_TOKEN');
    
    console.log('🔑 Mapbox Token Check:', {
      hasToken: !!mapboxToken,
      tokenLength: mapboxToken?.length || 0,
      tokenPrefix: mapboxToken?.substring(0, 10) || 'N/A',
    });

    if (!mapboxToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'MAPBOX_SECRET_TOKEN no está configurado en los secrets de Supabase',
          instructions: 'Ve a tu dashboard de Supabase > Project Settings > Edge Functions > Secrets y agrega MAPBOX_SECRET_TOKEN',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Test the token with a simple request
    const testQuery = 'Ciudad de Mexico';
    const mapboxUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(testQuery)}&access_token=${mapboxToken}&country=MX&language=es&limit=3`;
    
    console.log('📡 Testing Mapbox API with query:', testQuery);
    
    const response = await fetch(mapboxUrl);
    const responseText = await response.text();
    
    console.log('📥 Mapbox Response Status:', response.status);
    console.log('📄 Response Preview:', responseText.substring(0, 200));

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      parsedData = { raw: responseText };
    }

    if (response.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          message: '✅ Token de Mapbox funciona correctamente',
          tokenInfo: {
            hasToken: true,
            tokenLength: mapboxToken.length,
            tokenPrefix: mapboxToken.substring(0, 10) + '...',
          },
          testResult: {
            status: response.status,
            statusText: response.statusText,
            suggestionsCount: parsedData.suggestions?.length || 0,
            firstSuggestion: parsedData.suggestions?.[0]?.name || null,
          },
          fullResponse: parsedData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El token de Mapbox no funcionó correctamente',
          tokenInfo: {
            hasToken: true,
            tokenLength: mapboxToken.length,
            tokenPrefix: mapboxToken.substring(0, 10) + '...',
          },
          apiError: {
            status: response.status,
            statusText: response.statusText,
            errorDetails: parsedData,
          },
          possibleReasons: [
            'El token es inválido o ha expirado',
            'El token no tiene permisos para la API de Search',
            'Estás usando el token público en lugar del secreto',
            'La cuota de la API se ha agotado',
          ],
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('❌ Test error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
