import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Users, Building, Star, Clock, Globe, MessageCircle, ChevronLeft, ChevronRight, Edit } from 'lucide-react';
import BookingForm from '../components/BookingForm';
import ReviewList from '../components/ReviewList';
import { Tour } from '../types';
import { getTourById, supabase, parseDateFromDB } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

const TourDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAgency } = useAuth();
  const navigate = useNavigate();
  const [tour, setTour] = useState<Tour | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('description');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [agencyUserId, setAgencyUserId] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  useEffect(() => {
    const fetchTour = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        setError('');
        
        console.log('🔍 Cargando tour desde BD:', id);
        
        const { data, error } = await getTourById(id);
        
        if (error) {
          console.error('❌ Error cargando tour:', error);
          throw new Error(error.message);
        }
        
        if (!data) {
          throw new Error('Tour no encontrado');
        }
        
        console.log('✅ Tour cargado desde BD:', data);
        setTour(data);

        // Obtener información de la agencia y verificar propiedad
        const { data: agencyData } = await supabase
          .from('agencies')
          .select('id, user_id')
          .eq('id', data.agency_id)
          .single();

        if (agencyData) {
          setAgencyUserId(agencyData.user_id);
          
          // Verificar si el usuario actual es el propietario del tour
          if (user && isAgency && agencyData.user_id === user.id) {
            setIsOwner(true);
          }
        }
        
      } catch (err: any) {
        console.error('❌ Error en fetchTour:', err);
        setError(err.message || 'Error al cargar los detalles del tour');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTour();
  }, [id, user, isAgency]);

  const handleContactAgency = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!agencyUserId || !tour) {
      setError('No se pudo obtener información de la agencia');
      return;
    }

    try {
      setIsCreatingChat(true);
      
      // Verificar si ya existe una conversación entre el usuario y la agencia para este tour
      const { data: existingConversation, error: searchError } = await supabase
        .from('conversations')
        .select('id')
        .eq('tour_id', tour.id)
        .eq('created_by', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (searchError) {
        console.error('Error buscando conversación existente:', searchError);
      }

      let conversationId: string;

      if (existingConversation) {
        // Si ya existe una conversación, usarla
        conversationId = existingConversation.id;
        console.log('✅ Usando conversación existente:', conversationId);
      } else {
        // Crear nueva conversación
        const { data, error } = await supabase.rpc('create_conversation_with_participants', {
          p_title: `Consulta sobre: ${tour.name}`,
          p_type: 'general',
          p_booking_id: null,
          p_tour_id: tour.id,
          p_participant_ids: [agencyUserId]
        });

        if (error) {
          throw new Error(error.message);
        }

        conversationId = data;
        console.log('✅ Nueva conversación creada:', conversationId);
      }

      // Redirigir a la página de mensajes con la conversación seleccionada
      navigate(`/messages?conversation=${conversationId}`);
      
    } catch (err: any) {
      console.error('❌ Error creando conversación:', err);
      setError(err.message || 'Error al iniciar conversación con la agencia');
    } finally {
      setIsCreatingChat(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !tour) {
    return (
      <div className="container-custom py-12">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-error-600 mb-4">
            {error || 'Tour no encontrado'}
          </p>
          <p className="text-gray-600 mb-6">
            El tour que buscas no existe o no está disponible.
          </p>
          <Link to="/tours" className="btn btn-primary">
            Volver a Tours
          </Link>
        </div>
      </div>
    );
  }

  const galleryImages = tour.gallery || [tour.image_url];

  const nextImage = () => {
    setActiveImageIndex((prevIndex) => 
      prevIndex === galleryImages.length - 1 ? 0 : prevIndex + 1
    );
  };

  const prevImage = () => {
    setActiveImageIndex((prevIndex) => 
      prevIndex === 0 ? galleryImages.length - 1 : prevIndex - 1
    );
  };

  // Helper function to format dates consistently
  const formatDate = (dateString: string) => {
    try {
      // Parse the date string in YYYY-MM-DD format
      const [year, month, day] = dateString.split('-').map(Number);
      // Create date at midnight UTC
      const date = new Date(Date.UTC(year, month - 1, day));
      // Format using UTC to avoid timezone conversion
      const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const dayNum = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
      const yearNum = date.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
      return `${monthName} ${dayNum}, ${yearNum}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  const calculateDuration = () => {
    try {
      // Parse dates in UTC
      const [startYear, startMonth, startDay] = tour.start_date.split('-').map(Number);
      const [endYear, endMonth, endDay] = tour.end_date.split('-').map(Number);

      const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
      const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays === 0 ? 1 : diffDays + 1;
    } catch (error) {
      console.error('Error calculating duration:', error);
      return 1;
    }
  };

  const getBookingDeadline = () => {
    if (tour.booking_deadline) {
      return formatDate(tour.booking_deadline);
    }
    // Calcular 14 días antes del inicio como fecha límite por defecto
    try {
      const startDate = parseDateFromDB(tour.start_date);
      const deadline = new Date(startDate);
      deadline.setDate(deadline.getDate() - 14);
      return format(deadline, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error calculating booking deadline:', error);
      // Fallback calculation
      const deadline = new Date(tour.start_date);
      deadline.setDate(deadline.getDate() - 14);
      return format(deadline, 'MMM d, yyyy');
    }
  };

  // Función para obtener los elementos incluidos
  const getIncludedItems = () => {
    if (tour.includes && tour.includes.length > 0) {
      return tour.includes;
    }
    // Elementos por defecto si no hay datos personalizados
    return [
      `Alojamiento por ${calculateDuration()} ${calculateDuration() === 1 ? 'día' : 'días'}`,
      'Transporte durante el tour',
      'Guía profesional de turismo',
      'Desayuno y almuerzo diarios',
      'Todas las entradas a atracciones'
    ];
  };

  // Función para obtener los elementos no incluidos
  const getExcludedItems = () => {
    if (tour.excludes && tour.excludes.length > 0) {
      return tour.excludes;
    }
    // Elementos por defecto si no hay datos personalizados
    return [
      'Vuelos hacia y desde el destino',
      'Seguro de viaje',
      'Gastos de cena',
      'Gastos personales y souvenirs'
    ];
  };

  return (
    <div className="bg-gray-50 pb-12">
      {/* Tour Image Gallery */}
      <div className="relative bg-gray-900 h-[300px] md:h-[400px] lg:h-[500px]">
        <img
          src={galleryImages[activeImageIndex]}
          alt={tour.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback image if the tour image fails to load
            e.currentTarget.src = 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg';
          }}
        />
        
        {galleryImages.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 text-gray-800"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 text-gray-800"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
              {galleryImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveImageIndex(index)}
                  className={`w-2 h-2 rounded-full ${
                    index === activeImageIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                  aria-label={`Ir a imagen ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Botón de editar para el propietario */}
        {isOwner && (
          <div className="absolute top-4 right-4">
            <Link
              to="/agency/tours"
              className="bg-white/90 hover:bg-white rounded-full p-3 text-gray-800 shadow-lg transition-all"
              title="Editar este tour"
            >
              <Edit className="h-5 w-5" />
            </Link>
          </div>
        )}
      </div>
      
      <div className="container-custom -mt-10 relative z-10">
        <div className="bg-white rounded-t-lg shadow-md p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-2">
                <MapPin className="h-4 w-4 mr-1" />
                <span>{tour.destination}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{tour.name}</h1>
              <div className="flex items-center mb-4">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= Math.round(tour.agencies?.rating || 0)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="ml-2 text-sm text-gray-600">
                  {tour.agencies?.rating?.toFixed(1) || '0.0'} / 5.0
                </span>
              </div>
            </div>
            
            <div className="flex items-center mt-4 lg:mt-0">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                  {tour.agencies?.logo ? (
                    <img
                      src={tour.agencies.logo}
                      alt={tour.agencies.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <Building className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{tour.agencies?.name}</p>
                  <p className="text-xs text-gray-500">Operador de Tours</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="container-custom">
        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          <div className="w-full lg:w-2/3">
            {/* Tour Details Tabs */}
            <div className="bg-white rounded-lg shadow-md mb-6">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('description')}
                    className={`py-4 px-6 font-medium text-sm border-b-2 ${
                      activeTab === 'description'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Descripción
                  </button>
                  <button
                    onClick={() => setActiveTab('itinerary')}
                    className={`py-4 px-6 font-medium text-sm border-b-2 ${
                      activeTab === 'itinerary'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Itinerario
                  </button>
                  <button
                    onClick={() => setActiveTab('reviews')}
                    className={`py-4 px-6 font-medium text-sm border-b-2 ${
                      activeTab === 'reviews'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Reseñas
                  </button>
                </nav>
              </div>
              
              <div className="p-6">
                {activeTab === 'description' && (
                  <div className="prose max-w-none">
                    <p className="whitespace-pre-line">{tour.description}</p>
                    
                    <h3 className="text-lg font-semibold mt-6 mb-3 flex items-center justify-between">
                      Qué Incluye
                      {isOwner && (
                        <Link
                          to="/agency/tours"
                          className="text-sm text-primary-600 hover:text-primary-700 font-normal"
                        >
                          Editar
                        </Link>
                      )}
                    </h3>
                    <ul className="space-y-2">
                      {getIncludedItems().map((item, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-success-500 mr-2">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <h3 className="text-lg font-semibold mt-6 mb-3 flex items-center justify-between">
                      Qué No Incluye
                      {isOwner && (
                        <Link
                          to="/agency/tours"
                          className="text-sm text-primary-600 hover:text-primary-700 font-normal"
                        >
                          Editar
                        </Link>
                      )}
                    </h3>
                    <ul className="space-y-2">
                      {getExcludedItems().map((item, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-error-500 mr-2">✗</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

                    {isOwner && (
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Nota para la agencia:</strong> Puedes personalizar completamente qué incluye y qué no incluye tu tour desde el panel de gestión.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'itinerary' && (
                  <div className="space-y-6">
                    {tour.itinerary ? (
                      <div className="whitespace-pre-line">{tour.itinerary}</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-3">
                          <h3 className="text-lg font-semibold">Día 1: Llegada y Bienvenida</h3>
                          <div className="ml-6 space-y-2">
                            <p>
                              Llegada al punto de encuentro y conoce a tu guía turístico y compañeros de viaje. 
                              Traslado al alojamiento y disfruta de una cena de bienvenida.
                            </p>
                            <ul className="list-disc ml-5 text-gray-600">
                              <li>Llegada y check-in</li>
                              <li>Reunión de bienvenida y orientación</li>
                              <li>Cena grupal</li>
                            </ul>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <h3 className="text-lg font-semibold">Días 2-{Math.max(2, calculateDuration() - 1)}: Exploración</h3>
                          <div className="ml-6 space-y-2">
                            <p>
                              Días completos explorando las principales atracciones con guías locales expertos.
                              Experimenta la belleza natural y los aspectos culturales destacados del destino.
                            </p>
                            <ul className="list-disc ml-5 text-gray-600">
                              <li>Tours guiados matutinos</li>
                              <li>Almuerzo en restaurantes locales</li>
                              <li>Actividades vespertinas y tiempo libre</li>
                            </ul>
                          </div>
                        </div>
                        
                        {calculateDuration() > 1 && (
                          <div className="space-y-3">
                            <h3 className="text-lg font-semibold">Día {calculateDuration()}: Relajación y Partida</h3>
                            <div className="ml-6 space-y-2">
                              <p>
                                Día final para disfrutar el destino a tu propio ritmo.
                                Cena de despedida y preparación para la partida.
                              </p>
                              <ul className="list-disc ml-5 text-gray-600">
                                <li>Tiempo libre para compras o relajación</li>
                                <li>Cena de despedida</li>
                                <li>Check-out y traslados de partida</li>
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {activeTab === 'reviews' && (
                  <ReviewList tourId={tour.id} />
                )}
              </div>
            </div>
            
            {/* Tour Details */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Detalles del Tour</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start">
                  <Calendar className="h-5 w-5 text-primary-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Duración</h4>
                    <p className="text-gray-600">
                      {calculateDuration()} {calculateDuration() === 1 ? 'Día' : 'Días'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Calendar className="h-5 w-5 text-primary-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Fechas</h4>
                    <p className="text-gray-600">
                      {formatDate(tour.start_date)} - {formatDate(tour.end_date)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Users className="h-5 w-5 text-primary-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Tamaño del Grupo</h4>
                    <p className="text-gray-600">Máx {tour.max_travelers || 'Sin límite'} viajeros</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <MapPin className="h-5 w-5 text-primary-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Destino</h4>
                    <p className="text-gray-600">{tour.destination}</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <span className="h-5 w-5 text-primary-600 mr-3 mt-0.5 text-sm font-bold">🏷️</span>
                  <div>
                    <h4 className="font-medium">Categoría</h4>
                    <p className="text-gray-600 capitalize">{tour.category}</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <Clock className="h-5 w-5 text-primary-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium">Fecha Límite de Reserva</h4>
                    <p className="text-gray-600">
                      {getBookingDeadline()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full lg:w-1/3">
            {/* Booking Form - Solo mostrar si NO es el propietario */}
            {!isOwner && <BookingForm tour={tour} />}
            
            {/* Mensaje para el propietario */}
            {isOwner && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                  Vista de Propietario
                </h3>
                <p className="text-blue-800 mb-4">
                  Estás viendo tu propio tour. Los viajeros verán aquí el formulario de reserva.
                </p>
                <Link
                  to="/agency/tours"
                  className="btn btn-primary w-full"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Tour
                </Link>
              </div>
            )}
            
            {/* Agency Info */}
            <div className="bg-white rounded-lg shadow-md p-6 mt-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {tour.agencies?.logo ? (
                    <img
                      src={tour.agencies.logo}
                      alt={tour.agencies?.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <Building className="h-6 w-6 text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold">{tour.agencies?.name}</h3>
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <span className="ml-1 text-sm text-gray-600">
                      {tour.agencies?.rating?.toFixed(1) || '0.0'} Calificación
                    </span>
                  </div>
                </div>
              </div>
              
              <p className="mt-4 text-gray-700">
                {tour.agencies?.description || 'Información de la agencia no disponible.'}
              </p>
              
              <div className="mt-6 space-y-2">
                <a
                  href="#"
                  className="flex items-center text-primary-600 hover:text-primary-700"
                >
                  <Globe className="h-5 w-5 mr-2" />
                  <span>Visitar sitio web</span>
                </a>
                
                {/* Botón de contactar agencia - Solo mostrar si NO es el propietario */}
                {!isOwner && (
                  <button
                    onClick={handleContactAgency}
                    disabled={isCreatingChat}
                    className="flex items-center text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingChat ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary-600 mr-2"></div>
                        <span>Iniciando chat...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="h-5 w-5 mr-2" />
                        <span>Contactar agencia</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourDetailPage;