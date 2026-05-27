import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, ChevronDown, ChevronUp } from 'lucide-react';
import TourCard from './TourCard';
import { Tour } from '../types';

const ROWS_PER_LOAD = 5;
const COLS = 5;
const PAGE_SIZE = ROWS_PER_LOAD * COLS; // 25 per expansion
const MAX_TOURS = COLS * 10; // 50 max

interface TourGridSectionProps {
  title: string;
  subtitle?: string;
  tours: Tour[];
  isLoading: boolean;
  promotionsMap: Record<string, any>;
  bgClass?: string;
}

const TourGridSection: React.FC<TourGridSectionProps> = ({
  title,
  subtitle,
  tours,
  isLoading,
  promotionsMap,
  bgClass = 'bg-white',
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const capped = tours.slice(0, MAX_TOURS);
  const visible = capped.slice(0, visibleCount);
  const hasMore = visibleCount < capped.length;
  const isExpanded = visibleCount > PAGE_SIZE;

  const handleShowMore = () => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, capped.length));
  const handleShowLess = () => { setVisibleCount(PAGE_SIZE); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <section className={`py-12 ${bgClass}`}>
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
          </div>
          <Link to="/tours" className="flex-shrink-0 text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 text-sm">
            Ver todos <Compass className="h-4 w-4" />
          </Link>
        </div>

        {/* Loading skeleton */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-7 bg-gray-200 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : capped.length === 0 ? null : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {visible.map((tour) => (
                <TourCard
                  key={tour.id}
                  tour={tour}
                  activePromo={promotionsMap[tour.id] ?? null}
                  compact
                />
              ))}
            </div>

            {/* Expand / Collapse controls */}
            {(hasMore || isExpanded) && (
              <div className="mt-8 flex justify-center gap-3">
                {hasMore && (
                  <button
                    onClick={handleShowMore}
                    className="flex items-center gap-2 px-6 py-2.5 border border-primary-300 text-primary-600 hover:bg-primary-50 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Ver más tours ({capped.length - visibleCount} restantes)
                  </button>
                )}
                {isExpanded && (
                  <button
                    onClick={handleShowLess}
                    className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                    Mostrar menos
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default TourGridSection;
