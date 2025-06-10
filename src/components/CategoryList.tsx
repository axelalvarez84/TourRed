import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Mountain, Building, Palmtree, Users, Bike, Utensils, Umbrella as UmbrellaBeach } from 'lucide-react';

const categories = [
  { id: 'adventure', name: 'Aventura', icon: <Mountain className="h-6 w-6" /> },
  { id: 'nature', name: 'Naturaleza', icon: <Palmtree className="h-6 w-6" /> },
  { id: 'cultural', name: 'Cultural', icon: <Building className="h-6 w-6" /> },
  { id: 'beach', name: 'Playa', icon: <UmbrellaBeach className="h-6 w-6" /> },
  { id: 'urban', name: 'Urbano', icon: <Building className="h-6 w-6" /> },
  { id: 'sports', name: 'Deportes', icon: <Bike className="h-6 w-6" /> },
  { id: 'food', name: 'Gastronomía', icon: <Utensils className="h-6 w-6" /> },
  { id: 'group', name: 'Grupos', icon: <Users className="h-6 w-6" /> },
];

const CategoryList: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/tours?category=${category.id}`}
          className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow group"
        >
          <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-2 text-primary-600 group-hover:bg-primary-100 transition-colors">
            {category.icon}
          </div>
          <span className="text-sm font-medium text-gray-700">{category.name}</span>
        </Link>
      ))}
    </div>
  );
};

export default CategoryList;