import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createTour, searchDestinations, supabase, updateTour, deleteTour, getAllDestinations, createDestination, getTourCategories } from '../../lib/supabase';
import { Plus, Search, X, CreditCard as Edit, Trash2, Eye, Calendar, MapPin, Users, DollarSign, Save, Minus, Upload, Copy, CalendarX, AlertCircle, XCircle, FileText, Image, CheckSquare, Tag, PawPrint, Clock, Settings, List, Ban, ShoppingBag, Info, Percent } from 'lucide-react';
import TourPromotionsManager from '../../components/TourPromotionsManager';

interface OptionalService {
  id?: string;
  name: string;
  description: string;
  price_per_person: string;
  max_capacity: string;
  is_refundable: boolean;
  is_active: boolean;
}
import { Tour, Destination, DeparturePoint } from '../../types';
import { format } from 'date-fns';
import ImageUploader from '../../components/ImageUploader';
import DeparturePointSelector from '../../components/DeparturePointSelector';
import DeparturePointForm from '../../components/DeparturePointForm';

interface TourCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface SelectedDeparturePoint extends DeparturePoint {
  display_order: number;
  departure_time?: string;
  special_instructions?: string;
}

const AgencyTours: React.FC = () => {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [categories, setCategories] = useState<TourCategory[]>([]);
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
  const [isAgencyApproved, setIsAgencyApproved] = useState(true);
  const [duplicateFormData, setDuplicateFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    booking_deadline: '',
  });

  const [rescheduleModal, setRescheduleModal] = useState<{
    open: boolean;
    tour: Tour | null;
    activeBookingsCount: number;
    isLoading: boolean;
    isSubmitting: boolean;
    error: string;
    success: boolean;
  }>({
    open: false,
    tour: null,
    activeBookingsCount: 0,
    isLoading: false,
    isSubmitting: false,
    error: '',
    success: false,
  });

  const [rescheduleFormData, setRescheduleFormData] = useState({
    new_start_date: '',
    new_end_date: '',
    reschedule_reason: '',
  });

  const [cancelModal, setCancelModal] = useState<{
    open: boolean;
    tour: Tour | null;
    activeBookingsCount: number;
    isLoading: boolean;
    isSubmitting: boolean;
    error: string;
    success: boolean;
  }>({
    open: false,
    tour: null,
    activeBookingsCount: 0,
    isLoading: false,
    isSubmitting: false,
    error: '',
    success: false,
  });

  const [cancelFormData, setCancelFormData] = useState({
    cancellation_reason: '',
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
    booking_deadline: '',
    booking_approval_type: 'automatic',
    cancellation_not_allowed: false,
    name_changes_not_allowed: false,
    pet_friendly: false,
    precio_adulto: '',
    precio_nino: '',
    precio_infante: '',
    precio_adulto_mayor: '',
    precio_mascota: '',
    admite_infantes: true,
    admite_ninos: true,
    admite_adultos: true,
    admite_adultos_mayores: true,
  });

  const [includes, setIncludes] = useState<string[]>(['']);
  const [excludes, setExcludes] = useState<string[]>(['']);
  const [departurePoints, setDeparturePoints] = useState<string[]>(['']);
  const [selectedDeparturePoints, setSelectedDeparturePoints] = useState<SelectedDeparturePoint[]>([]);
  const [showCreateDepartureForm, setShowCreateDepartureForm] = useState(false);
  const [tourImageData, setTourImageData] = useState<{base64: string, type: string, size: number} | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [optionalServices, setOptionalServices] = useState<OptionalService[]>([]);

  const DRAFT_KEY = `tour_draft_${user?.id}`;

  useEffect(() => {
    fetchAgencyTours();
    fetchAllDestinations();
    fetchCategories();
  }, [user?.id]);

  // Restaurar borrador al cargar
  useEffect(() => {
    if (!user) return;

    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft && !editingTour && !isCreating) {
      try {
        const draft = JSON.parse(savedDraft);
        const draftAge = Date.now() - draft.timestamp;
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 días

        if (draftAge < maxAge) {
          setHasDraft(true);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch (error) {
        console.error('Error loading draft:', error);
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, [user, DRAFT_KEY, editingTour, isCreating]);

  // Autoguardar borrador
  useEffect(() => {
    if (!isCreating || !user) return;

    const hasContent = formData.name ||
                      formData.description ||
                      formData.itinerary ||
                      selectedDestinations.length > 0 ||
                      selectedDeparturePoints.length > 0;

    if (!hasContent) return;

    const draft = {
      formData,
      includes,
      excludes,
      selectedDestinations,
      selectedDeparturePoints,
      timestamp: Date.now(),
    };

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCreating, formData, includes, excludes, selectedDestinations, selectedDeparturePoints, user, DRAFT_KEY]);

  // Prevenir pérdida de datos al salir de la página
  useEffect(() => {
    if (!isCreating) return;

    const hasContent = formData.name ||
                      formData.description ||
                      formData.itinerary ||
                      selectedDestinations.length > 0 ||
                      selectedDeparturePoints.length > 0;

    if (!hasContent) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCreating, formData, selectedDestinations, selectedDeparturePoints]);

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

  const fetchCategories = async () => {
    try {
      const { data, error } = await getTourCategories();
      if (error) throw error;
      setCategories(data || []);

      // Si hay categorías y el formData aún tiene el valor por defecto, actualizar
      if (data && data.length > 0 && formData.category[0] === 'adventure') {
        setFormData(prev => ({
          ...prev,
          category: [data[0].slug]
        }));
      }
    } catch (err: any) {
      console.error('❌ Error cargando categorías:', err);
    }
  };

  const fetchAgencyTours = async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');

      console.log('🎯 Cargando tours de la agencia para usuario:', user.id);

      // Verificar si la agencia está aprobada
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_approved')
        .eq('id', user.id)
        .maybeSingle();

      if (!userError && userData) {
        setIsAgencyApproved(userData.is_approved !== false);
      }

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
      category: categories.length > 0 ? [categories[0].slug] : [],
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
      pet_friendly: false,
      precio_adulto: '',
      precio_nino: '',
      precio_infante: '',
      precio_adulto_mayor: '',
      precio_mascota: '',
      admite_infantes: true,
      admite_ninos: true,
      admite_adultos: true,
      admite_adultos_mayores: true,
    });
    setSelectedDestinations([]);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setIncludes(['']);
    setExcludes(['']);
    setDeparturePoints(['']);
    setSelectedDeparturePoints([]);
    setTourImageData(null);
    setOptionalServices([]);

    // Limpiar borrador guardado
    if (user) {
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
    }
  };

  const loadDraft = () => {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        setFormData(draft.formData);
        setIncludes(draft.includes || ['']);
        setExcludes(draft.excludes || ['']);
        setSelectedDestinations(draft.selectedDestinations || []);
        setSelectedDeparturePoints(draft.selectedDeparturePoints || []);
        setHasDraft(false);
        setIsCreating(true);
      } catch (error) {
        console.error('Error loading draft:', error);
        localStorage.removeItem(DRAFT_KEY);
        setHasDraft(false);
      }
    }
  };

  const discardDraft = () => {
    if (confirm('¿Estás seguro de que deseas descartar el borrador guardado?')) {
      localStorage.removeItem(DRAFT_KEY);
      setHasDraft(false);
    }
  };

  const handleCreate = () => {
    if (!isAgencyApproved) {
      alert('Su cuenta se encuentra en proceso de validación. Para mayor información o agilizar el proceso, contáctenos a contacto@toursred.com');
      return;
    }
    resetForm();
    setIsCreating(true);
    setEditingTour(null);
  };

  const handleEdit = async (tour: Tour) => {
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
      cancellation_not_allowed: tour.cancellation_not_allowed || false,
      name_changes_not_allowed: tour.name_changes_not_allowed || false,
      pet_friendly: tour.pet_friendly || false,
      precio_adulto: tour.precio_adulto?.toString() || '',
      precio_nino: tour.precio_nino?.toString() || '',
      precio_infante: tour.precio_infante?.toString() || '',
      precio_adulto_mayor: tour.precio_adulto_mayor?.toString() || '',
      precio_mascota: tour.precio_mascota?.toString() || '',
      admite_infantes: tour.admite_infantes !== undefined ? tour.admite_infantes : true,
      admite_ninos: tour.admite_ninos !== undefined ? tour.admite_ninos : true,
      admite_adultos: tour.admite_adultos !== undefined ? tour.admite_adultos : true,
      admite_adultos_mayores: tour.admite_adultos_mayores !== undefined ? tour.admite_adultos_mayores : true,
    });
    setSelectedDestinations(selectedDest);
    setIncludes(tour.includes && tour.includes.length > 0 ? tour.includes : ['']);
    setExcludes(tour.excludes && tour.excludes.length > 0 ? tour.excludes : ['']);
    setDeparturePoints(tour.departure_points && tour.departure_points.length > 0 ? tour.departure_points : ['']);

    // Load departure points from database
    try {
      const { data: tourDeparturePoints, error } = await supabase
        .from('tour_departure_points')
        .select(`
          id,
          display_order,
          departure_time,
          special_instructions,
          departure_points (
            id,
            name,
            city,
            municipality,
            google_maps_url,
            is_active,
            usage_count,
            created_at,
            updated_at
          )
        `)
        .eq('tour_id', tour.id)
        .order('display_order');

      if (!error && tourDeparturePoints) {
        const selectedPoints: SelectedDeparturePoint[] = tourDeparturePoints
          .filter(tdp => tdp.departure_points)
          .map(tdp => ({
            ...(tdp.departure_points as DeparturePoint),
            display_order: tdp.display_order,
            departure_time: tdp.departure_time || undefined,
            special_instructions: tdp.special_instructions || undefined,
          }));
        setSelectedDeparturePoints(selectedPoints);
      }
    } catch (err) {
      console.error('Error loading departure points:', err);
    }

    setTourImageData(null); // Reset image data when editing

    // Load optional services for this tour
    try {
      const { data: servicesData } = await supabase
        .from('tour_optional_services')
        .select('*')
        .eq('tour_id', tour.id)
        .order('display_order');

      if (servicesData) {
        setOptionalServices(servicesData.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          price_per_person: s.price_per_person.toString(),
          max_capacity: s.max_capacity ? s.max_capacity.toString() : '',
          is_refundable: s.is_refundable,
          is_active: s.is_active,
        })));
      } else {
        setOptionalServices([]);
      }
    } catch (err) {
      console.error('Error loading optional services:', err);
      setOptionalServices([]);
    }

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
        cancellation_not_allowed: duplicatingTour.cancellation_not_allowed || false,
        name_changes_not_allowed: duplicatingTour.name_changes_not_allowed || false,
        pet_friendly: duplicatingTour.pet_friendly || false,
        precio_adulto: duplicatingTour.precio_adulto || null,
        precio_nino: duplicatingTour.precio_nino || null,
        precio_infante: duplicatingTour.precio_infante || null,
        precio_adulto_mayor: duplicatingTour.precio_adulto_mayor || null,
        precio_mascota: duplicatingTour.precio_mascota || null,
        admite_infantes: duplicatingTour.admite_infantes !== undefined ? duplicatingTour.admite_infantes : true,
        admite_ninos: duplicatingTour.admite_ninos !== undefined ? duplicatingTour.admite_ninos : true,
        admite_adultos: duplicatingTour.admite_adultos !== undefined ? duplicatingTour.admite_adultos : true,
        admite_adultos_mayores: duplicatingTour.admite_adultos_mayores !== undefined ? duplicatingTour.admite_adultos_mayores : true,
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

  const handleOpenReschedule = async (tour: Tour) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(tour.start_date + 'T00:00:00');
    startDate.setHours(0, 0, 0, 0);

    if (startDate < today) {
      alert('No puedes reagendar un tour que ya ha iniciado o finalizado.');
      return;
    }

    const daysUntilStart = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart < 2) {
      alert('No puedes reagendar un tour con menos de 48 horas (2 días) de anticipación.');
      return;
    }

    setRescheduleModal({
      open: true,
      tour,
      activeBookingsCount: 0,
      isLoading: true,
      isSubmitting: false,
      error: '',
      success: false,
    });

    const minNewDate = new Date();
    minNewDate.setDate(minNewDate.getDate() + 4);

    setRescheduleFormData({
      new_start_date: minNewDate.toISOString().split('T')[0],
      new_end_date: '',
      reschedule_reason: '',
    });

    try {
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('tour_id', tour.id)
        .in('status', ['confirmed', 'pending']);

      if (error) throw error;

      setRescheduleModal(prev => ({
        ...prev,
        activeBookingsCount: count || 0,
        isLoading: false,
      }));
    } catch (err: any) {
      console.error('Error loading bookings count:', err);
      setRescheduleModal(prev => ({
        ...prev,
        error: 'Error al cargar el número de reservas',
        isLoading: false,
      }));
    }
  };

  const handleCloseReschedule = () => {
    setRescheduleModal({
      open: false,
      tour: null,
      activeBookingsCount: 0,
      isLoading: false,
      isSubmitting: false,
      error: '',
      success: false,
    });
    setRescheduleFormData({
      new_start_date: '',
      new_end_date: '',
      reschedule_reason: '',
    });
  };

  const handleSubmitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rescheduleModal.tour || !user) return;

    const today = new Date();
    const newStartDate = new Date(rescheduleFormData.new_start_date);
    const daysUntilNewStart = (newStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilNewStart < 4) {
      setRescheduleModal(prev => ({
        ...prev,
        error: 'La nueva fecha debe ser al menos 4 días en el futuro',
      }));
      return;
    }

    if (rescheduleFormData.reschedule_reason.trim().length < 20) {
      setRescheduleModal(prev => ({
        ...prev,
        error: 'El motivo del reagendamiento debe tener al menos 20 caracteres y ser descriptivo',
      }));
      return;
    }

    if (!rescheduleFormData.new_end_date) {
      setRescheduleModal(prev => ({
        ...prev,
        error: 'Debe especificar la fecha de finalización',
      }));
      return;
    }

    setRescheduleModal(prev => ({
      ...prev,
      isSubmitting: true,
      error: '',
    }));

    try {
      const { data, error } = await supabase.functions.invoke('process-tour-reschedule', {
        body: {
          tour_id: rescheduleModal.tour.id,
          new_start_date: rescheduleFormData.new_start_date,
          new_end_date: rescheduleFormData.new_end_date,
          reason: rescheduleFormData.reschedule_reason.trim(),
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data && !data.success) {
        console.error('Function returned error:', data);
        throw new Error(data.error || 'Error al procesar el reagendamiento');
      }

      setRescheduleModal(prev => ({
        ...prev,
        isSubmitting: false,
        success: true,
      }));

      setTimeout(() => {
        handleCloseReschedule();
        fetchAgencyTours();
      }, 2000);
    } catch (err: any) {
      console.error('Error rescheduling tour:', err);
      const errorMessage = err.message || err.error || 'Error al procesar el reagendamiento';
      setRescheduleModal(prev => ({
        ...prev,
        isSubmitting: false,
        error: errorMessage,
      }));
    }
  };

  const handleOpenCancel = async (tour: Tour) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(tour.start_date + 'T00:00:00');
    startDate.setHours(0, 0, 0, 0);

    if (startDate <= today) {
      alert('No puedes cancelar un tour que ya ha iniciado o finalizado.');
      return;
    }

    if (tour.cancelled_by_agency) {
      alert('Este tour ya fue cancelado por la agencia.');
      return;
    }

    setCancelModal({
      open: true,
      tour,
      activeBookingsCount: 0,
      isLoading: true,
      isSubmitting: false,
      error: '',
      success: false,
    });

    setCancelFormData({
      cancellation_reason: '',
    });

    try {
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('tour_id', tour.id)
        .in('status', ['confirmed', 'pending'])
        .eq('payment_status', 'succeeded')
        .is('cancelled_at', null);

      if (error) throw error;

      if (count === 0) {
        setCancelModal(prev => ({
          ...prev,
          error: 'No hay reservas activas para cancelar en este tour',
          isLoading: false,
        }));
        return;
      }

      setCancelModal(prev => ({
        ...prev,
        activeBookingsCount: count || 0,
        isLoading: false,
      }));
    } catch (err: any) {
      console.error('Error loading bookings count:', err);
      setCancelModal(prev => ({
        ...prev,
        error: 'Error al cargar el número de reservas',
        isLoading: false,
      }));
    }
  };

  const handleCloseCancel = () => {
    setCancelModal({
      open: false,
      tour: null,
      activeBookingsCount: 0,
      isLoading: false,
      isSubmitting: false,
      error: '',
      success: false,
    });
    setCancelFormData({
      cancellation_reason: '',
    });
  };

  const handleSubmitCancel = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cancelModal.tour || !user) return;

    if (cancelFormData.cancellation_reason.trim().length < 50) {
      setCancelModal(prev => ({
        ...prev,
        error: 'El motivo de cancelación debe tener al menos 50 caracteres y ser descriptivo',
      }));
      return;
    }

    setCancelModal(prev => ({
      ...prev,
      isSubmitting: true,
      error: '',
    }));

    try {
      const { data, error } = await supabase.functions.invoke('process-tour-cancellation', {
        body: {
          tour_id: cancelModal.tour.id,
          cancellation_reason: cancelFormData.cancellation_reason.trim(),
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data && !data.success) {
        console.error('Function returned error:', data);
        throw new Error(data.error || 'Error al procesar la cancelación');
      }

      setCancelModal(prev => ({
        ...prev,
        isSubmitting: false,
        success: true,
      }));

      setTimeout(() => {
        handleCloseCancel();
        fetchAgencyTours();
      }, 2500);
    } catch (err: any) {
      console.error('Error cancelling tour:', err);
      const errorMessage = err.message || err.error || 'Error al procesar la cancelación del tour';
      setCancelModal(prev => ({
        ...prev,
        isSubmitting: false,
        error: errorMessage,
      }));
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

  const addOptionalService = () => {
    setOptionalServices([...optionalServices, {
      name: '',
      description: '',
      price_per_person: '',
      max_capacity: '',
      is_refundable: true,
      is_active: true,
    }]);
  };

  const removeOptionalService = (index: number) => {
    setOptionalServices(optionalServices.filter((_, i) => i !== index));
  };

  const updateOptionalService = (index: number, field: keyof OptionalService, value: any) => {
    const updated = [...optionalServices];
    updated[index] = { ...updated[index], [field]: value };
    setOptionalServices(updated);
  };

  const handleDeparturePointChange = (index: number, value: string) => {
    const newDeparturePoints = [...departurePoints];
    newDeparturePoints[index] = value;
    setDeparturePoints(newDeparturePoints);
  };

  const addDeparturePoint = () => {
    setDeparturePoints([...departurePoints, '']);
  };

  const removeDeparturePoint = (index: number) => {
    if (departurePoints.length > 1) {
      setDeparturePoints(departurePoints.filter((_, i) => i !== index));
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

      // Validar porcentaje de depósito
      const depositPercentage = parseInt(formData.deposit_percentage);
      if (depositPercentage < 30) {
        throw new Error('El porcentaje de anticipo no puede ser menor al 30%');
      }
      if (depositPercentage > 100) {
        throw new Error('El porcentaje de anticipo no puede ser mayor al 100%');
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

      // Filtrar includes, excludes y departure_points vacíos
      const filteredIncludes = includes.filter(item => item.trim() !== '');
      const filteredExcludes = excludes.filter(item => item.trim() !== '');
      const filteredDeparturePoints = departurePoints.filter(item => item.trim() !== '');

      // Validar departure points (nuevo sistema)
      if (selectedDeparturePoints.length === 0) {
        throw new Error('Debe seleccionar al menos 1 punto de salida para el tour');
      }

      if (selectedDeparturePoints.length > 4) {
        throw new Error('No puedes seleccionar más de 4 puntos de salida para el tour');
      }

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
        departure_points: filteredDeparturePoints,
        booking_deadline: bookingDeadline,
        booking_approval_type: formData.booking_approval_type,
        cancellation_not_allowed: formData.cancellation_not_allowed,
        name_changes_not_allowed: formData.name_changes_not_allowed,
        pet_friendly: formData.pet_friendly,
        precio_adulto: formData.precio_adulto ? parseFloat(formData.precio_adulto) : null,
        precio_nino: formData.precio_nino ? parseFloat(formData.precio_nino) : null,
        precio_infante: formData.precio_infante ? parseFloat(formData.precio_infante) : null,
        precio_adulto_mayor: formData.precio_adulto_mayor ? parseFloat(formData.precio_adulto_mayor) : null,
        precio_mascota: formData.precio_mascota ? parseFloat(formData.precio_mascota) : null,
        admite_infantes: formData.admite_infantes,
        admite_ninos: formData.admite_ninos,
        admite_adultos: formData.admite_adultos,
        admite_adultos_mayores: formData.admite_adultos_mayores,
      };

      let tourId: string;
      let createdTour: any = null;

      if (editingTour) {
        // Actualizar tour existente
        const { error } = await updateTour(editingTour.id, tourData);
        if (error) throw error;
        tourId = editingTour.id;
        console.log('✅ Tour actualizado correctamente');
      } else {
        // Crear nuevo tour
        const { data: newTour, error } = await createTour(tourData, processedDestinations, user.id);
        if (error) throw error;
        tourId = newTour.id;
        createdTour = newTour;
        console.log('✅ Tour creado correctamente');
      }

      // Guardar departure points
      console.log('📍 Guardando puntos de salida...');

      // Validar que no haya duplicados en selectedDeparturePoints
      const uniquePoints = selectedDeparturePoints.filter((point, index, self) =>
        index === self.findIndex((p) => p.id === point.id)
      );

      if (uniquePoints.length !== selectedDeparturePoints.length) {
        console.warn('⚠️ Se encontraron puntos duplicados, removiendo...');
      }

      if (editingTour) {
        // Para tours existentes: actualizar de forma inteligente
        // 1. Obtener puntos existentes
        const { data: existingPoints } = await supabase
          .from('tour_departure_points')
          .select('departure_point_id, display_order')
          .eq('tour_id', tourId);

        const existingPointIds = new Set(existingPoints?.map(p => p.departure_point_id) || []);
        const newPointIds = new Set(uniquePoints.map(p => p.id));

        // 2. Identificar puntos a insertar (nuevos)
        const pointsToInsert = uniquePoints
          .filter(point => !existingPointIds.has(point.id))
          .map((point, index) => ({
            tour_id: tourId,
            departure_point_id: point.id,
            display_order: uniquePoints.findIndex(p => p.id === point.id) + 1,
            departure_time: point.departure_time || null,
            special_instructions: point.special_instructions || null,
          }));

        // 3. Identificar puntos a eliminar (ya no seleccionados)
        const pointIdsToDelete = Array.from(existingPointIds)
          .filter(id => !newPointIds.has(id));

        // 4. Insertar nuevos puntos primero
        if (pointsToInsert.length > 0) {
          console.log('📍 Insertando nuevos puntos:', pointsToInsert);
          const { error: insertError } = await supabase
            .from('tour_departure_points')
            .insert(pointsToInsert);

          if (insertError) {
            console.error('❌ Error insertando nuevos puntos:', insertError);
            throw new Error(`Error guardando puntos de salida: ${insertError.message}`);
          }
        }

        // 5. Eliminar puntos obsoletos (si hay)
        if (pointIdsToDelete.length > 0) {
          console.log('🗑️ Eliminando puntos obsoletos:', pointIdsToDelete);
          const { error: deleteError } = await supabase
            .from('tour_departure_points')
            .delete()
            .eq('tour_id', tourId)
            .in('departure_point_id', pointIdsToDelete);

          if (deleteError) {
            console.error('❌ Error eliminando puntos obsoletos:', deleteError);
            throw new Error(`Error eliminando puntos de salida: ${deleteError.message}`);
          }
        }

        // 6. Actualizar display_order, departure_time y special_instructions de todos los puntos
        for (let i = 0; i < uniquePoints.length; i++) {
          const point = uniquePoints[i];
          const { error: updateError } = await supabase
            .from('tour_departure_points')
            .update({
              display_order: i + 1,
              departure_time: point.departure_time || null,
              special_instructions: point.special_instructions || null
            })
            .eq('tour_id', tourId)
            .eq('departure_point_id', point.id);

          if (updateError) {
            console.error('❌ Error actualizando punto de salida:', updateError);
          }
        }

        console.log(`✅ Puntos de salida actualizados correctamente`);
      } else {
        // Para tours nuevos: insertar directamente
        const departurePointsToInsert = uniquePoints.map((point, index) => ({
          tour_id: tourId,
          departure_point_id: point.id,
          display_order: index + 1,
          departure_time: point.departure_time || null,
          special_instructions: point.special_instructions || null,
        }));

        console.log('📍 Insertando puntos:', departurePointsToInsert);

        const { error: insertError } = await supabase
          .from('tour_departure_points')
          .insert(departurePointsToInsert);

        if (insertError) {
          console.error('❌ Error guardando puntos de salida:', insertError);
          throw new Error(`Error guardando puntos de salida: ${insertError.message}`);
        }

        console.log(`✅ ${departurePointsToInsert.length} puntos de salida guardados correctamente`);
      }

      // Save optional services
      const validServices = optionalServices.filter(s => s.name.trim() && s.price_per_person);
      if (editingTour) {
        const { data: existingServices } = await supabase
          .from('tour_optional_services')
          .select('id')
          .eq('tour_id', tourId);

        const existingIds = new Set(existingServices?.map(s => s.id) || []);
        const incomingIds = new Set(validServices.filter(s => s.id).map(s => s.id!));

        const toDelete = Array.from(existingIds).filter(id => !incomingIds.has(id));
        if (toDelete.length > 0) {
          await supabase.from('tour_optional_services').delete().in('id', toDelete);
        }

        for (let i = 0; i < validServices.length; i++) {
          const svc = validServices[i];
          const payload = {
            tour_id: tourId,
            name: svc.name.trim(),
            description: svc.description.trim() || null,
            price_per_person: parseFloat(svc.price_per_person),
            max_capacity: svc.max_capacity ? parseInt(svc.max_capacity) : null,
            is_refundable: svc.is_refundable,
            is_active: svc.is_active,
            display_order: i + 1,
            updated_at: new Date().toISOString(),
          };
          if (svc.id) {
            await supabase.from('tour_optional_services').update(payload).eq('id', svc.id);
          } else {
            await supabase.from('tour_optional_services').insert(payload);
          }
        }
      } else if (validServices.length > 0) {
        const toInsert = validServices.map((svc, i) => ({
          tour_id: tourId,
          name: svc.name.trim(),
          description: svc.description.trim() || null,
          price_per_person: parseFloat(svc.price_per_person),
          max_capacity: svc.max_capacity ? parseInt(svc.max_capacity) : null,
          is_refundable: svc.is_refundable,
          is_active: svc.is_active,
          display_order: i + 1,
        }));
        await supabase.from('tour_optional_services').insert(toInsert);
      }

      // Recargar destinos disponibles después de crear nuevos
      await fetchAllDestinations();

      // Recargar tours después de crear/actualizar
      await fetchAgencyTours();

      if (createdTour) {
        // Después de crear, pasar a modo edición para configurar promociones grupales
        localStorage.removeItem(DRAFT_KEY);
        setIsCreating(false);
        const { data: freshTour } = await supabase.from('tours').select('*').eq('id', createdTour.id).single();
        setEditingTour(freshTour || createdTour);
      } else {
        handleCancel();
      }

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

  const getCategoryName = (categorySlug: string) => {
    const category = categories.find(c => c.slug === categorySlug);
    return category ? category.name : categorySlug;
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
          onClick={isCreating ? handleCancel : handleCreate}
          className={isCreating ? "btn btn-outline" : "btn btn-primary"}
          disabled={editingTour}
        >
          {isCreating ? (
            <>
              <X className="h-5 w-5 mr-2" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="h-5 w-5 mr-2" />
              Crear Nuevo Tour
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error-50 text-error-600 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Mensaje de Borrador Guardado */}
      {hasDraft && !isCreating && !editingTour && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Save className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 mb-1">
                Borrador guardado
              </h3>
              <p className="text-sm text-blue-800 mb-3">
                Tienes un borrador de tour sin terminar. ¿Deseas continuar editándolo o descartarlo?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={loadDraft}
                  className="btn btn-primary btn-sm"
                >
                  Continuar editando
                </button>
                <button
                  onClick={discardDraft}
                  className="btn btn-outline btn-sm"
                >
                  Descartar borrador
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulario de Crear/Editar */}
      {(isCreating || editingTour) && (
        <div className="mb-6 space-y-5">
          {/* Header del formulario */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingTour ? `Editando: ${editingTour.name}` : 'Crear Nuevo Tour'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Completa cada sección para publicar tu tour</p>
              </div>
              {isCreating && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                  <Save className="w-4 h-4" />
                  <span>Borrador guardado automáticamente</span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* SECCIÓN 1 — Información General */}
            <div className="bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
              <div className="bg-blue-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 1 — Información General</h3>
                  <p className="text-blue-100 text-xs">Nombre, categoría y descripción del tour</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Requerido</span>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Nombre del Tour <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="input"
                    placeholder="Ej: Tour Mágico por Oaxaca 3 días"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Categorías <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs font-normal text-gray-500">Selecciona al menos una</span>
                  </label>
                  {categories.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Cargando categorías...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => {
                        const isSelected = formData.category.includes(cat.slug);
                        return (
                          <button
                            key={cat.slug}
                            type="button"
                            onClick={() => handleCategoryToggle(cat.slug)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                            }`}
                          >
                            <Tag className="w-3 h-3" />
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {formData.category.length === 0 && (
                    <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      Debes seleccionar al menos una categoría
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Descripción <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="input"
                    rows={3}
                    placeholder="Describe brevemente qué hace especial a este tour..."
                    required
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2 — Fechas y Destinos */}
            <div className="bg-white rounded-xl shadow-sm border border-teal-100 overflow-hidden">
              <div className="bg-teal-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 2 — Fechas y Destinos</h3>
                  <p className="text-teal-100 text-xs">¿Cuándo sale y a dónde va el tour?</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Requerido</span>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Fecha de Inicio <span className="text-red-500">*</span>
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
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Fecha de Fin <span className="text-red-500">*</span>
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

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Destinos <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs font-normal text-gray-500">Escribe y presiona Enter para agregar</span>
                  </label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {selectedDestinations.map((destination) => (
                      <span
                        key={destination.id}
                        className="inline-flex items-center bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-sm font-medium"
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        {destination.name}
                        <button
                          type="button"
                          onClick={() => removeDestination(destination.id)}
                          className="ml-2 text-teal-600 hover:text-teal-900 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="relative">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="input flex-1"
                        placeholder="Ej: Cancún, Oaxaca, Los Cabos..."
                      />
                      <button
                        type="button"
                        onClick={addDestinationFromInput}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-1.5 font-medium text-sm transition-colors"
                        disabled={!searchQuery.trim()}
                      >
                        <Plus className="h-4 w-4" />
                        Agregar
                      </button>
                    </div>
                    {showSearchResults && searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200">
                        <div className="py-1">
                          <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50 rounded-t-lg">
                            Destinos existentes
                          </div>
                          {searchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm flex items-center gap-2"
                              onClick={() => addDestination(result.name)}
                            >
                              <MapPin className="w-3.5 h-3.5 text-teal-500" />
                              {result.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {selectedDestinations.length === 0 && (
                    <p className="text-sm text-red-500 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      Debe seleccionar al menos un destino
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    Si el destino no existe en el sistema, se creará automáticamente al guardar el tour.
                  </p>
                </div>

                <div>
                  <DeparturePointSelector
                    selectedPoints={selectedDeparturePoints}
                    onPointsChange={setSelectedDeparturePoints}
                    onCreateNew={() => setShowCreateDepartureForm(true)}
                    maxPoints={4}
                    minPoints={1}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3 — Itinerario e Imagen */}
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
              <div className="bg-amber-500 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <Image className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 3 — Itinerario e Imagen</h3>
                  <p className="text-amber-100 text-xs">Detalla el recorrido y agrega una foto atractiva</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Requerido</span>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Itinerario Detallado <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.itinerary}
                    onChange={(e) => setFormData({...formData, itinerary: e.target.value})}
                    className="input"
                    rows={6}
                    placeholder="Día 1: Llegada al destino, traslado al hotel...&#10;Día 2: Visita a sitios turísticos...&#10;Día 3: Actividades y regreso..."
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Qué Incluye
                    </label>
                    <div className="space-y-2">
                      {includes.map((include, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-green-600 text-xs font-bold">+</span>
                          </div>
                          <input
                            type="text"
                            value={include}
                            onChange={(e) => handleIncludeChange(index, e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="Ej: Alojamiento por 3 noches"
                          />
                          {includes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeInclude(index)}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addInclude}
                        className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-4 h-4" /> Agregar elemento
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Qué NO Incluye
                    </label>
                    <div className="space-y-2">
                      {excludes.map((exclude, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-500 text-xs font-bold">−</span>
                          </div>
                          <input
                            type="text"
                            value={exclude}
                            onChange={(e) => handleExcludeChange(index, e.target.value)}
                            className="input flex-1 text-sm"
                            placeholder="Ej: Vuelos de llegada y salida"
                          />
                          {excludes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeExclude(index)}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addExclude}
                        className="text-red-500 hover:text-red-600 text-sm font-medium flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-4 h-4" /> Agregar elemento
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Imagen Principal del Tour <span className="text-red-500">*</span>
                  </label>
                  <ImageUploader
                    onImageSelect={handleImageSelect}
                    currentImage={formData.image_url}
                    maxSizeMB={5}
                    placeholder="Subir imagen del tour"
                  />
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">O pega una URL de imagen</label>
                    <input
                      type="url"
                      value={tourImageData ? '' : formData.image_url}
                      onChange={(e) => {
                        setFormData({...formData, image_url: e.target.value});
                        if (e.target.value) setTourImageData(null);
                      }}
                      className="input text-sm"
                      placeholder="https://ejemplo.com/imagen.jpg"
                      disabled={!!tourImageData}
                    />
                    {tourImageData && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5" />
                        Imagen subida correctamente
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN 4 — Precios */}
            <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
              <div className="bg-green-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 4 — Precios</h3>
                  <p className="text-green-100 text-xs">Precio base, depósito y tarifas por tipo de viajero</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Requerido</span>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Precio Base del Tour (MXN) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                      <input
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: e.target.value})}
                        className="input pl-7"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Precio de referencia si no defines tarifas por categoría</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Porcentaje de Anticipo <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={formData.deposit_percentage}
                        onChange={(e) => setFormData({...formData, deposit_percentage: e.target.value})}
                        className="input pr-8"
                        min="30"
                        max="100"
                        placeholder="30"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Mínimo 30% — Máximo 100%</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600" />
                    Tarifas por Categoría de Viajero
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'admite_adultos', priceKey: 'precio_adulto', label: 'Adultos', age: '13-59 años', color: 'blue' },
                      { key: 'admite_ninos', priceKey: 'precio_nino', label: 'Niños', age: '3-12 años', color: 'yellow' },
                      { key: 'admite_infantes', priceKey: 'precio_infante', label: 'Infantes', age: '0-2 años', color: 'pink' },
                      { key: 'admite_adultos_mayores', priceKey: 'precio_adulto_mayor', label: 'Adultos Mayores', age: '60+ con INAPAM', color: 'orange' },
                    ].map(({ key, priceKey, label, age, color }) => {
                      const isAdmitted = formData[key as keyof typeof formData] as boolean;
                      const colorMap: Record<string, string> = {
                        blue: 'border-blue-200 bg-blue-50',
                        yellow: 'border-yellow-200 bg-yellow-50',
                        pink: 'border-pink-200 bg-pink-50',
                        orange: 'border-orange-200 bg-orange-50',
                      };
                      const checkMap: Record<string, string> = {
                        blue: 'text-blue-600',
                        yellow: 'text-yellow-600',
                        pink: 'text-pink-600',
                        orange: 'text-orange-600',
                      };
                      return (
                        <div key={key} className={`rounded-lg border-2 p-3 transition-all ${isAdmitted ? colorMap[color] : 'border-gray-200 bg-gray-50'}`}>
                          <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              checked={isAdmitted}
                              onChange={(e) => setFormData({...formData, [key]: e.target.checked})}
                              className={`w-4 h-4 border-gray-300 rounded focus:ring-2 ${checkMap[color]}`}
                            />
                            <div>
                              <span className={`text-sm font-semibold ${isAdmitted ? 'text-gray-800' : 'text-gray-500'}`}>{label}</span>
                              <span className="ml-1.5 text-xs text-gray-400">({age})</span>
                            </div>
                          </label>
                          {isAdmitted && (
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                value={formData[priceKey as keyof typeof formData] as string}
                                onChange={(e) => setFormData({...formData, [priceKey]: e.target.value})}
                                className="input pl-7 text-sm py-2"
                                min="0"
                                step="0.01"
                                placeholder="Precio por persona"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Si no especificas un precio, se usará el precio base como referencia.
                  </p>
                </div>

                {/* Pet Friendly dentro de precios */}
                <div className={`rounded-xl border-2 p-4 transition-all ${formData.pet_friendly ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.pet_friendly}
                      onChange={(e) => setFormData({...formData, pet_friendly: e.target.checked})}
                      className="w-5 h-5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                    />
                    <div className="flex items-center gap-2">
                      <PawPrint className={`w-5 h-5 ${formData.pet_friendly ? 'text-emerald-600' : 'text-gray-400'}`} />
                      <div>
                        <span className={`text-sm font-semibold ${formData.pet_friendly ? 'text-emerald-800' : 'text-gray-600'}`}>
                          Este tour es Pet Friendly (admite mascotas)
                        </span>
                        <p className="text-xs text-gray-500">Activa esta opción si el tour permite llevar mascotas</p>
                      </div>
                    </div>
                  </label>
                  {formData.pet_friendly && (
                    <div className="mt-3 ml-8">
                      <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Costo adicional por mascota (MXN)</label>
                      <div className="relative max-w-xs">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={formData.precio_mascota}
                          onChange={(e) => setFormData({...formData, precio_mascota: e.target.value})}
                          className="input pl-7 text-sm"
                          min="0"
                          step="0.01"
                          placeholder="0.00 — gratis si se deja vacío"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECCIÓN 5 — Capacidad y Reservas */}
            <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden">
              <div className="bg-rose-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 5 — Capacidad y Reservas</h3>
                  <p className="text-rose-100 text-xs">Cuántas personas y cómo se gestionan las reservas</p>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Tamaño Máximo del Grupo
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={formData.max_travelers}
                        onChange={(e) => setFormData({...formData, max_travelers: e.target.value})}
                        className="input pl-9"
                        min="1"
                        placeholder="Ej: 20"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Capacidad total del tour</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Lugares Disponibles para Reserva
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        value={formData.available_spots}
                        onChange={(e) => setFormData({...formData, available_spots: e.target.value})}
                        className="input pl-9"
                        min="0"
                        max={formData.max_travelers || undefined}
                        placeholder="Deja vacío para usar el máximo"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Útil si ya tienes reservas previas o cupos comprometidos</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Fecha Límite de Reserva
                    </label>
                    <input
                      type="date"
                      value={formData.booking_deadline}
                      onChange={(e) => setFormData({...formData, booking_deadline: e.target.value})}
                      className="input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Por defecto: 14 días antes del inicio</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Tipo de Reserva <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.booking_approval_type}
                      onChange={(e) => setFormData({...formData, booking_approval_type: e.target.value as 'automatic' | 'manual'})}
                      className="input"
                      required
                    >
                      <option value="automatic">Automática (pago inmediato)</option>
                      <option value="manual">Con aprobación manual (sin cargo inicial)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.booking_approval_type === 'automatic'
                        ? 'El viajero paga el anticipo en el momento de reservar'
                        : 'Tú apruebas cada reserva antes de que el viajero pague'
                      }
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Ban className="w-4 h-4 text-rose-500" />
                    Restricciones del Tour
                  </h4>
                  <div className={`rounded-xl border-2 p-4 transition-all ${formData.cancellation_not_allowed ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.cancellation_not_allowed}
                        onChange={(e) => setFormData({...formData, cancellation_not_allowed: e.target.checked})}
                        className="w-5 h-5 mt-0.5 text-red-600 border-gray-300 rounded focus:ring-red-500 flex-shrink-0"
                      />
                      <div>
                        <span className={`text-sm font-semibold ${formData.cancellation_not_allowed ? 'text-red-800' : 'text-gray-700'}`}>
                          Este tour NO permite cancelaciones con reembolso
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          Los viajeros solo podrán cancelar para evitar la penalización de No Show. Esta restricción será visible en la página del tour.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className={`rounded-xl border-2 p-4 transition-all ${formData.name_changes_not_allowed ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.name_changes_not_allowed}
                        onChange={(e) => setFormData({...formData, name_changes_not_allowed: e.target.checked})}
                        className="w-5 h-5 mt-0.5 text-orange-600 border-gray-300 rounded focus:ring-orange-500 flex-shrink-0"
                      />
                      <div>
                        <span className={`text-sm font-semibold ${formData.name_changes_not_allowed ? 'text-orange-800' : 'text-gray-700'}`}>
                          Este tour NO permite cambios de nombre una vez pagada la reserva
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          Ideal para tours aéreos o con boletos nominales. El viajero verá una advertencia al capturar los nombres de los acompañantes.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN 6 — Servicios Opcionales */}
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
              <div className="bg-amber-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 6 — Servicios Opcionales</h3>
                  <p className="text-amber-100 text-xs">Extras que el viajero puede agregar al reservar (boletos, snorkel, cenas, etc.)</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Opcional</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>
                    Agrega servicios extras con precio y cupo propio. Si el <strong>viajero</strong> cancela, los servicios marcados como <em>no reembolsables</em> no se devuelven. Si <strong>tú</strong> cancelas la reserva, todos los opcionales se reembolsan al viajero sin excepción.
                  </p>
                </div>

                {optionalServices.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">No hay servicios opcionales. Haz clic en "Agregar servicio" para crear uno.</p>
                )}

                {optionalServices.map((svc, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicio {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeOptionalService(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={svc.name}
                          onChange={(e) => updateOptionalService(index, 'name', e.target.value)}
                          className="input text-sm"
                          placeholder="Ej: Snorkel, Entrada Museo, Cena Romántica"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Descripción breve
                        </label>
                        <input
                          type="text"
                          value={svc.description}
                          onChange={(e) => updateOptionalService(index, 'description', e.target.value)}
                          className="input text-sm"
                          placeholder="Información visible al viajero"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Precio por persona (MXN) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">$</span>
                          <input
                            type="number"
                            value={svc.price_per_person}
                            onChange={(e) => updateOptionalService(index, 'price_per_person', e.target.value)}
                            className="input pl-7 text-sm"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Cupo máximo
                        </label>
                        <input
                          type="number"
                          value={svc.max_capacity}
                          onChange={(e) => updateOptionalService(index, 'max_capacity', e.target.value)}
                          className="input text-sm"
                          min="1"
                          placeholder="Sin límite (dejar vacío)"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">Vacío = sin límite de cupo</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!svc.is_refundable}
                          onChange={(e) => updateOptionalService(index, 'is_refundable', !e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-medium">No reembolsable si el viajero cancela</span>
                          <span className="block text-xs text-gray-500">Si tú cancelas, siempre se reembolsa al viajero</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={svc.is_active}
                          onChange={(e) => updateOptionalService(index, 'is_active', e.target.checked)}
                          className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700 font-medium">Activo (visible al viajero)</span>
                      </label>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addOptionalService}
                  className="btn btn-outline btn-sm w-full text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar servicio opcional
                </button>
              </div>
            </div>

            {/* SECCIÓN 7 — Promociones Grupales */}
            <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden">
              <div className="bg-rose-600 px-5 py-3 flex items-center gap-2">
                <div className="bg-white/20 rounded-lg p-1.5">
                  <Percent className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Paso 7 — Promociones Grupales</h3>
                  <p className="text-rose-100 text-xs">Configura 2x1, 3x2 o precio especial para grupos</p>
                </div>
                <span className="ml-auto bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Opcional</span>
              </div>
              <div className="p-5">
                {editingTour ? (
                  <TourPromotionsManager
                    tourId={editingTour.id}
                    agencyId={editingTour.agency_id}
                    tourPrice={parseFloat(formData.price) || editingTour.price}
                  />
                ) : (
                  <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
                    <Percent className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-500" />
                    <p>
                      Las promociones grupales se configuran después de crear el tour. Al hacer clic en <strong>"Crear Tour"</strong>, el formulario cambiará automáticamente a modo edición donde podrás agregar promociones de inmediato.
                    </p>
                  </div>
                )}
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

      {/* Modal de Crear Punto de Salida */}
      {showCreateDepartureForm && (
        <DeparturePointForm
          onClose={() => setShowCreateDepartureForm(false)}
          onSuccess={(newPoint) => {
            const newSelected: SelectedDeparturePoint = {
              ...newPoint,
              display_order: selectedDeparturePoints.length + 1,
            };
            setSelectedDeparturePoints([...selectedDeparturePoints, newSelected]);
            setShowCreateDepartureForm(false);
          }}
        />
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

      {/* Modal de Reagendar Tour */}
      {rescheduleModal.open && rescheduleModal.tour && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mr-3">
                <CalendarX className="h-6 w-6 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold">Reagendar Tour</h2>
            </div>

            {rescheduleModal.success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Reagendamiento Procesado
                </h3>
                <p className="text-gray-600">
                  Se ha notificado a todos los viajeros sobre el cambio de fechas.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-2">{rescheduleModal.tour.name}</h3>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>
                      <span className="font-medium">Fechas actuales:</span> {formatDate(rescheduleModal.tour.start_date)} - {formatDate(rescheduleModal.tour.end_date)}
                    </p>
                    <p>
                      <span className="font-medium">Destino:</span> {rescheduleModal.tour.destination}
                    </p>
                  </div>
                </div>

                {rescheduleModal.isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <>
                    {rescheduleModal.activeBookingsCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <div className="flex items-start">
                          <AlertCircle className="h-5 w-5 text-amber-600 mr-2 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-900">
                              {rescheduleModal.activeBookingsCount} {rescheduleModal.activeBookingsCount === 1 ? 'viajero será notificado' : 'viajeros serán notificados'}
                            </p>
                            <p className="text-xs text-amber-800 mt-1">
                              Los viajeros podrán aceptar las nuevas fechas o solicitar un reembolso completo (100%).
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {rescheduleModal.error && (
                      <div className="bg-error-50 border border-error-200 rounded-lg p-4 mb-6">
                        <p className="text-sm text-error-800">{rescheduleModal.error}</p>
                      </div>
                    )}

                    <form onSubmit={handleSubmitReschedule} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nueva Fecha de Inicio *
                          </label>
                          <input
                            type="date"
                            value={rescheduleFormData.new_start_date}
                            onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, new_start_date: e.target.value })}
                            className="input"
                            min={new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Debe ser al menos 4 días en el futuro
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nueva Fecha de Fin *
                          </label>
                          <input
                            type="date"
                            value={rescheduleFormData.new_end_date}
                            onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, new_end_date: e.target.value })}
                            className="input"
                            min={rescheduleFormData.new_start_date}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Motivo del Reagendamiento *
                        </label>
                        <textarea
                          value={rescheduleFormData.reschedule_reason}
                          onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, reschedule_reason: e.target.value })}
                          className="input"
                          rows={4}
                          placeholder="Por ejemplo: Debido a condiciones climáticas adversas, hemos decidido reprogramar el tour para garantizar la seguridad y comodidad de todos los participantes..."
                          minLength={20}
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Mínimo 20 caracteres. Este mensaje será visible para los viajeros.
                        </p>
                      </div>

                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Política de Reagendamiento</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Los viajeros tendrán 4 días para responder</li>
                          <li>• Pueden aceptar las nuevas fechas sin costo adicional</li>
                          <li>• O solicitar un reembolso completo (100%)</li>
                          <li>• Se enviará una notificación por correo electrónico a cada viajero</li>
                        </ul>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          type="button"
                          onClick={handleCloseReschedule}
                          className="btn btn-outline"
                          disabled={rescheduleModal.isSubmitting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={rescheduleModal.isSubmitting}
                          className="btn bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {rescheduleModal.isSubmitting ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <CalendarX className="h-4 w-4 mr-2" />
                              Confirmar Reagendamiento
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Cancelar Tour */}
      {cancelModal.open && cancelModal.tour && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                <XCircle className="h-6 w-6 text-orange-600" />
              </div>
              <h2 className="text-xl font-semibold">Cancelar Tour Completo</h2>
            </div>

            {cancelModal.success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Tour Cancelado Exitosamente
                </h3>
                <p className="text-gray-600">
                  Se ha notificado a todos los viajeros y se han procesado los reembolsos.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-orange-900 mb-2">{cancelModal.tour.name}</h3>
                  <div className="text-sm text-orange-800 space-y-1">
                    <p>
                      <span className="font-medium">Fechas:</span> {formatDate(cancelModal.tour.start_date)} - {formatDate(cancelModal.tour.end_date)}
                    </p>
                    <p>
                      <span className="font-medium">Destino:</span> {cancelModal.tour.destination}
                    </p>
                  </div>
                </div>

                {cancelModal.isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <>
                    {cancelModal.activeBookingsCount > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div className="flex items-start">
                          <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-red-900">
                              {cancelModal.activeBookingsCount} {cancelModal.activeBookingsCount === 1 ? 'viajero será afectado' : 'viajeros serán afectados'}
                            </p>
                            <p className="text-xs text-red-800 mt-1">
                              Todos los viajeros recibirán un reembolso del 100% del anticipo pagado en su monedero ToursRed Cash. Los cargos por servicio no son reembolsables ya que fueron cobrados por Stripe.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {cancelModal.error && (
                      <div className="bg-error-50 border border-error-200 rounded-lg p-4 mb-6">
                        <p className="text-sm text-error-800">{cancelModal.error}</p>
                      </div>
                    )}

                    <form onSubmit={handleSubmitCancel} className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Motivo de la Cancelación *
                        </label>
                        <textarea
                          value={cancelFormData.cancellation_reason}
                          onChange={(e) => setCancelFormData({ cancellation_reason: e.target.value })}
                          className="input"
                          rows={5}
                          placeholder="Por favor, explica detalladamente el motivo de la cancelación del tour. Este mensaje será visible para los viajeros afectados y el administrador de la plataforma..."
                          minLength={50}
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Mínimo 50 caracteres. Este mensaje será visible para todos los viajeros afectados.
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Caracteres actuales: {cancelFormData.cancellation_reason.length}
                        </p>
                      </div>

                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Política de Cancelación por Agencia</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Todos los viajeros con reservas activas serán notificados por correo electrónico</li>
                          <li>• Cada viajero recibirá un reembolso del 100% del anticipo en ToursRed Cash</li>
                          <li>• Los cargos por servicio NO son reembolsables (ya fueron cobrados por Stripe)</li>
                          <li>• El tour quedará marcado como cancelado y no podrá recibir nuevas reservas</li>
                          <li>• El administrador recibirá un reporte detallado de la cancelación</li>
                        </ul>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start">
                          <AlertCircle className="h-5 w-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-amber-900">
                            <span className="font-semibold">Importante:</span> Esta acción no se puede deshacer. Una vez procesada la cancelación, todos los viajeros serán notificados y reembolsados automáticamente.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          type="button"
                          onClick={handleCloseCancel}
                          className="btn btn-outline"
                          disabled={cancelModal.isSubmitting}
                        >
                          Volver
                        </button>
                        <button
                          type="submit"
                          disabled={cancelModal.isSubmitting || cancelFormData.cancellation_reason.trim().length < 50}
                          className="btn bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {cancelModal.isSubmitting ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Confirmar Cancelación del Tour
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}
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
                      onClick={() => handleOpenReschedule(tour)}
                      className="p-2 text-gray-400 hover:text-amber-600 transition-colors"
                      title="Reagendar tour"
                      disabled={isSubmitting || isCreating || editingTour || duplicatingTour || new Date(tour.start_date) < new Date() || tour.cancelled_by_agency}
                    >
                      <CalendarX className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenCancel(tour)}
                      className="p-2 text-gray-400 hover:text-orange-600 transition-colors"
                      title="Cancelar tour completo"
                      disabled={isSubmitting || isCreating || editingTour || duplicatingTour || new Date(tour.start_date) <= new Date() || tour.cancelled_by_agency}
                    >
                      <XCircle className="h-4 w-4" />
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