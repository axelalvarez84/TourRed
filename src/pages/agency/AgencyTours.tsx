import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createTour, searchDestinations, supabase, updateTour, deleteTour, getAllDestinations, createDestination } from '../../lib/supabase';
import { Plus, Search, X, Edit, Trash2, Eye, Calendar, MapPin, Users, DollarSign, Save, Minus, Upload, Copy } from 'lucide-react';
import { Tour, Destination } from '../../types';
import { format } from 'date-fns';
import ImageUploader from '../../components/ImageUploader';

const AgencyTours: React.FC = () => {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<{id: string, name: string}[]>([]);
  const [allAvailableDestinations, setAllAvailableDestinations] = useState<Destination[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [editingTour, setEditingTour] = useState<Tour | null>(null);
  const [duplicatingTour, setDuplicatingTour] = useState<Tour | null>(null);
  const [duplicateFormData, setDuplicateFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    booking_deadline: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    category: ['adventure'] as string[],
    description: '',
    itinerary: '',
    price: '',
    deposit_percentage: '',
    image_url: '',
    start_date: '',
    end_date: '',
    max_travelers: '',
    available_spots: '',
    booking_deadline: '', // Nueva fecha límite de reserva
    booking_approval_type: 'automatic',
  });

  const [includes, setIncludes] = useState<string[]>(['']);
  const [excludes, setExcludes] = useState<string[]>(['']);
  const [tourImageData, setTourImageData] = useState<{base64: string, type: string, size: number} | null>(null);

  useEffect(() => {
    fetchAgencyTours();
    fetchAllDestinations();
  }, [user]);

  useEffect(() => {
    const searchDestinationsDebounced = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const { data, error } = await searchDestinations(searchQuery);
        if (!error && data) {
          setSearchResults(data);
          setShowSearchResults(true);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 300);

    return () => clearTimeout(searchDestinationsDebounced);
  }, [searchQuery]);

  const fetchAllDestinations = async () => {
    try {
      const { data, error } = await getAllDestinations();
      if (error) throw error;
      setAllAvailableDestinations(data || []);
    } catch (err: any) {
      console.error('❌ Error cargando destinos:', err);
    }
  };

  const fetchAgencyTours = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      
      console.log('🎯 Cargando tours de la agencia para usuario:', user.id);

      // Primero obtener el ID de la agencia
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (agencyError) {
        if (agencyError.code === 'PGRST116') {
          setError('No se encontró perfil de agencia para este usuario');
          return;
        }
        throw new Error(agencyError.message);
      }

      if (!agencyData) {
        setError('No se encontró perfil de agencia');
        return;
      }

      console.log('🏢 ID de agencia encontrado:', agencyData.id);

      // Obtener tours de la agencia
      const { data: toursData, error: toursError } = await supabase
        .from('tours')
        .select(`
          *,
          agencies(id, name, rating)
        `)
        .eq('agency_id', agencyData.id)
        .order('created_at', { ascending: false });

      if (toursError) {
        throw new Error(toursError.message);
      }

      console.log('✅ Tours cargados:', toursData);
      setTours(toursData || []);

    } catch (err: any) {
      console.error('❌ Error cargando tours de agencia:', err);
      setError(err.message || 'Error al cargar los tours');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: ['adventure'],
      description: '',
      itinerary: '',
      price: '',
      deposit_percentage: '',
      image_url: '',
      start_date: '',
      end_date: '',
      max_travelers: '',
      available_spots: '',
      booking_deadline: '',
      booking_approval_type: 'automatic',
    });
    setSelectedDestinations([]);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIncludes(['']);
    setExcludes(['']);
    setTourImageData(null);
  };

  const handleCreate = () => {
    resetForm();
    setIsCreating(true);
    setEditingTour(null);
  };

  const handleEdit = (tour: Tour) => {
    // Calcular fecha límite por defecto (14 días antes del inicio)
    const defaultDeadline = new Date(tour.start_date);
    defaultDeadline.setDate(defaultDeadline.getDate() - 14);

    // Buscar el destino en la lista de destinos disponibles
    const destinationObj = allAvailableDestinations.find(d => d.name === tour.destination);
    const selectedDest = destinationObj ? [{ id: destinationObj.id, name: destinationObj.name }] : [];

    // Asegurar que category sea un array
    const categoryArray = Array.isArray(tour.category) ? tour.category : [tour.category];

    setFormData({
      name: tour.name,
      category: categoryArray,
      description: tour.description,
      itinerary: tour.itinerary || '',
      price: tour.price.toString(),
      deposit_percentage: tour.deposit_percentage.toString(),
      image_url: tour.image_url,
      start_date: tour.start_date,
      end_date: tour.end_date,
      max_travelers: tour.max_travelers?.toString() || '',
      available_spots: tour.available_spots?.toString() || '',
      booking_deadline: tour.booking_deadline || defaultDeadline.toISOString().split('T')[0],
      booking_approval_type: tour.booking_approval_type || 'automatic',
    });
    setSelectedDestinations(selectedDest);
    setIncludes(tour.includes && tour.includes.length > 0 ? tour.includes : ['']);
    setExcludes(tour.excludes && tour.excludes.length > 0 ? tour.excludes : ['']);
    setTourImageData(null); // Reset image data when editing
    setEditingTour(tour);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingTour(null);
    resetForm();
    setError('');
  };

  const handleDelete = async (tourId: string, tourName: string) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar el tour "${tourName}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setIsSubmitting(true);

      const { error } = await deleteTour(tourId);
      if (error) throw error;

      await fetchAgencyTours();
      console.log('✅ Tour eliminado correctamente');
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el tour');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = (tour: Tour) => {
    setDuplicatingTour(tour);
    setDuplicateFormData({
      name: `${tour.name} (Copia)`,
      start_date: tour.start_date,
      end_date: tour.end_date,
      booking_deadline: tour.booking_deadline || '',
    });
  };

  const handleDuplicateCancel = () => {
    setDuplicatingTour(null);
    setDuplicateFormData({
      name: '',
      start_date: '',
      end_date: '',
      booking_deadline: '',
    });
  };

  const handleDuplicateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!duplicatingTour || !user?.id) return;

    try {
      setIsSubmitting(true);
      setError('');

      // Calcular fecha límite por defecto si no se especifica
      let bookingDeadline = duplicateFormData.booking_deadline;
      if (!bookingDeadline && duplicateFormData.start_date) {
        const deadline = new Date(duplicateFormData.start_date);
        deadline.setDate(deadline.getDate() - 14);
        bookingDeadline = deadline.toISOString().split('T')[0];
      }

      const tourData = {
        name: duplicateFormData.name,
        category: duplicatingTour.category,
        description: duplicatingTour.description,
        itinerary: duplicatingTour.itinerary,
        price: duplicatingTour.price,
        deposit_percentage: duplicatingTour.deposit_percentage,
        image_url: duplicatingTour.image_url,
        start_date: duplicateFormData.start_date,
        end_date: duplicateFormData.end_date,
        max_travelers: duplicatingTour.max_travelers,
        destination: duplicatingTour.destination,
        includes: duplicatingTour.includes,
        excludes: duplicatingTour.excludes,
        booking_deadline: bookingDeadline,
        booking_approval_type: duplicatingTour.booking_approval_type,
      };

      // Obtener la agencia ID
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (agencyError) throw agencyError;

      // Crear el nuevo tour
      const { error } = await createTour(tourData, [], user.id);
      if (error) throw error;

      await fetchAgencyTours();
      handleDuplicateCancel();
      console.log('✅ Tour duplicado correctamente');
    } catch (err: any) {
      setError(err.message || 'Error al duplicar el tour');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCategoryToggle = (category: string) => {
    const currentCategories = formData.category;
    if (currentCategories.includes(category)) {
      // Remover la categoría si ya está seleccionada (pero mantener al menos una)
      if (currentCategories.length > 1) {
        setFormData({
          ...formData,
          category: currentCategories.filter(c => c !== category)
        });
      }
    } else {
      // Agregar la categoría
      setFormData({
        ...formData,
        category: [...currentCategories, category]
      });
    }
  };

  const handleIncludeChange = (index: number, value: string) => {
    const newIncludes = [...includes];
    newIncludes[index] = value;
    setIncludes(newIncludes);
  };

  const addInclude = () => {
    setIncludes([...includes, '']);
  };

  const removeInclude = (index: number) => {
    if (includes.length > 1) {
      setIncludes(includes.filter((_, i) => i !== index));
    }
  };

  const handleExcludeChange = (index: number, value: string) => {
    const newExcludes = [...excludes];
    newExcludes[index] = value;
    setExcludes(newExcludes);
  };

  const addExclude = () => {
    setExcludes([...excludes, '']);
  };

  const removeExclude = (index: number) => {
    if (excludes.length > 1) {
      setExcludes(excludes.filter((_, i) => i !== index));
    }
  };

  const handleImageSelect = (base64: string, type: string, size: number) => {
    setTourImageData({ base64, type, size });
    // También actualizar la URL para vista previa
    setFormData({ ...formData, image_url: base64 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (selectedDestinations.length === 0) {
        throw new Error('Debe seleccionar al menos un destino para el tour');
      }

      // Validar que haya una imagen (URL o base64)
      if (!formData.image_url && !tourImageData) {
        throw new Error('Debe proporcionar una imagen para el tour');
      }

      // Crear destinos nuevos si es necesario
      const processedDestinations = [];
      
      for (const destination of selectedDestinations) {
        if (destination.id.startsWith('temp_')) {
          // Es un destino nuevo, crearlo primero
          console.log('🌍 Creando nuevo destino:', destination.name);
          
          const { data: newDestination, error: destinationError } = await createDestination({
            name: destination.name,
            is_active: true,
            last_updated_by: user.id
          });
          
          if (destinationError) {
            throw new Error(`Error creando destino "${destination.name}": ${destinationError.message}`);
          }
          
          processedDestinations.push(newDestination.id);
          console.log('✅ Destino creado:', newDestination);
        } else {
          // Es un destino existente
          processedDestinations.push(destination.id);
        }
      }

      // Filtrar includes y excludes vacíos
      const filteredIncludes = includes.filter(item => item.trim() !== '');
      const filteredExcludes = excludes.filter(item => item.trim() !== '');

      // Calcular fecha límite por defecto si no se especifica
      let bookingDeadline = formData.booking_deadline;
      if (!bookingDeadline && formData.start_date) {
        const deadline = new Date(formData.start_date);
        deadline.setDate(deadline.getDate() - 14); // 14 días antes por defecto
        bookingDeadline = deadline.toISOString().split('T')[0];
      }

      const tourData = {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        itinerary: formData.itinerary,
        price: parseFloat(formData.price),
        deposit_percentage: parseInt(formData.deposit_percentage),
        image_url: tourImageData ? tourImageData.base64 : formData.image_url,
        start_date: formData.start_date,
        end_date: formData.end_date,
        max_travelers: formData.max_travelers ? parseInt(formData.max_travelers) : null,
        available_spots: formData.available_spots ? parseInt(formData.available_spots) : null,
        destination: selectedDestinations.length > 0 ? selectedDestinations[0].name : '',
        includes: filteredIncludes.length > 0 ? filteredIncludes : null,
        excludes: filteredExcludes.length > 0 ? filteredExcludes : null,
        booking_deadline: bookingDeadline,
        booking_approval_type: formData.booking_approval_type,
      };

      if (editingTour) {
        // Actualizar tour existente
        const { error } = await updateTour(editingTour.id, tourData);
        if (error) throw error;
        console.log('✅ Tour actualizado correctamente');
      } else {
        // Crear nuevo tour
        const { error } = await createTour(tourData, processedDestinations, user.id);
        if (error) throw error;
        console.log('✅ Tour creado correctamente');
      }

      // Recargar destinos disponibles después de crear nuevos
      await fetchAllDestinations();
      
      // Recargar tours después de crear/actualizar
      await fetchAgencyTours();
      handleCancel();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addDestination = (destinationName: string) => {
    // Buscar el destino en la lista de destinos disponibles
    const destinationObj = allAvailableDestinations.find(d => d.name === destinationName);
    if (destinationObj && !selectedDestinations.find(d => d.id === destinationObj.id)) {
      setSelectedDestinations([...selectedDestinations, { id: destinationObj.id, name: destinationObj.name }]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const addDestinationFromInput = () => {
    if (searchQuery.trim()) {
      const destinationName = searchQuery.trim();
      
      // Verificar si ya está seleccionado
      if (selectedDestinations.find(d => d.name.toLowerCase() === destinationName.toLowerCase())) {
        setError(`El destino "${destinationName}" ya está seleccionado.`);
        return;
      }
      
      // Buscar si existe en la lista de destinos disponibles
      const existingDestination = allAvailableDestinations.find(d => 
        d.name.toLowerCase() === destinationName.toLowerCase()
      );
      
      if (existingDestination) {
        // Si existe, agregarlo con su ID real
        setSelectedDestinations([...selectedDestinations, { 
          id: existingDestination.id, 
          name: existingDestination.name 
        }]);
      } else {
        // Si no existe, agregarlo como nuevo destino (se creará al guardar el tour)
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSelectedDestinations([...selectedDestinations, { 
          id: tempId, 
          name: destinationName 
        }]);
      }
      
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDestinationFromInput();
    }
  };

  const removeDestination = (destinationId: string) => {
    setSelectedDestinations(selectedDestinations.filter(d => d.id !== destinationId));
  };

  const formatDate = (dateString: string) => {
    try {
      if (dateString.includes(' ') || dateString.includes('T')) {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) throw new Error('Invalid date');
        const monthName = date.toLocaleString('en-US', { month: 'short' });
        const dayNum = date.toLocaleString('en-US', { day: 'numeric' });
        const yearNum = date.toLocaleString('en-US', { year: 'numeric' });
        return `${monthName} ${dayNum}, ${yearNum}`;
      } else {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const dayNum = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
        const yearNum = date.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
        return `${monthName} ${dayNum}, ${yearNum}`;
      }
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  const getCategoryName = (category: string) => {
    const categories: { [key: string]: string } = {
      adventure: 'Aventura',
      nature: 'Naturaleza',
      cultural: 'Cultural',
      beach: 'Playa',
      urban: 'Urbano',
      wellness: 'Bienestar'
    };
    return categories[category] || category;
  };

  const getCategoryNames = (categories: string | string[]) => {
    const categoryArray = Array.isArray(categories) ? categories : [categories];
    return categoryArray.map(cat => getCategoryName(cat)).join(', ');
  };

  const getStatusBadge = (tour: Tour) => {
    const today = new Date();
    const startDate = new Date(tour.start_date);
    const endDate = new Date(tour.end_date);

    if (endDate < today) {
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Finalizado</span>;
    } else if (startDate <= today && endDate >= today) {
      return <span className="px-2 py-1 text-xs font-medium bg-success-100 text-success-800 rounded-full">En Curso</span>;
    } else {
      return <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full">Próximo</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestionar Tours</h1>
          <p className="text-gray-600 mt-1">
            {tours.length === 0 
              ? 'No tienes tours publicados aún' 
              : `${tours.length} ${tours.length === 1 ? 'tour publicado' : 'tours publicados'}`
            }
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="btn btn-primary"
          disabled={isCreating || editingTour}
        >
          <Plus className="h-5 w-5 mr-2" />
          {isCreating ? 'Cancelar' : 'Crear Nuevo Tour'}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Formulario de Crear/Editar */}
      {(isCreating || editingTour) && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingTour ? `Editar Tour: ${editingTour.name}` : 'Crear Nuevo Tour'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Tour *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categorías * <span className="text-xs text-gray-500">(Selecciona al menos una)</span>
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'adventure', label: 'Aventura' },
                    { value: 'nature', label: 'Naturaleza' },
                    { value: 'cultural', label: 'Cultural' },
                    { value: 'beach', label: 'Playa' },
                    { value: 'urban', label: 'Urbano' },
                    { value: 'wellness', label: 'Bienestar' }
                  ].map((cat) => (
                    <label key={cat.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.category.includes(cat.value)}
                        onChange={() => handleCategoryToggle(cat.value)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{cat.label}</span>
                    </label>
                  ))}
                </div>
                {formData.category.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">⚠️ Debes seleccionar al menos una categoría</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="input"
                  rows={3}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Itinerario Detallado *
                </label>
                <textarea
                  value={formData.itinerary}
                  onChange={(e) => setFormData({...formData, itinerary: e.target.value})}
                  className="input"
                  rows={5}
                  required
                />
              </div>

              {/* Imagen del Tour */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Imagen Principal del Tour *
                </label>
                <ImageUploader
                  onImageSelect={handleImageSelect}
                  currentImage={formData.image_url}
                  maxSizeMB={5}
                  placeholder="Subir imagen del tour"
                />
                <p className="text-xs text-gray-500 mt-1">
                  También puedes proporcionar una URL de imagen en el campo de abajo
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de Imagen (Alternativa)
                </label>
                <input
                  type="url"
                  value={tourImageData ? '' : formData.image_url}
                  onChange={(e) => {
                    setFormData({...formData, image_url: e.target.value});
                    if (e.target.value) {
                      setTourImageData(null); // Clear uploaded image if URL is provided
                    }
                  }}
                  className="input"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  disabled={!!tourImageData}
                />
                {tourImageData && (
                  <p className="text-xs text-success-600 mt-1">
                    ✓ Imagen subida correctamente. Borra la imagen subida para usar URL.
                  </p>
                )}
              </div>

              {/* Qué Incluye */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Qué Incluye el Tour
                </label>
                <div className="space-y-2">
                  {includes.map((include, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={include}
                        onChange={(e) => handleIncludeChange(index, e.target.value)}
                        className="input flex-1"
                        placeholder="Ej: Alojamiento por 3 noches"
                      />
                      {includes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInclude(index)}
                          className="p-2 text-error-600 hover:text-error-700"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addInclude}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    + Agregar elemento incluido
                  </button>
                </div>
              </div>

              {/* Qué No Incluye */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Qué NO Incluye el Tour
                </label>
                <div className="space-y-2">
                  {excludes.map((exclude, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={exclude}
                        onChange={(e) => handleExcludeChange(index, e.target.value)}
                        className="input flex-1"
                        placeholder="Ej: Vuelos hacia y desde el destino"
                      />
                      {excludes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeExclude(index)}
                          className="p-2 text-error-600 hover:text-error-700"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExclude}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    + Agregar elemento no incluido
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destinos * <span className="text-sm text-gray-500">(Presiona Enter para agregar)</span>
                </label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {selectedDestinations.map((destination) => (
                    <span
                      key={destination.id}
                      className="inline-flex items-center bg-primary-100 text-primary-800 px-3 py-1 rounded-full text-sm"
                    >
                      {destination.name}
                      <button
                        type="button"
                        onClick={() => removeDestination(destination.id)}
                        className="ml-2 text-primary-600 hover:text-primary-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative">
                  <div className="flex">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="input flex-1"
                      placeholder="Escribe un destino y presiona Enter..."
                    />
                    <button
                      type="button"
                      onClick={addDestinationFromInput}
                      className="ml-2 px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
                      disabled={!searchQuery.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg border">
                      <div className="py-1">
                        <div className="px-3 py-2 text-xs text-gray-500 border-b">
                          Destinos existentes:
                        </div>
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                            onClick={() => addDestination(result.name)}
                          >
                            {result.name}
                          </button>
                        ))}
                        {searchResults.length === 0 && searchQuery.trim() && (
                          <div className="px-3 py-2 text-xs text-gray-500">
                            No se encontraron destinos existentes
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {selectedDestinations.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">⚠️ Debe seleccionar al menos un destino</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  💡 Tip: Escribe el nombre del destino y presiona Enter o haz clic en el botón + para agregarlo. Si el destino no existe, se creará automáticamente.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio Total (MXN) *
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="input"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Porcentaje de Depósito *
                </label>
                <input
                  type="number"
                  value={formData.deposit_percentage}
                  onChange={(e) => setFormData({...formData, deposit_percentage: e.target.value})}
                  className="input"
                  min="0"
                  max="100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tamaño Máximo del Grupo
                </label>
                <input
                  type="number"
                  value={formData.max_travelers}
                  onChange={(e) => setFormData({...formData, max_travelers: e.target.value})}
                  className="input"
                  min="1"
                  placeholder="Ej: 15"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Capacidad máxima teórica del tour
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lugares Disponibles para Reserva
                </label>
                <input
                  type="number"
                  value={formData.available_spots}
                  onChange={(e) => setFormData({...formData, available_spots: e.target.value})}
                  className="input"
                  min="0"
                  max={formData.max_travelers || undefined}
                  placeholder="Opcional - Deja vacío para usar el máximo"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Controla cuántos lugares están realmente disponibles para reservar (considerando logística, alojamiento, transporte, etc.)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Límite de Reserva
                </label>
                <input
                  type="date"
                  value={formData.booking_deadline}
                  onChange={(e) => setFormData({...formData, booking_deadline: e.target.value})}
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Si no se especifica, será 14 días antes del inicio del tour
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Reserva *
                </label>
                <select
                  value={formData.booking_approval_type}
                  onChange={(e) => setFormData({...formData, booking_approval_type: e.target.value as 'automatic' | 'manual'})}
                  className="input"
                  required
                >
                  <option value="automatic">Automática (pago inmediato)</option>
                  <option value="manual">Sujeta a aprobación (sin cargo inicial)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.booking_approval_type === 'automatic' 
                    ? 'Los usuarios pagarán el depósito inmediatamente al reservar'
                    : 'Deberás aprobar cada reserva antes de que el usuario pueda pagar'
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Inicio *
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Fin *
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  className="input"
                  min={formData.start_date}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-outline"
                disabled={isSubmitting}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedDestinations.length === 0}
                className={`btn btn-primary ${
                  selectedDestinations.length === 0 
                    ? 'opacity-50 cursor-not-allowed' 
                    : ''
                }`}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting 
                  ? (editingTour ? 'Actualizando...' : 'Creando...') 
                  : (editingTour ? 'Actualizar Tour' : 'Crear Tour')
                }
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Duplicar Tour */}
      {duplicatingTour && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Duplicar Tour</h2>

            <form onSubmit={handleDuplicateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Tour *
                </label>
                <input
                  type="text"
                  value={duplicateFormData.name}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Inicio *
                </label>
                <input
                  type="date"
                  value={duplicateFormData.start_date}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, start_date: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Fin *
                </label>
                <input
                  type="date"
                  value={duplicateFormData.end_date}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, end_date: e.target.value })}
                  className="input"
                  min={duplicateFormData.start_date}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Límite de Reserva
                </label>
                <input
                  type="date"
                  value={duplicateFormData.booking_deadline}
                  onChange={(e) => setDuplicateFormData({ ...duplicateFormData, booking_deadline: e.target.value })}
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Si no se especifica, será 14 días antes del inicio
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleDuplicateCancel}
                  className="btn btn-outline"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                >
                  {isSubmitting ? 'Duplicando...' : 'Duplicar Tour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Tours */}
      {tours.length === 0 && !isLoading ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No tienes tours publicados</h3>
          <p className="text-gray-600 mb-6">
            Comienza creando tu primer tour para atraer viajeros a tu agencia.
          </p>
          <button
            onClick={handleCreate}
            className="btn btn-primary"
          >
            <Plus className="h-5 w-5 mr-2" />
            Crear Mi Primer Tour
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <div key={tour.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Imagen del Tour */}
              <div className="relative h-48">
                <img
                  src={tour.image_url}
                  alt={tour.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback image if the tour image fails to load
                    e.currentTarget.src = 'https://images.pexels.com/photos/1271619/pexels-photo-1271619.jpeg';
                  }}
                />
                <div className="absolute top-2 right-2">
                  {getStatusBadge(tour)}
                </div>
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-1 text-xs font-medium bg-black/60 text-white rounded">
                    {getCategoryNames(tour.category)}
                  </span>
                </div>
              </div>

              {/* Contenido del Tour */}
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-2 line-clamp-1">{tour.name}</h3>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    <span>{tour.destination}</span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{formatDate(tour.start_date)} - {formatDate(tour.end_date)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      <span>Máx {tour.max_travelers || 'Sin límite'}</span>
                    </div>
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 mr-1" />
                      <span className="font-semibold text-primary-600">${tour.price}</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {tour.description}
                </p>

                {/* Acciones */}
                <div className="flex justify-between items-center pt-3 border-t">
                  <div className="text-xs text-gray-500">
                    Creado: {formatDate(tour.created_at)}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => window.open(`/tours/${tour.id}`, '_blank')}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Ver tour"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(tour)}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Editar tour"
                      disabled={isSubmitting || isCreating || editingTour || duplicatingTour}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(tour)}
                      className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                      title="Duplicar tour"
                      disabled={isSubmitting || isCreating || editingTour || duplicatingTour}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tour.id, tour.name)}
                      className="p-2 text-gray-400 hover:text-error-600 transition-colors"
                      title="Eliminar tour"
                      disabled={isSubmitting || duplicatingTour}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyTours;