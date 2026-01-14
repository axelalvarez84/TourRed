import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Tag, Calendar, Building2, DollarSign, Dog, X } from 'lucide-react';
import { SearchFilters } from '../types';
import { supabase } from '../lib/supabase';

interface SearchBoxProps {
  initialFilters?: SearchFilters;
  className?: string;
}

const SearchBox: React.FC<SearchBoxProps> = ({ initialFilters = {}, className = '' }) => {
  const [destination, setDestination] = useState(initialFilters.destination || '');
  const [category, setCategory] = useState(initialFilters.category || '');
  const [startDate, setStartDate] = useState(initialFilters.startDate || '');
  const [endDate, setEndDate] = useState(initialFilters.endDate || '');
  const [agency, setAgency] = useState(initialFilters.agency || '');
  const [agencySearchText, setAgencySearchText] = useState('');
  const [minPrice, setMinPrice] = useState(initialFilters.minPrice || '');
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice || '');
  const [petFriendly, setPetFriendly] = useState(initialFilters.petFriendly || '');
  const [locationName, setLocationName] = useState(initialFilters.locationName || '');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(
    initialFilters.lat && initialFilters.lng
      ? { lat: parseFloat(initialFilters.lat), lng: parseFloat(initialFilters.lng) }
      : null
  );
  const [radius, setRadius] = useState(initialFilters.radius || '5');
  const [categories, setCategories] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [filteredAgencies, setFilteredAgencies] = useState<any[]>([]);
  const [showAgencyDropdown, setShowAgencyDropdown] = useState(false);
  const [selectedAgencyName, setSelectedAgencyName] = useState('');
  const agencyInputRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase
        .from('tour_categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');

      if (data) {
        setCategories(data);
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    const loadAgencies = async () => {
      const { data } = await supabase
        .from('agencies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (data) {
        setAgencies(data);
        setFilteredAgencies(data);

        if (initialFilters.agency && data.length > 0) {
          const selectedAgency = data.find(a => a.id === initialFilters.agency);
          if (selectedAgency) {
            setSelectedAgencyName(selectedAgency.name);
            setAgencySearchText(selectedAgency.name);
          }
        }
      }
    };

    loadAgencies();
  }, [initialFilters.agency]);

  useEffect(() => {
    if (agencySearchText === '') {
      setFilteredAgencies(agencies);
    } else {
      const filtered = agencies.filter(ag =>
        ag.name.toLowerCase().includes(agencySearchText.toLowerCase())
      );
      setFilteredAgencies(filtered);
    }
  }, [agencySearchText, agencies]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agencyInputRef.current && !agencyInputRef.current.contains(event.target as Node)) {
        setShowAgencyDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAgencyInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAgencySearchText(value);
    setShowAgencyDropdown(true);

    if (value === '') {
      setAgency('');
      setSelectedAgencyName('');
    }
  };

  const handleAgencySelect = (selectedAgency: any) => {
    setAgency(selectedAgency.id);
    setAgencySearchText(selectedAgency.name);
    setSelectedAgencyName(selectedAgency.name);
    setShowAgencyDropdown(false);
  };

  const handleClearAgency = () => {
    setAgency('');
    setAgencySearchText('');
    setSelectedAgencyName('');
    setShowAgencyDropdown(false);
  };

  const handleLocationSelect = (location: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
  }) => {
    setLocationCoords(location.coordinates);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const queryParams = new URLSearchParams();
    if (destination) queryParams.set('destination', destination);
    if (category) queryParams.set('category', category);
    if (startDate) queryParams.set('startDate', startDate);
    if (endDate) queryParams.set('endDate', endDate);
    if (agency) queryParams.set('agency', agency);
    if (minPrice) queryParams.set('minPrice', minPrice);
    if (maxPrice) queryParams.set('maxPrice', maxPrice);
    if (petFriendly) queryParams.set('petFriendly', petFriendly);

    if (locationCoords) {
      queryParams.set('lat', locationCoords.lat.toString());
      queryParams.set('lng', locationCoords.lng.toString());
      queryParams.set('radius', radius);
      if (locationName) queryParams.set('locationName', locationName);
    }

    navigate(`/tours?${queryParams.toString()}`);
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg p-4 md:p-6 ${className}`}>
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-1">
              Destino (opcional)
            </label>
            <div className="relative rounded-md shadow-sm">
              <input
                type="text"
                id="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
                placeholder="¿A dónde quieres ir?"
              />
            </div>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Tag className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
              >
                <option value="">Todas las Categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Inicio
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Fin
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
              />
            </div>
          </div>

          <div ref={agencyInputRef}>
            <label htmlFor="agency" className="block text-sm font-medium text-gray-700 mb-1">
              Agencia
            </label>
            <div className="relative">
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  id="agency"
                  value={agencySearchText}
                  onChange={handleAgencyInputChange}
                  onFocus={() => setShowAgencyDropdown(true)}
                  className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
                  placeholder="Buscar agencia..."
                  autoComplete="off"
                />
                {agency && (
                  <button
                    type="button"
                    onClick={handleClearAgency}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {showAgencyDropdown && filteredAgencies.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 shadow-xl max-h-60 rounded-md py-1 overflow-auto">
                  {filteredAgencies.map((ag) => (
                    <div
                      key={ag.id}
                      onClick={() => handleAgencySelect(ag)}
                      className={`cursor-pointer select-none relative py-3 px-3 hover:bg-blue-50 transition-colors ${
                        agency === ag.id ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                      }`}
                    >
                      <span className={`block truncate text-sm ${agency === ag.id ? 'font-semibold' : 'font-normal'}`}>
                        {ag.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="petFriendly" className="block text-sm font-medium text-gray-700 mb-1">
              Pet Friendly
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Dog className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="petFriendly"
                value={petFriendly}
                onChange={(e) => setPetFriendly(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
              >
                <option value="">Todos los Tours</option>
                <option value="true">Solo Pet Friendly</option>
                <option value="false">Sin Mascotas</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="minPrice" className="block text-sm font-medium text-gray-700 mb-1">
              Precio Mínimo
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                id="minPrice"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                min="0"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label htmlFor="maxPrice" className="block text-sm font-medium text-gray-700 mb-1">
              Precio Máximo
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                id="maxPrice"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min={minPrice || "0"}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 bg-white"
                placeholder="Sin límite"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <button type="submit" className="w-full btn btn-primary py-3 flex items-center justify-center">
            <Search className="h-5 w-5 mr-2" />
            Buscar Tours
          </button>
        </div>
      </form>
    </div>
  );
};

export default SearchBox;