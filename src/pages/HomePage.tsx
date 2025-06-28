import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Search, Award, CreditCard, Users } from 'lucide-react';
import SearchBox from '../components/SearchBox';
import CategoryList from '../components/CategoryList';
import FeaturedDestinations from '../components/FeaturedDestinations';
import TourCard from '../components/TourCard';
import StripeCheckout from '../components/StripeCheckout';
import { Tour } from '../types';
import { getTours } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const HomePage: React.FC = () => {
  const [featuredTours, setFeaturedTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchFeaturedTours = async () => {
      try {
        console.log('🔍 Cargando tours destacados desde la BD...');
        
        const { data, error } = await getTours({ limit: 4 });
        
        if (error) {
          console.error('❌ Error cargando tours destacados:', error);
          setFeaturedTours([]);
        } else {
          console.log('✅ Tours destacados cargados:', data);
          setFeaturedTours(data || []);
        }
      } catch (err: any) {
        console.error('❌ Error en fetchFeaturedTours:', err);
        setFeaturedTours([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFeaturedTours();
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gray-900 text-white">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-gray-900/60"></div>
          <img
            src="https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg"
            alt="Fondo de viaje"
            className="w-full h-full object-cover opacity-60"
          />
        </div>
        <div className="relative container-custom py-24 md:py-36">
          <div className="max-w-3xl flex flex-col items-start">
            <img src="/logo.svg" alt="ToursRed Logo" className="h-20 w-20 mb-6" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">
              Descubre Tu Próxima<br />Aventura
            </h1>
            <p className="text-xl md:text-2xl mb-8 animate-fade-in">
              Compara tours de las mejores agencias y encuentra las experiencias perfectas para tu próximo viaje.
            </p>
            <div className="animate-slide-up">
              <SearchBox className="bg-white/90 backdrop-blur-sm" />
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-12 bg-gray-50">
        <div className="container-custom">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">Explora por Categoría</h2>
          <CategoryList />
        </div>
      </section>

      {/* Featured Destinations */}
      <section className="py-12 bg-white">
        <div className="container-custom">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">Destinos Populares</h2>
            <Link to="/tours" className="text-primary-600 hover:text-primary-700 font-medium flex items-center">
              Ver todos <Compass className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <FeaturedDestinations />
        </div>
      </section>

      {/* Featured Tours */}
      <section className="py-12 bg-gray-50">
        <div className="container-custom">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">Tours Destacados</h2>
            <Link to="/tours" className="text-primary-600 hover:text-primary-700 font-medium flex items-center">
              Ver todos <Compass className="ml-1 h-4 w-4" />
            </Link>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
            </div>
          ) : featuredTours.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredTours.map((tour) => (
                <TourCard key={tour.id} tour={tour} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <h3 className="text-xl font-semibold mb-2">¡Próximamente!</h3>
              <p className="text-gray-600 mb-4">
                Las agencias están preparando tours increíbles para ti.
              </p>
              <Link to="/agency-signup" className="btn btn-primary">
                <Users className="mr-2 h-5 w-5" />
                ¿Eres una agencia? Únete ahora
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 bg-white">
        <div className="container-custom">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center">Cómo Funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4 text-primary-600">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">1. Encuentra Tu Tour</h3>
              <p className="text-gray-600">
                Explora nuestra extensa colección de tours de las mejores agencias y encuentra tu opción perfecta.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4 text-primary-600">
                <CreditCard className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">2. Reserva con Depósito</h3>
              <p className="text-gray-600">
                Asegura tu lugar con un pequeño depósito y paga el resto directamente a la agencia después.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4 text-primary-600">
                <Award className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3. Disfruta Tu Viaje</h3>
              <p className="text-gray-600">
                Vive la aventura de tu vida y comparte tu experiencia con nuestra comunidad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Charge Section - Only show to authenticated users */}
      {user && (
        <section className="py-12 bg-primary-50">
          <div className="container-custom">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Cargo por Servicio</h2>
              <p className="text-lg text-gray-600 mb-8">
                Para mantener nuestra plataforma funcionando y brindar el mejor servicio, aplicamos un pequeño cargo por servicio en cada reserva.
              </p>
              <StripeCheckout className="max-w-md mx-auto" />
            </div>
          </div>
        </section>
      )}

      {/* Become a Partner */}
      <section className="py-12 bg-primary-50">
        <div className="container-custom">
          <div className="bg-white rounded-lg shadow-lg p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center">
              <div className="md:w-2/3 mb-6 md:mb-0 md:pr-8">
                <h2 className="text-2xl md:text-3xl font-bold mb-4">¿Eres una Agencia de Viajes?</h2>
                <p className="text-lg text-gray-600 mb-6">
                  Únete a ToursRed y llega a miles de viajeros buscando su próxima aventura. Gestiona tus tours, recibe reservas y haz crecer tu negocio con nosotros.
                </p>
                <Link to="/agency-signup" className="btn btn-primary">
                  <Users className="mr-2 h-5 w-5" />
                  Conviértete en Socio
                </Link>
              </div>
              <div className="md:w-1/3">
                <img
                  src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg"
                  alt="Asociación de agencia de viajes"
                  className="rounded-lg shadow-md"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;