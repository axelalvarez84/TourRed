import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Landmark, Building2, Store, Train } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LocationSuggestion {
  id?: string;
  mapbox_id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  place_type: string;
  tour_count?: number;
  source: 'local' | 'mapbox' | 'featured_poi';
  coordinates?: {
    lng: number;
    lat: number;
  };
}

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
  }) => void;
  placeholder?: string;
  className?: string;
}

export default function LocationSearchInput({
  value,
  onChange,
  onLocationSelect,
  placeholder = 'Buscar por ubicación...',
  className = '',
}: LocationSearchInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const isSelectingRef = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Don't search if we're selecting a suggestion
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      return;
    }

    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const fetchSuggestions = async (query: string) => {
    console.log('🔍 Buscando sugerencias para:', query);
    setIsLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let url = `${supabaseUrl}/functions/v1/search-locations?q=${encodeURIComponent(query)}`;

      if (userLocation) {
        url += `&lng=${userLocation.lng}&lat=${userLocation.lat}`;
      }

      console.log('📡 URL de la función:', url);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('📥 Respuesta recibida:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Datos recibidos:', data);
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
        setHighlightedIndex(-1);
      } else {
        const errorText = await response.text();
        console.error('❌ Error en respuesta:', response.status, errorText);
      }
    } catch (error) {
      console.error('❌ Error fetching suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = async (suggestion: LocationSuggestion) => {
    // Mark that we're selecting to prevent triggering search
    isSelectingRef.current = true;
    onChange(suggestion.name);
    setShowSuggestions(false);
    setSuggestions([]);

    console.log('🎯 Selected suggestion:', suggestion);

    // Handle featured POIs (from featured_pois table)
    if (suggestion.source === 'featured_poi' && suggestion.coordinates) {
      console.log('✅ Using featured POI coordinates:', suggestion.coordinates);
      onLocationSelect({
        name: suggestion.name,
        address: suggestion.address,
        coordinates: { lat: suggestion.coordinates.lat, lng: suggestion.coordinates.lng },
      });
      return;
    }

    // Handle local departure locations
    if (suggestion.source === 'local' && suggestion.id) {
      const { data } = await supabase
        .from('departure_locations')
        .select('*')
        .eq('id', suggestion.id)
        .single();

      if (data) {
        const coords = data.location as any;
        const [lng, lat] = coords.coordinates;
        onLocationSelect({
          name: data.name,
          address: data.address,
          coordinates: { lat, lng },
        });
      }
      return;
    }

    // Handle Mapbox results
    if (suggestion.source === 'mapbox' && suggestion.coordinates) {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode-location`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.session.access_token}`,
              },
              body: JSON.stringify({ query: suggestion.address }),
            }
          );

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.location) {
              const coords = result.location.location as any;
              const [lng, lat] = coords.coordinates;
              onLocationSelect({
                name: result.location.name,
                address: result.location.address,
                coordinates: { lat, lng },
              });
            }
          }
        } catch (error) {
          console.error('Error geocoding location:', error);
        }
      } else {
        onLocationSelect({
          name: suggestion.name,
          address: suggestion.address,
          coordinates: { lat: suggestion.coordinates.lat, lng: suggestion.coordinates.lng },
        });
      }
    }
  };

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });

          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN}&language=es`
            );

            if (response.ok) {
              const data = await response.json();
              if (data.features && data.features.length > 0) {
                const place = data.features[0];
                isSelectingRef.current = true;
                onChange(place.text);
                onLocationSelect({
                  name: place.text,
                  address: place.place_name,
                  coordinates: { lat: latitude, lng: longitude },
                });
              }
            }
          } catch (error) {
            console.error('Error reverse geocoding:', error);
          } finally {
            setIsLoading(false);
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          setIsLoading(false);
          alert('No se pudo obtener tu ubicación. Por favor, verifica los permisos del navegador.');
        }
      );
    } else {
      alert('Tu navegador no soporta geolocalización.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const getPlaceIcon = (placeType: string) => {
    const iconClass = "w-5 h-5";

    switch (placeType) {
      case 'monument':
        return <Landmark className={`${iconClass} text-orange-600`} />;
      case 'metro_station':
        return <Train className={`${iconClass} text-blue-600`} />;
      case 'landmark':
        return <Building2 className={`${iconClass} text-purple-600`} />;
      case 'shopping':
      case 'stadium':
        return <Store className={`${iconClass} text-green-600`} />;
      case 'poi':
        return <Landmark className={`${iconClass} text-blue-600`} />;
      case 'address':
        return <MapPin className={`${iconClass} text-gray-500`} />;
      case 'place':
        return <Building2 className={`${iconClass} text-green-600`} />;
      case 'neighborhood':
      case 'locality':
        return <Store className={`${iconClass} text-purple-600`} />;
      default:
        return <MapPin className={`${iconClass} text-gray-400`} />;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>

      <button
        onClick={handleUseCurrentLocation}
        disabled={isLoading}
        className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Navigation className="w-4 h-4" />
        Usar mi ubicación actual
      </button>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={
                suggestion.source === 'local'
                  ? `local-${suggestion.id}`
                  : `mapbox-${suggestion.mapbox_id || index}`
              }
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                highlightedIndex === index ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{getPlaceIcon(suggestion.place_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{suggestion.name}</p>
                    {suggestion.source === 'local' && suggestion.tour_count && suggestion.tour_count > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {suggestion.tour_count} {suggestion.tour_count === 1 ? 'tour' : 'tours'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{suggestion.address}</p>
                  {suggestion.city && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {suggestion.city}
                      {suggestion.state && `, ${suggestion.state}`}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
