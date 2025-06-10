import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, Star, Users } from 'lucide-react';
import { Tour } from '../types';
import { parseDateFromDB } from '../lib/supabase';
import { format } from 'date-fns';

interface TourCardProps {
  tour: Tour;
  className?: string;
}

const TourCard: React.FC<TourCardProps> = ({ tour, className = '' }) => {
  // Helper function to format dates consistently
  const formatDate = (dateString: string) => {
    try {
      // Parse the date from database format (YYYY-MM-DD)
      const date = parseDateFromDB(dateString);
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      // Fallback to original format
      return format(new Date(dateString), 'MMM d, yyyy');
    }
  };

  return (
    <div className={`card group animate-fade-in ${className}`}>
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