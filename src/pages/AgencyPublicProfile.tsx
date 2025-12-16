import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, MapPin, Globe, Phone, Mail, Building, Calendar, Award, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import TourCard from '../components/TourCard';
import AgencyReviews from '../components/AgencyReviews';

interface Agency {
  id: string;
  name: string;
  description: string;
  logo: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  rating: number;
  rnt: string;
  created_at: string;
}

interface Tour {
  id: string;
  name: string;
  destination: string;
  description: string;
  price: number;
  deposit_percentage: number;
  image_url: string;
  start_date: string;
  end_date: string;
  max_travelers: number;
  category: string[];
}

const AgencyPublicProfile: React.FC = () => {
  const { agencyId } = useParams<{ agencyId: string }>();
  const { user } = useAuth();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'tours' | 'reviews'>('tours');

  useEffect(() => {
    if (agencyId) {
      fetchAgencyData();
    }
  }, [agencyId]);

  const fetchAgencyData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .eq('is_active', true)
        .maybeSingle();

      if (agencyError) throw agencyError;
      if (!agencyData) {
        setError('Agencia no encontrada');
        return;
      }

      setAgency(agencyData);

      const { data: toursData, error: toursError } = await supabase
        .from('tours')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (toursError) throw toursError;
      setTours(toursData || []);
    } catch (err: any) {
      console.error('Error cargando datos de agencia:', err);
      setError(err.message || 'Error al cargar la información de la agencia');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {error || 'Agencia no encontrada'}
          </h2>
          <Link to="/tours" className="text-blue-600 hover:text-blue-700">
            Ver todos los tours
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 h-32"></div>

          <div className="px-8 pb-8">
            <div className="flex flex-col md:flex-row md:items-end -mt-16 mb-6">
              <div className="flex-shrink-0 mb-4 md:mb-0">
                {agency.logo ? (
                  <img
                    src={agency.logo}
                    alt={agency.name}
                    className="w-32 h-32 rounded-lg border-4 border-white shadow-lg object-cover bg-white"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-lg border-4 border-white shadow-lg bg-gray-200 flex items-center justify-center">
                    <Building className="h-16 w-16 text-gray-400" />
                  </div>
                )}
              </div>

              <div className="md:ml-6 flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">{agency.name}</h1>

                    <div className="flex items-center mt-2 space-x-4">
                      {agency.rating > 0 && (
                        <div className="flex items-center">
                          <Star className="h-5 w-5 text-yellow-400 fill-current" />
                          <span className="ml-1 text-lg font-semibold text-gray-900">
                            {agency.rating.toFixed(1)}
                          </span>
                        </div>
                      )}

                      {agency.rnt && (
                        <div className="flex items-center text-green-600">
                          <Award className="h-5 w-5 mr-1" />
                          <span className="text-sm font-medium">RNT: {agency.rnt}</span>
                        </div>
                      )}

                      <div className="flex items-center text-gray-600">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-sm">
                          Desde {new Date(agency.created_at).getFullYear()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {agency.description && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Acerca de la agencia</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{agency.description}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t">
              {agency.website && (
                <a
                  href={agency.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-600 hover:text-blue-700"
                >
                  <Globe className="h-5 w-5 mr-2" />
                  <span>Visitar sitio web</span>
                </a>
              )}

              {agency.contact_email && (
                <a
                  href={`mailto:${agency.contact_email}`}
                  className="flex items-center text-gray-700 hover:text-gray-900"
                >
                  <Mail className="h-5 w-5 mr-2" />
                  <span>{agency.contact_email}</span>
                </a>
              )}

              {agency.contact_phone && (
                <a
                  href={`tel:${agency.contact_phone}`}
                  className="flex items-center text-gray-700 hover:text-gray-900"
                >
                  <Phone className="h-5 w-5 mr-2" />
                  <span>{agency.contact_phone}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('tours')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tours'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Tours ({tours.length})
                </div>
              </button>

              <button
                onClick={() => setActiveTab('reviews')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'reviews'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Star className="h-5 w-5 mr-2" />
                  Reseñas
                </div>
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'tours' && (
          <div>
            {tours.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tours.map((tour) => (
                  <TourCard key={tour.id} tour={tour} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No hay tours disponibles
                </h3>
                <p className="text-gray-600">
                  Esta agencia aún no ha publicado tours.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <AgencyReviews agencyId={agency.id} agencyName={agency.name} />
        )}
      </div>
    </div>
  );
};

export default AgencyPublicProfile;
