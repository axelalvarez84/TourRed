import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, Star, Users, Building, Heart, Tag } from 'lucide-react';
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface TourCardProps {
  tour: Tour & {
    distance_meters?: number;
    nearest_departure_location?: string;
    nearest_departure_address?: string;
  };
  className?: string;
  showDistance?: boolean;
}

const TourCard: React.FC<TourCardProps> = ({ tour, className = '', showDistance = false }) => {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activePromo, setActivePromo] = useState<{
    promotion_type: string;
    min_travelers: number;
    fixed_group_price: number | null;
    group_discount_percentage: number | null;
    max_uses: number | null;
    times_used: number;
  } | null>(null);

  useEffect(() => {
    const loadPromo = async () => {
      try {
        const { data } = await supabase.rpc('get_active_promotion_for_tour', { p_tour_id: tour.id });
        if (data && data.length > 0) {
          setActivePromo(data[0]);
        } else {
          setActivePromo(null);
        }
      } catch {
        setActivePromo(null);
      }
    };
    loadPromo();
  }, [tour.id]);

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    if (km < 1) {
      return `${Math.round(meters)} m`;
    }
    return `${km.toFixed(1)} km`;
  };

  const getDistanceBadgeColor = (meters: number) => {
    const km = meters / 1000;
    if (km < 2) return 'bg-green-100 text-green-800 border-green-300';
    if (km < 5) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-orange-100 text-orange-800 border-orange-300';
  };

  useEffect(() => {
    if (user) {
      checkIfSaved();
    }
  }, [user, tour.id]);

  const checkIfSaved = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('saved_tours')
      .select('id')
      .eq('user_id', user.id)
      .eq('tour_id', tour.id)
      .maybeSingle();

    setIsSaved(!!data);
  };

  const handleSaveToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      alert('Debes iniciar sesión para guardar tours');
      return;
    }

    setIsSaving(true);

    try {
      if (isSaved) {
        const { error } = await supabase
          .from('saved_tours')
          .delete()
          .eq('user_id', user.id)
          .eq('tour_id', tour.id);

        if (error) throw error;
        setIsSaved(false);
      } else {
        const { error } = await supabase
          .from('saved_tours')
          .insert({
            user_id: user.id,
            tour_id: tour.id
          });

        if (error) throw error;
        setIsSaved(true);
      }
    } catch (error) {
      console.error('Error saving tour:', error);
      alert('Error al guardar el tour');
    } finally {
      setIsSaving(false);
    }
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

  return (
    <div className={`bg-blue-100 rounded-lg shadow-md overflow-hidden transition-all hover:shadow-lg group animate-fade-in ${className}`}>
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={tour.image_url || 'https://images.pexels.com/photos/2245436/pexels-photo-2245436.png'}
          alt={tour.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {tour.is_featured && (
          <div className="absolute top-2 left-2 bg-accent-500 text-white text-xs font-semibold px-2 py-1 rounded">
            Destacado
          </div>
        )}
        {activePromo && (
          <div className={`absolute ${tour.is_featured ? 'top-10 left-2' : 'top-2 left-2'} flex items-center gap-1 text-white text-xs font-bold px-2 py-1 rounded shadow-md ${
            activePromo.promotion_type === '2x1' ? 'bg-rose-600' :
            activePromo.promotion_type === '3x2' ? 'bg-orange-500' :
            activePromo.promotion_type === 'nxprecio' ? 'bg-teal-600' :
            'bg-emerald-600'
          }`}>
            <Tag className="w-3 h-3" />
            {activePromo.promotion_type === '2x1' ? '2x1' :
             activePromo.promotion_type === '3x2' ? '3x2' :
             activePromo.promotion_type === 'nxprecio' && activePromo.fixed_group_price !== null
               ? `${activePromo.min_travelers} x $${activePromo.fixed_group_price.toLocaleString()}`
             : activePromo.promotion_type === 'grupo_precio_fijo' && activePromo.group_discount_percentage !== null
               ? `-${activePromo.group_discount_percentage}% Grupal`
               : 'Oferta'}
          </div>
        )}
        {user && (
          <button
            onClick={handleSaveToggle}
            disabled={isSaving}
            className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            title={isSaved ? 'Quitar de guardados' : 'Guardar tour'}
          >
            <Heart
              className={`w-5 h-5 transition-all ${
                isSaved ? 'fill-red-500 text-red-500' : 'text-gray-600 hover:text-red-500'
              }`}
            />
          </button>
        )}
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">{tour.name}</h3>
          <div className="flex items-center text-accent-500">
            <Star className="w-4 h-4 fill-current" />
            <span className="ml-1 text-sm font-medium">
              {tour.agencies?.rating?.toFixed(1) || '4.5'}
            </span>
          </div>
        </div>
        
        <div className="space-y-2 mb-2">
          <div className="flex items-center text-gray-500 text-sm">
            <MapPin className="w-4 h-4 mr-1" />
            <span>{tour.destination}</span>
          </div>

          {showDistance && tour.distance_meters !== undefined && (
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getDistanceBadgeColor(tour.distance_meters)}`}>
              <MapPin className="w-3.5 h-3.5" />
              <span>
                A {formatDistance(tour.distance_meters)} de tu búsqueda
              </span>
            </div>
          )}

          {showDistance && tour.nearest_departure_location && (
            <div className="text-xs text-gray-600 flex items-start gap-1">
              <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1">
                Sale desde: <span className="font-medium">{tour.nearest_departure_location}</span>
              </span>
            </div>
          )}
        </div>

        {tour.agencies && (
          <div className="flex items-center text-gray-600 text-sm mb-2">
            <Building className="w-4 h-4 mr-1" />
            <Link
              to={`/agencies/${tour.agency_id}`}
              className="hover:text-blue-600 hover:underline transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {tour.agencies.name}
            </Link>
          </div>
        )}

        <div className="flex items-center text-gray-500 text-sm mb-3">
          <Calendar className="w-4 h-4 mr-1" />
          <span>{formatDate(tour.start_date)} - {formatDate(tour.end_date)}</span>
        </div>
        
        {tour.max_travelers && (
          <div className="flex items-center text-gray-500 text-sm mb-3">
            <Users className="w-4 h-4 mr-1" />
            <span>Máximo {tour.max_travelers} viajeros</span>
          </div>
        )}
        
        <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">Desde</span>
            <div className="text-primary-600 font-bold text-xl">${tour.price}</div>
          </div>
          
          <Link to={`/tours/${tour.id}`} className="btn btn-primary">
            Ver Detalles
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TourCard;