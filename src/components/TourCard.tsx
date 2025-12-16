import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, Star, Users, Building, Heart } from 'lucide-react';
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface TourCardProps {
  tour: Tour;
  className?: string;
}

const TourCard: React.FC<TourCardProps> = ({ tour, className = '' }) => {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {tour.is_featured && (
          <div className="absolute top-2 left-2 bg-accent-500 text-white text-xs font-semibold px-2 py-1 rounded">
            Destacado
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
        
        <div className="flex items-center text-gray-500 text-sm mb-2">
          <MapPin className="w-4 h-4 mr-1" />
          <span>{tour.destination}</span>
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