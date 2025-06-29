import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, MapPin, Calendar, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import SearchBox from '../components/SearchBox';
import TourCard from '../components/TourCard';
import { Tour, SearchFilters } from '../types';
import { getTours, supabase } from '../lib/supabase';

const categories = [
  { id: 'adventure', name: 'Aventura' },
  { id: 'nature', name: 'Naturaleza' },
  { id: 'cultural', name: 'Cultural' },
  { id: 'beach', name: 'Playa' },
  { id: 'urban', name: 'Urbano' },
  { id: 'wellness', name: 'Bienestar' },
];

const TourCatalogPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleFilters, setVisibleFilters] = useState(false);
  const [popularDestinations, setPopularDestinations] = useState<any[]>([]);
  
  const initialFilters: SearchFilters = {
    destination: searchParams.get('destination') || '',
    category: searchParams.get('category') || '',
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
  };

  const toggleFilters = () => {
    setVisibleFilters(!visibleFilters);
  };

  useEffect(() => {
    const fetchTours = async () => {
      try {
        setIsLoading(true);
        setError('');
        
        console.log('🔍 Cargando tours desde la BD con filtros:', initialFilters);
        
        const { data, error } = await getTours({
          destination: initialFilters.destination || null,
          category: initialFilters.category || null,
          startDate: initialFilters.startDate || null,
          endDate: initialFilters.endDate || null,
        });
        
        if (error) {
          console.error('❌ Error cargando tours:', error);
          throw new Error(error.message);
        }
        
        console.log('✅ Tours cargados desde BD:', data);
        setTours(data || []);
      } catch (err: any) {
        console.error('❌ Error en fetchTours:', err);
        setError(err.message || 'Error al cargar los tours');
        setTours([]); // Clear tours on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchTours();
  }, [searchParams]);

  useEffect(() => {
    const fetchPopularDestinations = async () => {
      try {
        console.log('🌍 Cargando destinos populares...');
        
        // Get destinations with tour counts
        const { data, error } = await supabase
          .from('destinations')
          .select(`
            id,
            name,
            tour_destinations(
              tours(id)
            )
          `)
          .limit(10);
        
        if (error) {
          console.error('❌ Error cargando destinos populares:', error);
          return;
        }
        
        if (!data || data.length === 0) {
          console.log('📭 No hay destinos populares');
          return;
        }
        
        // Process destinations and count tours
        const processedDestinations = data
          .map(dest => ({
            id: dest.id,
            name: dest.name,
            tour_count: dest.tour_destinations?.length || 0
          }))
          .filter(dest => dest.tour_count > 0) // Only show destinations with tours
          .sort((a, b) => b.tour_count - a.tour_count) // Sort by tour count
          .slice(0, 4); // Take top 4
        
        console.log('✅ Destinos populares procesados:', processedDestinations);
        setPopularDestinations(processedDestinations);
        
      } catch (err: any) {
        console.error('❌ Error en fetchPopularDestinations:', err);
      }
    };

    fetchPopularDestinations();
  }, []);

  // Filter tours based on search params (client-side filtering as backup)
  const filteredTours = tours.filter(tour => {
    let matches = true;
    
    if (initialFilters.destination) {
      matches = matches && tour.destination.toLowerCase().includes(initialFilters.destination.toLowerCase());
    }
    
    if (initialFilters.category) {
      matches = matches && tour.category === initialFilters.category;
    }
    
    if (initialFilters.startDate) {
      matches = matches && new Date(tour.start_date) >= new Date(initialFilters.startDate);
    }
    
    if (initialFilters.endDate) {
      matches = matches && new Date(tour.end_date) <= new Date(initialFilters.endDate);
    }
    
    return matches;
  });

  return (
    <div className="bg-blue-50 min-h-screen py-8">
      <div className="container-custom">
        <h1 className="text-3xl font-bold mb-6">Encuentra Tu Tour Perfecto</h1>
        
        <div className="lg:hidden mb-6">
          <button
            onClick={toggleFilters}
            className="flex items-center w-full justify-between bg-blue-100 p-4 rounded-lg shadow-sm"
          >
            <div className="flex items-center">
              <Filter className="h-5 w-5 text-primary-600 mr-2" />
              <span>Filtros</span>
            </div>
            {visibleFilters ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
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
            
            <div className="bg-blue-100 rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4">Categorías Populares</h3>
              <div className="space-y-2">
                {categories.map((category) => (
                  <a
                    key={category.id}
                    href={`/tours?category=${category.id}`}
                    className="flex items-center text-gray-700 hover:text-primary-600 transition-colors"
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    <span>{category.name}</span>
                  </a>
                ))}
              </div>
            </div>
            
            <div className="bg-blue-100 rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4">Destinos Populares</h3>
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
            
            <div className="bg-blue-100 rounded-lg shadow-md p-4 mt-6">
              <h3 className="font-semibold mb-4">Cuándo Ir</h3>
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
              <div className="bg-blue-100 rounded-lg shadow-md p-6 text-center">
                <p className="text-error-600 mb-4">Error: {error}</p>
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
              <div className="bg-blue-100 rounded-lg shadow-md p-6 text-center">
                <p className="text-xl mb-4">
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
                    {initialFilters.destination && ` para "${initialFilters.destination}"`}
                    {initialFilters.category && ` en ${initialFilters.category}`}
                  </p>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600 mr-2">Ordenar por:</span>
                    <select className="border border-gray-300 rounded-md text-sm p-1">
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
                    <TourCard key={tour.id} tour={tour} />
                  ))}
                </div>
                
                {/* Pagination placeholder */}
                {filteredTours.length >= 10 && (
                  <div className="mt-8 flex justify-center">
                    <div className="bg-blue-100 rounded-lg shadow-md p-4">
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