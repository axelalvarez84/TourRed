import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, MapPin, Calendar, Tag, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import SearchBox from '../components/SearchBox';
import TourCard from '../components/TourCard';
import { Tour, SearchFilters } from '../types';
import { getTours, supabase } from '../lib/supabase';

const TourCatalogPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleFilters, setVisibleFilters] = useState(false);
  const [popularDestinations, setPopularDestinations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const initialFilters: SearchFilters = {
    destination: searchParams.get('destination') || '',
    category: searchParams.get('category') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
    agency: searchParams.get('agency') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    petFriendly: searchParams.get('petFriendly') || '',
    departurePoint: searchParams.get('departurePoint') || '',
    lat: searchParams.get('lat') || '',
    lng: searchParams.get('lng') || '',
    radius: searchParams.get('radius') || '',
    locationName: searchParams.get('locationName') || '',
  };

  const hasGeoSearch = !!(initialFilters.lat && initialFilters.lng);

  const toggleFilters = () => {
    setVisibleFilters(!visibleFilters);
  };

  useEffect(() => {
    const fetchTours = async () => {
      try {
        setIsLoading(true);
        setError('');

        if (hasGeoSearch) {
          console.log('🌍 Buscando tours por proximidad:', {
            lat: initialFilters.lat,
            lng: initialFilters.lng,
            radius: initialFilters.radius,
          });

          const { data, error } = await supabase.rpc('search_tours_by_departure_radius', {
            search_lat: parseFloat(initialFilters.lat!),
            search_lng: parseFloat(initialFilters.lng!),
            radius_km: parseFloat(initialFilters.radius || '5'),
            filter_category: initialFilters.category ? [initialFilters.category] : null,
            filter_destination: initialFilters.destination || null,
            min_price: initialFilters.minPrice ? parseFloat(initialFilters.minPrice) : null,
            max_price: initialFilters.maxPrice ? parseFloat(initialFilters.maxPrice) : null,
            limit_results: 100,
          });

          if (error) {
            console.error('❌ Error en búsqueda por proximidad:', error);
            throw new Error(error.message);
          }

          console.log('✅ Tours encontrados por proximidad:', data);

          const transformedTours = data?.map((row: any) => ({
            id: row.tour_id,
            name: row.tour_name,
            description: row.tour_description,
            price: row.tour_price,
            category: row.tour_category,
            destination: row.tour_destination,
            image_url: row.tour_image_url,
            is_featured: row.tour_is_featured,
            start_date: row.tour_start_date,
            end_date: row.tour_end_date,
            agency_id: row.agency_id,
            agencies: {
              id: row.agency_id,
              name: row.agency_name,
            },
            distance_meters: row.distance_meters,
            nearest_departure_location: row.nearest_departure_location,
            nearest_departure_address: row.nearest_departure_address,
            all_departure_locations: row.all_departure_locations,
          })) || [];

          setTours(transformedTours);
        } else {
          console.log('🔍 Cargando tours desde la BD con filtros:', initialFilters);

          const { data, error } = await getTours({
            destination: initialFilters.destination || null,
            category: initialFilters.category || null,
            startDate: initialFilters.startDate || null,
            endDate: initialFilters.endDate || null,
            agency: initialFilters.agency || null,
            minPrice: initialFilters.minPrice || null,
            maxPrice: initialFilters.maxPrice || null,
            petFriendly: initialFilters.petFriendly || null,
            departurePoint: initialFilters.departurePoint || null,
          });

          if (error) {
            console.error('❌ Error cargando tours:', error);
            throw new Error(error.message);
          }

          console.log('✅ Tours cargados desde BD:', data);
          setTours(data || []);
        }
      } catch (err: any) {
        console.error('❌ Error en fetchTours:', err);
        setError(err.message || 'Error al cargar los tours');
        setTours([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTours();
  }, [searchParams]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('tour_categories')
          .select('id, name, slug')
          .eq('is_active', true)
          .order('name');

        if (error) {
          console.error('❌ Error cargando categorías:', error);
          return;
        }

        if (data) {
          setCategories(data);
        }
      } catch (err: any) {
        console.error('❌ Error en fetchCategories:', err);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchPopularDestinations = async () => {
      try {
        console.log('🌍 Cargando destinos populares...');

        // Get destinations with tour counts using a simpler query
        const { data: destinations, error } = await supabase
          .from('destinations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) {
          console.error('❌ Error cargando destinos:', error);
          return;
        }

        if (!destinations || destinations.length === 0) {
          console.log('📭 No hay destinos');
          return;
        }

        // Get tour counts for each destination
        const destinationsWithCounts = await Promise.all(
          destinations.map(async (dest) => {
            const { count, error: countError } = await supabase
              .from('tour_destinations')
              .select('*', { count: 'exact', head: true })
              .eq('destination_id', dest.id);

            return {
              id: dest.id,
              name: dest.name,
              tour_count: countError ? 0 : (count || 0)
            };
          })
        );

        // Filter and sort destinations with tours
        const processedDestinations = destinationsWithCounts
          .filter(dest => dest.tour_count > 0)
          .sort((a, b) => b.tour_count - a.tour_count)
          .slice(0, 4);

        console.log('✅ Destinos populares procesados:', processedDestinations);
        setPopularDestinations(processedDestinations);

      } catch (err: any) {
        console.error('❌ Error en fetchPopularDestinations:', err);
      }
    };

    fetchPopularDestinations();
  }, []);

  // No client-side filtering needed - database already handles all filters correctly
  const filteredTours = tours;

  return (
    <div className="bg-blue-50 min-h-screen py-8">
      <div className="container-custom">
        <nav className="flex mb-4" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            <li className="inline-flex items-center">
              <Link to="/" className="text-gray-500 hover:text-primary-600">
                Inicio
              </Link>
            </li>
            <li>
              <div className="flex items-center">
                <ChevronRight className="h-4 w-4 text-gray-400" />
                <span className="ml-1 text-gray-500">Tours</span>
              </div>
            </li>
            <li aria-current="page">
              <div className="flex items-center">
                <ChevronRight className="h-4 w-4 text-gray-400" />
                <span className="ml-1 font-medium text-gray-900">Tours Nacionales</span>
              </div>
            </li>
          </ol>
        </nav>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold">Tours Nacionales</h1>
          <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold">
            Destinos en México
          </span>
        </div>
        
        <div className="lg:hidden mb-6">
          <button
            onClick={toggleFilters}
            className="flex items-center w-full justify-between bg-white p-4 rounded-lg shadow-sm text-gray-900"
          >
            <div className="flex items-center">
              <Filter className="h-5 w-5 text-primary-600 mr-2" />
              <span className="font-medium">Filtros</span>
            </div>
            {visibleFilters ? (
              <ChevronUp className="h-5 w-5 text-gray-600" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-600" />
            )}
          </button>

          {visibleFilters && (
            <div className="mt-4">
              <SearchBox initialFilters={initialFilters} />
            </div>
          )}
        </div>
        
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="hidden lg:block w-full lg:w-1/3 xl:w-1/4">
            <SearchBox initialFilters={initialFilters} />
            
            <div className="bg-white rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4 text-gray-900">Categorías Populares</h3>
              <div className="space-y-2">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <a
                      key={category.id}
                      href={`/tours?category=${category.slug}`}
                      className="flex items-center text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      <span>{category.name}</span>
                    </a>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm text-center py-4">
                    Cargando categorías...
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4 text-gray-900">Destinos Populares</h3>
              <div className="space-y-2">
                {popularDestinations.length > 0 ? (
                  popularDestinations.map((destination) => (
                    <a
                      key={destination.id}
                      href={`/tours?destination=${encodeURIComponent(destination.name)}`}
                      className="flex items-center justify-between text-gray-700 hover:text-primary-600 transition-colors"
                    >
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2" />
                        <span>{destination.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {destination.tour_count} {destination.tour_count === 1 ? 'tour' : 'tours'}
                      </span>
                    </a>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm text-center py-4">
                    No hay destinos disponibles aún
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4 text-gray-900">Cuándo Ir</h3>
              <div className="space-y-2">
                <a
                  href="/tours?startDate=2025-06-01&endDate=2025-08-31"
                  className="flex items-center text-gray-700 hover:text-primary-600 transition-colors"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  <span>Verano 2025</span>
                </a>
                <a
                  href="/tours?startDate=2025-09-01&endDate=2025-11-30"
                  className="flex items-center text-gray-700 hover:text-primary-600 transition-colors"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  <span>Otoño 2025</span>
                </a>
                <a
                  href="/tours?startDate=2025-12-01&endDate=2026-02-28"
                  className="flex items-center text-gray-700 hover:text-primary-600 transition-colors"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  <span>Invierno 2025/2026</span>
                </a>
              </div>
            </div>
          </div>
          
          <div className="w-full lg:w-2/3 xl:w-3/4">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              </div>
            ) : error ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-error-600 mb-4 font-semibold">Error: {error}</p>
                <p className="text-gray-600 mb-6">
                  No se pudieron cargar los tours desde la base de datos.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="btn btn-primary"
                >
                  Reintentar
                </button>
              </div>
            ) : filteredTours.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-xl mb-4 text-gray-900 font-semibold">
                  {tours.length === 0
                    ? 'No hay tours disponibles'
                    : 'No se encontraron tours que coincidan con tus criterios'
                  }
                </p>
                <p className="text-gray-600 mb-6">
                  {tours.length === 0
                    ? 'Las agencias aún no han publicado tours. ¡Vuelve pronto!'
                    : 'Intenta ajustar tus filtros o buscar algo diferente.'
                  }
                </p>
                <a href="/tours" className="btn btn-primary">
                  Ver Todos los Tours
                </a>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-gray-600">
                    {filteredTours.length === 1
                      ? 'Encontrado 1 tour'
                      : `Encontrados ${filteredTours.length} tours`
                    }
                    {hasGeoSearch && initialFilters.locationName &&
                      ` cerca de "${initialFilters.locationName}"`
                    }
                    {initialFilters.destination && ` para "${initialFilters.destination}"`}
                    {initialFilters.category && ` en ${initialFilters.category}`}
                  </p>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600 mr-2">Ordenar por:</span>
                    <select className="border border-gray-300 rounded-md text-sm p-1 text-gray-900 bg-white">
                      <option value="recommended">Recomendados</option>
                      <option value="price-low">Precio: Menor a Mayor</option>
                      <option value="price-high">Precio: Mayor a Menor</option>
                      <option value="rating">Mejor Calificados</option>
                      <option value="newest">Más Recientes</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredTours.map((tour) => (
                    <TourCard key={tour.id} tour={tour} showDistance={hasGeoSearch} />
                  ))}
                </div>
                
                {/* Pagination placeholder */}
                {filteredTours.length >= 10 && (
                  <div className="mt-8 flex justify-center">
                    <div className="bg-white rounded-lg shadow-md p-4">
                      <p className="text-gray-600 text-sm">
                        Mostrando {filteredTours.length} tours.
                        {tours.length > filteredTours.length &&
                          ` (${tours.length - filteredTours.length} filtrados)`
                        }
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourCatalogPage;