import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Heart, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';

interface Booking {
  id: string;
  tour_id: string;
  booking_date: string;
  status: string;
  total_price: number;
  tours: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    image_url: string;
    agencies: {
      name: string;
    };
  };
}

interface SavedTour {
  id: string;
  tour_id: string;
  created_at: string;
  tours: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    price: number;
    image_url: string;
    agencies: {
      name: string;
    };
  };
}

const TravelerDashboard: React.FC = () => {
  const { user } = useAuth();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [savedTours, setSavedTours] = useState<SavedTour[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          tours (
            id,
            name,
            destination,
            start_date,
            end_date,
            image_url,
            agencies (name)
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .gte('tours.start_date', today)
        .order('tours.start_date', { ascending: true })
        .limit(5);

      if (bookingsError) throw bookingsError;
      setUpcomingBookings(bookingsData || []);

      const { data: savedData, error: savedError } = await supabase
        .from('saved_tours')
        .select(`
          *,
          tours (
            id,
            name,
            destination,
            start_date,
            end_date,
            price,
            image_url,
            agencies (name)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (savedError) throw savedError;
      setSavedTours(savedData || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const removeSavedTour = async (tourId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('saved_tours')
        .delete()
        .eq('user_id', user.id)
        .eq('tour_id', tourId);

      if (error) throw error;
      setSavedTours(savedTours.filter(st => st.tour_id !== tourId));
    } catch (error) {
      console.error('Error removing saved tour:', error);
      alert('Error al quitar el tour guardado');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Panel del Viajero</h1>

      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold flex items-center">
            <Calendar className="w-6 h-6 mr-2 text-blue-600" />
            Próximas Reservas
          </h2>
          <Link to="/traveler/bookings" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            Ver todas
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">No tienes reservas próximas</p>
            <Link to="/tours" className="text-blue-600 hover:text-blue-700 font-medium">
              Explora tours disponibles
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {upcomingBookings.map((booking) => (
              <div key={booking.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                <div className="flex">
                  <div className="w-1/3 relative">
                    <img
                      src={booking.tours.image_url || 'https://images.pexels.com/photos/2245436/pexels-photo-2245436.png'}
                      alt={booking.tours.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="w-2/3 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg line-clamp-1">{booking.tours.name}</h3>
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    </div>
                    <div className="flex items-center text-gray-600 text-sm mb-2">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>{booking.tours.destination}</span>
                    </div>
                    <div className="flex items-center text-gray-600 text-sm mb-2">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span>{formatDate(booking.tours.start_date)} - {formatDate(booking.tours.end_date)}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      {booking.tours.agencies?.name}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-600">${booking.total_price}</span>
                      <Link
                        to={`/tours/${booking.tour_id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Ver detalles
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold flex items-center">
            <Heart className="w-6 h-6 mr-2 text-red-500" />
            Tours Guardados
          </h2>
        </div>

        {savedTours.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Heart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">No has guardado ningún tour todavía</p>
            <Link to="/tours" className="text-blue-600 hover:text-blue-700 font-medium">
              Explora tours y guarda tus favoritos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedTours.map((savedTour) => (
              <div key={savedTour.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative">
                  <img
                    src={savedTour.tours.image_url || 'https://images.pexels.com/photos/2245436/pexels-photo-2245436.png'}
                    alt={savedTour.tours.name}
                    className="w-full h-48 object-cover"
                  />
                  <button
                    onClick={() => removeSavedTour(savedTour.tour_id)}
                    className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
                    title="Quitar de guardados"
                  >
                    <Heart className="w-5 h-5 fill-red-500 text-red-500" />
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-1">{savedTour.tours.name}</h3>
                  <div className="flex items-center text-gray-600 text-sm mb-2">
                    <MapPin className="w-4 h-4 mr-1" />
                    <span>{savedTour.tours.destination}</span>
                  </div>
                  <div className="flex items-center text-gray-600 text-sm mb-3">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span className="text-xs">{formatDate(savedTour.tours.start_date)}</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-1">
                    {savedTour.tours.agencies?.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-600">${savedTour.tours.price}</span>
                    <Link
                      to={`/tours/${savedTour.tour_id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Ver detalles
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TravelerDashboard;