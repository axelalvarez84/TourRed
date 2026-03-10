import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, CreditCard, Users, AlertCircle, DollarSign, Settings, Minus, Plus, Crown, Sparkles, Wallet, Award, Ticket, X, Check, Loader2, ShoppingBag, Info, Tag, RefreshCw, Clock } from 'lucide-react';
import PaymentProviderSelector, { PaymentProvider } from './PaymentProviderSelector';
import SlotCalendarPicker from './receptivo/SlotCalendarPicker';
import SlotTimePicker from './receptivo/SlotTimePicker';
import MinTravelersAlert from './receptivo/MinTravelersAlert';
import { TourSlot } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TourOptionalService {
  id: string;
  name: string;
  description: string | null;
  price_per_person: number;
  max_capacity: number | null;
  is_refundable: boolean;
  is_active: boolean;
  display_order: number;
  available_capacity?: number | null;
}
import { Tour } from '../types';
import { useAuth } from '../context/AuthContext';
import { createBooking, formatDateForDB, supabase } from '../lib/supabase';
import { useMembershipPrices } from '../hooks/useMembershipPrices';

interface BookingFormProps {
  tour: Tour;
}

interface TravelerCounts {
  adultos: number;
  ninos: number;
  infantes: number;
  adultos_mayores: number;
  mascotas: number;
}

const BookingForm: React.FC<BookingFormProps> = ({ tour }) => {
  const { user, isTraveler } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serviceChargePercentage, setServiceChargePercentage] = useState(5);
  const [agencyCommissionPercentage, setAgencyCommissionPercentage] = useState(15);
  const [availableSpots, setAvailableSpots] = useState<number | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [showTravelerSelector, setShowTravelerSelector] = useState(false);
  const [hasMembership, setHasMembership] = useState(false);
  const [isLoadingMembership, setIsLoadingMembership] = useState(true);
  const [addMembershipToBooking, setAddMembershipToBooking] = useState(false);
  const [selectedMembershipPlan, setSelectedMembershipPlan] = useState<'monthly' | 'annual'>('monthly');
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('stripe');
  const [walletBalance, setWalletBalance] = useState(0);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [useToursRedCash, setUseToursRedCash] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [isLoadingPoints, setIsLoadingPoints] = useState(true);
  const [useToursRedPoints, setUseToursRedPoints] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsWalletActive, setPointsWalletActive] = useState(false);
  const [noShowCount, setNoShowCount] = useState(0);
  const [isLoadingNoShowCount, setIsLoadingNoShowCount] = useState(true);
  const [isHighRisk, setIsHighRisk] = useState(false);
  const [remainingExemption, setRemainingExemption] = useState(500);
  const [isLoadingExemption, setIsLoadingExemption] = useState(true);

  const [optionalServices, setOptionalServices] = useState<TourOptionalService[]>([]);
  const [optionalServiceQuantities, setOptionalServiceQuantities] = useState<Record<string, number>>({});

  const [activePromotion, setActivePromotion] = useState<{
    id: string;
    promotion_type: string;
    min_travelers: number;
    group_size: number;
    pay_count: number;
    fixed_group_price: number | null;
    group_discount_percentage: number | null;
    valid_until: string;
    max_uses: number | null;
    times_used: number;
  } | null>(null);
  const [isLoadingOptionalServices, setIsLoadingOptionalServices] = useState(true);

  const isReceptivo = tour.tour_type === 'receptivo';
  const [selectedSlotDate, setSelectedSlotDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TourSlot | null>(null);

  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [discountCodeError, setDiscountCodeError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code_id: string;
    code: string;
    discount_type: string;
    discount_value: number;
    discount_applies_to: 'total_price' | 'payment_amount';
    max_discount_amount: number | null;
    applicable_to: 'tours' | 'service_fees';
  } | null>(null);

  const [travelerCounts, setTravelerCounts] = useState<TravelerCounts>({
    adultos: 1,
    ninos: 0,
    infantes: 0,
    adultos_mayores: 0,
    mascotas: 0,
  });

  const { prices: membershipPrices, loading: loadingPrices } = useMembershipPrices();

  React.useEffect(() => {
    const fetchPlatformSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('service_charge_percentage, agency_commission_percentage')
          .maybeSingle();

        if (error) {
          console.error('Error fetching platform settings:', error);
          return;
        }

        if (data) {
          setServiceChargePercentage(data.service_charge_percentage);
          setAgencyCommissionPercentage(data.agency_commission_percentage);
        }
      } catch (err) {
        console.error('Error loading platform settings:', err);
      }
    };

    fetchPlatformSettings();
  }, []);

  React.useEffect(() => {
    const checkMembership = async () => {
      if (!user || !isTraveler) {
        setIsLoadingMembership(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('memberships')
          .select('status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (error) {
          console.error('Error checking membership:', error);
          setHasMembership(false);
        } else {
          setHasMembership(!!data);
          console.log('✅ Estado de membresía:', !!data ? 'ACTIVA' : 'NO ACTIVA');
        }
      } catch (err) {
        console.error('Error loading membership:', err);
        setHasMembership(false);
      } finally {
        setIsLoadingMembership(false);
      }
    };

    checkMembership();
  }, [user, isTraveler]);

  React.useEffect(() => {
    const loadWalletBalance = async () => {
      if (!user || !isTraveler) {
        setIsLoadingWallet(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('toursred_cash_wallets')
          .select('balance')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (error) {
          console.error('Error loading wallet:', error);
          setWalletBalance(0);
        } else {
          setWalletBalance(data?.balance || 0);
          console.log('✅ Saldo ToursRed Cash:', data?.balance || 0);
        }
      } catch (err) {
        console.error('Error loading wallet:', err);
        setWalletBalance(0);
      } finally {
        setIsLoadingWallet(false);
      }
    };

    loadWalletBalance();
  }, [user, isTraveler]);

  React.useEffect(() => {
    const loadPointsBalance = async () => {
      if (!user || !isTraveler) {
        setIsLoadingPoints(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('toursred_points_wallets')
          .select('balance, is_active')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading points wallet:', error);
          setPointsBalance(0);
          setPointsWalletActive(false);
        } else {
          setPointsBalance(data?.balance || 0);
          setPointsWalletActive(data?.is_active || false);
          console.log('✅ Saldo ToursRed Points:', data?.balance || 0, '- Activo:', data?.is_active || false);
        }
      } catch (err) {
        console.error('Error loading points wallet:', err);
        setPointsBalance(0);
        setPointsWalletActive(false);
      } finally {
        setIsLoadingPoints(false);
      }
    };

    loadPointsBalance();
  }, [user, isTraveler]);

  React.useEffect(() => {
    const checkNoShowHistory = async () => {
      if (!user || !isTraveler) {
        setIsLoadingNoShowCount(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('no_show_count')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking no show count:', error);
          setNoShowCount(0);
          setIsHighRisk(false);
        } else {
          const count = data?.no_show_count || 0;
          setNoShowCount(count);
          setIsHighRisk(count > 3);
          if (count > 3) {
            console.log('⚠️ VIAJERO DE ALTO RIESGO: Tiene', count, 'no shows. Se cobrará el 100% del tour.');
          }
        }
      } catch (err) {
        console.error('Error loading no show count:', err);
        setNoShowCount(0);
        setIsHighRisk(false);
      } finally {
        setIsLoadingNoShowCount(false);
      }
    };

    checkNoShowHistory();
  }, [user, isTraveler]);

  React.useEffect(() => {
    const loadRemainingExemption = async () => {
      if (!user || !isTraveler || !hasMembership) {
        setRemainingExemption(0);
        setIsLoadingExemption(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_remaining_service_fee_exemption', {
          p_user_id: user.id
        });

        if (error) {
          console.error('Error loading remaining exemption:', error);
          setRemainingExemption(0);
        } else {
          setRemainingExemption(data || 0);
          console.log('✅ Límite de exención restante:', data || 0);
        }
      } catch (err) {
        console.error('Error loading remaining exemption:', err);
        setRemainingExemption(0);
      } finally {
        setIsLoadingExemption(false);
      }
    };

    loadRemainingExemption();
  }, [user, isTraveler, hasMembership]);

  React.useEffect(() => {
    const loadOptionalServices = async () => {
      try {
        setIsLoadingOptionalServices(true);
        const { data, error } = await supabase
          .from('tour_optional_services')
          .select('*')
          .eq('tour_id', tour.id)
          .eq('is_active', true)
          .order('display_order');

        if (error || !data) {
          setOptionalServices([]);
          return;
        }

        const servicesWithCapacity = await Promise.all(
          data.map(async (svc) => {
            if (svc.max_capacity === null) {
              return { ...svc, available_capacity: null };
            }
            const { data: capData } = await supabase
              .rpc('get_optional_service_available_capacity', { p_service_id: svc.id });
            return { ...svc, available_capacity: capData };
          })
        );

        setOptionalServices(servicesWithCapacity);
      } catch (err) {
        console.error('Error loading optional services:', err);
        setOptionalServices([]);
      } finally {
        setIsLoadingOptionalServices(false);
      }
    };

    loadOptionalServices();
  }, [tour.id]);

  React.useEffect(() => {
    const loadActivePromotion = async () => {
      try {
        const { data, error } = await supabase.rpc('get_active_promotion_for_tour', { p_tour_id: tour.id });
        if (!error && data && data.length > 0) {
          setActivePromotion(data[0]);
        } else {
          setActivePromotion(null);
        }
      } catch {
        setActivePromotion(null);
      }
    };
    loadActivePromotion();
  }, [tour.id]);

  React.useEffect(() => {
    const fetchAvailability = async () => {
      if (isReceptivo) {
        if (selectedSlot) {
          const available = Math.max(0, selectedSlot.capacity - selectedSlot.booked_count);
          setAvailableSpots(available);
        } else {
          setAvailableSpots(null);
        }
        setIsLoadingAvailability(false);
        return;
      }

      try {
        setIsLoadingAvailability(true);

        const { data, error } = await supabase
          .rpc('get_tour_availability', { p_tour_id: tour.id });

        if (error) {
          console.error('Error fetching availability from RPC:', error);
          setAvailableSpots(tour.max_travelers || 10);
          return;
        }

        if (data && data.length > 0) {
          const availability = data[0];
          setAvailableSpots(availability.available_spots);
        }

      } catch (err) {
        console.error('Error loading availability:', err);
        setAvailableSpots(tour.max_travelers || 10);
      } finally {
        setIsLoadingAvailability(false);
      }
    };

    fetchAvailability();

    const channel = supabase
      .channel(`tour_availability:${tour.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `tour_id=eq.${tour.id}`,
        },
        () => {
          fetchAvailability();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tour.id, isReceptivo, selectedSlot]);

  const formatDate = (dateString: string) => {
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      const monthName = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const dayNum = date.toLocaleString('en-US', { day: 'numeric', timeZone: 'UTC' });
      const yearNum = date.toLocaleString('en-US', { year: 'numeric', timeZone: 'UTC' });
      return `${monthName} ${dayNum}, ${yearNum}`;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  const isBookingDeadlinePassed = () => {
    if (isReceptivo) return false;
    if (!tour.booking_deadline) return false;

    try {
      const deadline = new Date(tour.booking_deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return deadline < today;
    } catch (error) {
      console.error('Error checking booking deadline:', error);
      return false;
    }
  };

  const bookingDeadlinePassed = isBookingDeadlinePassed();

  const handleApplyDiscountCode = async () => {
    if (!discountCodeInput.trim() || !user) return;

    setIsValidatingCode(true);
    setDiscountCodeError('');

    try {
      const { data, error } = await supabase.rpc('validate_tour_discount_code', {
        p_code: discountCodeInput.trim(),
        p_user_id: user.id,
        p_tour_id: tour.id,
      });

      if (error) throw error;

      if (data && data.valid) {
        setAppliedDiscount({
          code_id: data.code_id,
          code: data.code,
          discount_type: data.discount_type,
          discount_value: data.discount_value,
          discount_applies_to: data.discount_applies_to || 'total_price',
          max_discount_amount: data.max_discount_amount || null,
          applicable_to: data.applicable_to || 'tours',
        });
        setDiscountCodeError('');
        setDiscountCodeInput('');
      } else {
        setDiscountCodeError(data?.error || 'Codigo invalido');
      }
    } catch (err: any) {
      setDiscountCodeError(err.message || 'Error al validar el codigo');
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCodeError('');
  };

  // Calcular total de viajeros (sin contar mascotas)
  const totalTravelers = travelerCounts.adultos + travelerCounts.ninos + travelerCounts.infantes + travelerCounts.adultos_mayores;

  // Función para obtener precio por categoría o usar precio general
  const getPrecioPorCategoria = (categoria: 'adulto' | 'nino' | 'infante' | 'adulto_mayor' | 'mascota'): number => {
    switch (categoria) {
      case 'adulto':
        return tour.precio_adulto || tour.price;
      case 'nino':
        return tour.precio_nino || tour.price;
      case 'infante':
        return tour.precio_infante || tour.price;
      case 'adulto_mayor':
        return tour.precio_adulto_mayor || tour.price;
      case 'mascota':
        return tour.precio_mascota || 0;
      default:
        return tour.price;
    }
  };

  // Cálculos de precios por categoría
  const precioAdultos = getPrecioPorCategoria('adulto') * travelerCounts.adultos;
  const precioNinos = getPrecioPorCategoria('nino') * travelerCounts.ninos;
  const precioInfantes = getPrecioPorCategoria('infante') * travelerCounts.infantes;
  const precioAdultosMayores = getPrecioPorCategoria('adulto_mayor') * travelerCounts.adultos_mayores;
  const precioMascotas = getPrecioPorCategoria('mascota') * travelerCounts.mascotas;

  // Subtotal de servicios opcionales seleccionados
  const optionalServicesSubtotal = optionalServices.reduce((sum, svc) => {
    const qty = optionalServiceQuantities[svc.id] || 0;
    return sum + qty * svc.price_per_person;
  }, 0);

  // Precio total del tour (sin descuento, sin opcionales)
  const grossTourPrice = precioAdultos + precioNinos + precioInfantes + precioAdultosMayores + precioMascotas;

  // Calcular descuento por promoción grupal
  const calculatePromoDiscount = (): { discount: number; isActive: boolean; label: string; nearMissMessage: string | null; availabilityNote: string | null } => {
    if (!activePromotion) return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };

    const { promotion_type, min_travelers, group_size, pay_count, fixed_group_price, group_discount_percentage, max_uses, times_used } = activePromotion;
    const totalHuman = totalTravelers; // no mascotas

    if (promotion_type === 'nxprecio') {
      if (totalHuman < min_travelers) {
        const needed = min_travelers - totalHuman;
        if (needed <= 2) {
          return { discount: 0, isActive: false, label: '', nearMissMessage: `Agrega ${needed} viajero${needed > 1 ? 's' : ''} más para activar el precio especial grupal.`, availabilityNote: null };
        }
        return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };
      }

      if (fixed_group_price === null) return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };

      const totalGroups = Math.floor(totalHuman / min_travelers);
      const remainingTravelers = totalHuman % min_travelers;

      const usosRestantes = max_uses !== null ? Math.max(0, max_uses - times_used) : Infinity;
      const gruposConPromo = Math.min(totalGroups, usosRestantes === Infinity ? totalGroups : usosRestantes);
      const gruposSinPromo = totalGroups - gruposConPromo;

      const pricePerPerson = getPrecioPorCategoria('adulto');
      const normalPricePerGroup = min_travelers * pricePerPerson;

      const discountPerGroup = Math.max(0, normalPricePerGroup - fixed_group_price);
      const totalDiscount = gruposConPromo * discountPerGroup;

      if (totalDiscount <= 0) return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };

      const usosUsadosEnEstaReserva = gruposConPromo;
      const usosDisponibles = max_uses !== null ? Math.max(0, max_uses - times_used - usosUsadosEnEstaReserva) : null;

      let label = `${min_travelers} x $${fixed_group_price.toLocaleString()} — ${gruposConPromo} grupo${gruposConPromo > 1 ? 's' : ''} con precio especial`;
      if (gruposSinPromo > 0) {
        label += ` (${gruposSinPromo * min_travelers} viajero${gruposSinPromo * min_travelers > 1 ? 's' : ''} a precio normal)`;
      }
      if (remainingTravelers > 0) {
        label += ` + ${remainingTravelers} viajero${remainingTravelers > 1 ? 's' : ''} a precio normal`;
      }

      let availabilityNote: string | null = null;
      if (max_uses !== null) {
        availabilityNote = usosDisponibles !== null && usosDisponibles > 0
          ? `Sujeto a disponibilidad — quedan ${usosDisponibles} uso${usosDisponibles > 1 ? 's' : ''} tras esta reserva`
          : `Sujeto a disponibilidad — esta reserva agota los usos disponibles`;
      }

      return { discount: totalDiscount, isActive: true, label, nearMissMessage: null, availabilityNote };
    }

    if (promotion_type === 'grupo_precio_fijo') {
      if (totalHuman >= min_travelers && group_discount_percentage !== null && group_discount_percentage > 0) {
        const pct = group_discount_percentage / 100;
        const discountAdultos = getPrecioPorCategoria('adulto') * travelerCounts.adultos * pct;
        const discountNinos = getPrecioPorCategoria('nino') * travelerCounts.ninos * pct;
        const discountInfantes = getPrecioPorCategoria('infante') * travelerCounts.infantes * pct;
        const discountAdultosMayores = getPrecioPorCategoria('adulto_mayor') * travelerCounts.adultos_mayores * pct;
        const discount = Math.round((discountAdultos + discountNinos + discountInfantes + discountAdultosMayores) * 100) / 100;
        return {
          discount,
          isActive: discount > 0,
          label: `Precio Grupal ${group_discount_percentage}% desc. por persona (${min_travelers}+ viajeros)`,
          nearMissMessage: null,
          availabilityNote: null,
        };
      }
      const needed = min_travelers - totalHuman;
      if (needed > 0 && needed <= 3) {
        return { discount: 0, isActive: false, label: '', nearMissMessage: `Agrega ${needed} viajero${needed > 1 ? 's' : ''} más y activa el descuento grupal de ${group_discount_percentage}%.`, availabilityNote: null };
      }
      return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };
    }

    if (promotion_type === '2x1' || promotion_type === '3x2') {
      if (totalHuman < min_travelers) {
        const needed = min_travelers - totalHuman;
        if (needed <= 2) {
          return { discount: 0, isActive: false, label: '', nearMissMessage: `Agrega ${needed} viajero${needed > 1 ? 's' : ''} más y activa el ${promotion_type}.`, availabilityNote: null };
        }
        return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };
      }

      const pricePerAdulto = getPrecioPorCategoria('adulto');
      const freeGroups = Math.floor(totalHuman / group_size);
      const freePerGroup = group_size - pay_count;
      const freeCount = freeGroups * freePerGroup;
      const discount = freeCount * pricePerAdulto;

      return {
        discount,
        isActive: discount > 0,
        label: `Promoción ${promotion_type} — ${freeCount} viajero${freeCount > 1 ? 's' : ''} gratis`,
        nearMissMessage: null,
        availabilityNote: null,
      };
    }

    return { discount: 0, isActive: false, label: '', nearMissMessage: null, availabilityNote: null };
  };

  const promoResult = calculatePromoDiscount();
  const promoDiscountAmount = promoResult.discount;

  // Precio total del tour (sin descuento de código, pero con promo)
  const grossTotalPrice = grossTourPrice - promoDiscountAmount + optionalServicesSubtotal;

  // Si el usuario es de alto riesgo (más de 3 no shows), debe pagar el 100%
  const effectiveDepositPercentage = isHighRisk ? 100 : tour.deposit_percentage;

  // Calculate discount amount
  const calculateDiscountAmount = (baseAmount: number): number => {
    if (!appliedDiscount) return 0;
    let discount = 0;
    if (appliedDiscount.discount_type.includes('percentage')) {
      discount = baseAmount * (appliedDiscount.discount_value / 100);
    } else {
      discount = Math.min(appliedDiscount.discount_value, baseAmount);
    }
    if (appliedDiscount.max_discount_amount && discount > appliedDiscount.max_discount_amount) {
      discount = appliedDiscount.max_discount_amount;
    }
    return Math.round(discount * 100) / 100;
  };

  let totalPrice: number;
  let depositAmount: number;
  let agencyCommission: number;
  let discountAmount = 0;
  const isServiceFeeDiscount = appliedDiscount?.applicable_to === 'service_fees';

  if (appliedDiscount && !isServiceFeeDiscount && appliedDiscount.discount_applies_to === 'total_price') {
    discountAmount = calculateDiscountAmount(grossTotalPrice);
    totalPrice = grossTotalPrice - discountAmount;
    depositAmount = totalPrice * (effectiveDepositPercentage / 100);
    agencyCommission = totalPrice * (agencyCommissionPercentage / 100);
  } else {
    totalPrice = grossTotalPrice;
    depositAmount = totalPrice * (effectiveDepositPercentage / 100);
    agencyCommission = totalPrice * (agencyCommissionPercentage / 100);
  }

  const membershipMonthlyPrice = membershipPrices?.monthlyPrice || 49;
  const membershipAnnualPrice = membershipPrices?.annualPrice || 490;

  const fullServiceCharge = totalPrice * (serviceChargePercentage / 100);
  const shouldWaiveServiceCharge = hasMembership || addMembershipToBooking;

  let serviceChargeDiscountAmount = 0;
  if (isServiceFeeDiscount && appliedDiscount) {
    if (appliedDiscount.discount_type === 'service_fee_full') {
      serviceChargeDiscountAmount = fullServiceCharge;
    } else if (appliedDiscount.discount_type === 'service_fee_percentage') {
      serviceChargeDiscountAmount = fullServiceCharge * (appliedDiscount.discount_value / 100);
    } else if (appliedDiscount.discount_type === 'service_fee_fixed') {
      serviceChargeDiscountAmount = Math.min(appliedDiscount.discount_value, fullServiceCharge);
    }
    if (appliedDiscount.max_discount_amount && serviceChargeDiscountAmount > appliedDiscount.max_discount_amount) {
      serviceChargeDiscountAmount = appliedDiscount.max_discount_amount;
    }
    serviceChargeDiscountAmount = Math.round(serviceChargeDiscountAmount * 100) / 100;
  }

  const serviceChargeAfterCodeDiscount = fullServiceCharge - serviceChargeDiscountAmount;

  let serviceCharge = 0;
  let exemptionUsed = 0;
  let hasReachedExemptionLimit = false;

  if (shouldWaiveServiceCharge && hasMembership) {
    exemptionUsed = Math.min(serviceChargeAfterCodeDiscount, remainingExemption);
    serviceCharge = serviceChargeAfterCodeDiscount - exemptionUsed;
    hasReachedExemptionLimit = remainingExemption < serviceChargeAfterCodeDiscount;
  } else if (addMembershipToBooking) {
    serviceCharge = 0;
    exemptionUsed = serviceChargeAfterCodeDiscount;
  } else {
    serviceCharge = serviceChargeAfterCodeDiscount;
  }

  const platformRevenue = agencyCommission + serviceCharge;

  const membershipCost = addMembershipToBooking
    ? (selectedMembershipPlan === 'monthly' ? membershipMonthlyPrice : membershipAnnualPrice)
    : 0;

  let userPayment = depositAmount + serviceCharge;

  if (appliedDiscount && !isServiceFeeDiscount && appliedDiscount.discount_applies_to === 'payment_amount') {
    discountAmount = calculateDiscountAmount(userPayment);
    userPayment = userPayment - discountAmount;
  }

  const maxPointsAllowed = Math.floor(userPayment * 50);

  const pointsApplied = useToursRedPoints
    ? Math.min(pointsToUse, pointsBalance, maxPointsAllowed)
    : 0;

  const pointsDiscountAmount = pointsApplied / 100;

  const amountAfterPoints = userPayment - pointsDiscountAmount;

  const toursRedCashApplied = useToursRedCash ? Math.min(walletBalance, amountAfterPoints) : 0;
  const rawAmountAfterToursRedCash = amountAfterPoints - toursRedCashApplied;
  // Si el residuo es menor a $10 (mínimo de los procesadores de pago), absorberlo como $0
  const amountAfterToursRedCash = rawAmountAfterToursRedCash < 10 && rawAmountAfterToursRedCash > 0 ? 0 : rawAmountAfterToursRedCash;

  const totalToPayNow = amountAfterToursRedCash + membershipCost;

  const agencyReceives = depositAmount - agencyCommission;

  const handleOptionalServiceChange = (serviceId: string, delta: number, service: TourOptionalService) => {
    const totalPeople = totalTravelers + travelerCounts.mascotas;
    const maxByPeople = totalTravelers > 0 ? totalTravelers : 1;
    const maxByCapacity = service.available_capacity !== null && service.available_capacity !== undefined
      ? service.available_capacity
      : Infinity;
    const maxAllowed = Math.min(maxByPeople, maxByCapacity);

    setOptionalServiceQuantities(prev => {
      const current = prev[serviceId] || 0;
      const newVal = Math.max(0, Math.min(maxAllowed, current + delta));
      return { ...prev, [serviceId]: newVal };
    });
  };

  const handleCountChange = (categoria: keyof TravelerCounts, delta: number) => {
    setTravelerCounts(prev => {
      const newValue = Math.max(0, prev[categoria] + delta);

      // Validar disponibilidad (sin contar mascotas)
      if (categoria !== 'mascotas') {
        const newTotal = Object.entries({ ...prev, [categoria]: newValue })
          .filter(([key]) => key !== 'mascotas')
          .reduce((sum, [, value]) => sum + value, 0);

        if (availableSpots !== null && newTotal > availableSpots) {
          return prev;
        }
      }

      return { ...prev, [categoria]: newValue };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    if (!isTraveler) {
      setError('Solo los viajeros pueden reservar tours.');
      return;
    }

    if (isReceptivo && !selectedSlot) {
      setError('Debes seleccionar una fecha y horario para el tour receptivo.');
      return;
    }

    if (totalTravelers === 0) {
      setError('Debes seleccionar al menos un viajero.');
      return;
    }

    if (availableSpots !== null && totalTravelers > availableSpots) {
      setError(`Solo hay ${availableSpots} lugar${availableSpots !== 1 ? 'es' : ''} disponible${availableSpots !== 1 ? 's' : ''} para este tour.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const initialStatus = 'draft';
      const initialApprovalStatus = tour.booking_approval_type === 'manual' ? 'pending' : 'approved';
      const initialPaymentStatus = 'pending';

      const bookingData: Record<string, any> = {
        user_id: user.id,
        tour_id: tour.id,
        agency_id: tour.agency_id,
        travelers_count: totalTravelers,
        total_price: totalPrice,
        deposit_amount: depositAmount,
        commission_amount: agencyCommission,
        service_charge: serviceCharge,
        user_payment: userPayment,
        platform_revenue: platformRevenue,
        booking_date: isReceptivo && selectedSlot ? selectedSlot.slot_date : tour.start_date,
        slot_id: isReceptivo && selectedSlot ? selectedSlot.id : null,
        selected_date: isReceptivo && selectedSlot ? selectedSlot.slot_date : null,
        selected_time: isReceptivo && selectedSlot ? selectedSlot.departure_time : null,
        status: initialStatus,
        payment_status: initialPaymentStatus,
        approval_status: initialApprovalStatus,
        count_adultos: travelerCounts.adultos,
        count_ninos: travelerCounts.ninos,
        count_infantes: travelerCounts.infantes,
        count_adultos_mayores: travelerCounts.adultos_mayores,
        count_mascotas: travelerCounts.mascotas,
        points_used: pointsApplied,
        toursred_cash_used: toursRedCashApplied,
        discount_code_id: appliedDiscount?.code_id || null,
        discount_amount: discountAmount,
        service_charge_discount: serviceChargeDiscountAmount,
        payment_provider: addMembershipToBooking ? 'stripe' : paymentProvider,
        promotion_id: promoResult.isActive && activePromotion ? activePromotion.id : null,
        promo_discount_amount: promoResult.isActive ? promoDiscountAmount : 0,
      };

      console.log('📝 Creando reserva con datos:', bookingData);

      const { data, error: bookingError } = await createBooking(bookingData);

      if (bookingError) {
        console.error('❌ Error al crear la reserva:', bookingError);
        throw new Error(bookingError.message || 'Error al crear la reserva');
      }

      if (!data || !data.id) {
        throw new Error('No se recibió el ID de la reserva');
      }

      console.log('✅ Reserva creada exitosamente:', data);

      // Save selected optional services
      const selectedOptionals = optionalServices
        .filter(svc => (optionalServiceQuantities[svc.id] || 0) > 0)
        .map(svc => ({
          booking_id: data.id,
          tour_optional_service_id: svc.id,
          quantity: optionalServiceQuantities[svc.id],
          unit_price: svc.price_per_person,
          subtotal: optionalServiceQuantities[svc.id] * svc.price_per_person,
        }));

      if (selectedOptionals.length > 0) {
        await supabase.from('booking_optional_services').insert(selectedOptionals);
      }

      navigate(`/booking-travelers/${data.id}`);

    } catch (error: any) {
      console.error('❌ Error en el proceso de reserva:', error);
      setError(error.message || 'Hubo un error al procesar tu reserva. Por favor, intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const createStripeCheckout = async (bookingId: string, customerEmail: string, amount: number) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            bookingId,
            customerEmail,
            amount,
            description: `Depósito para ${tour.name}`,
            addMembership: addMembershipToBooking,
            membershipPlan: selectedMembershipPlan,
            toursRedCashUsed: toursRedCashApplied,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear la sesión de checkout');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al crear la sesión de checkout');
      }

      return result;
    } catch (error: any) {
      console.error('Error creando sesión de checkout:', error);
      return { success: false, error: error.message };
    }
  };

  // Determinar el label del selector
  const getSelectorLabel = () => {
    if (totalTravelers === 0 && travelerCounts.mascotas === 0) {
      return 'Seleccionar viajeros';
    }

    const parts = [];
    if (travelerCounts.adultos > 0) parts.push(`${travelerCounts.adultos} Adulto${travelerCounts.adultos > 1 ? 's' : ''}`);
    if (travelerCounts.ninos > 0) parts.push(`${travelerCounts.ninos} Niño${travelerCounts.ninos > 1 ? 's' : ''}`);
    if (travelerCounts.infantes > 0) parts.push(`${travelerCounts.infantes} Infante${travelerCounts.infantes > 1 ? 's' : ''}`);
    if (travelerCounts.adultos_mayores > 0) parts.push(`${travelerCounts.adultos_mayores} Adulto${travelerCounts.adultos_mayores > 1 ? 's' : ''} Mayor${travelerCounts.adultos_mayores > 1 ? 'es' : ''}`);
    if (travelerCounts.mascotas > 0) parts.push(`${travelerCounts.mascotas} Mascota${travelerCounts.mascotas > 1 ? 's' : ''}`);

    return parts.join(', ');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold mb-4">Reservar Este Tour</h3>

      <div className="mb-4">
        <div className="text-sm text-gray-500 mb-1">Precio por persona</div>
        <div className="text-2xl font-bold text-primary-600">${tour.price.toLocaleString()}</div>
        <div className="text-sm text-gray-500 mt-1">
          Depósito: ${depositAmount.toLocaleString()} ({effectiveDepositPercentage}%)
        </div>
      </div>

      {isHighRisk && (
        <div className="mb-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded-md">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-orange-800 mb-1">
                Pago del 100% Requerido
              </h4>
              <p className="text-sm text-orange-700">
                Debido a que has acumulado más de 3 ausencias (No Shows) en tours anteriores,
                se requiere el pago del 100% del tour por adelantado. Esto protege a nuestras
                agencias de posibles pérdidas.
              </p>
            </div>
          </div>
        </div>
      )}

      {isReceptivo ? (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-gray-700">Selecciona fecha y horario</span>
          </div>
          <SlotCalendarPicker
            tour={tour}
            selectedDate={selectedSlotDate}
            onDateSelect={(date) => {
              setSelectedSlotDate(date);
              setSelectedSlot(null);
            }}
          />
          {selectedSlotDate && (
            <SlotTimePicker
              tourId={tour.id}
              selectedDate={selectedSlotDate}
              selectedSlotId={selectedSlot?.id || null}
              onSlotSelect={(slot) => setSelectedSlot(slot)}
            />
          )}
          {selectedSlot && tour.min_travelers_required && tour.min_travelers_required > 1 && (
            <MinTravelersAlert
              minTravelersRequired={tour.min_travelers_required}
              confirmationHours={tour.min_travelers_confirmation_hours || 24}
              currentSlotBooked={selectedSlot.booked_count}
            />
          )}
          {selectedSlot && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-teal-800">
                  {format(new Date(selectedSlot.slot_date + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                </span>
                <span className="text-teal-600 ml-2">
                  a las {(() => {
                    const [h, m] = selectedSlot.departure_time.split(':');
                    const hour = parseInt(h);
                    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 bg-gray-50 p-3 rounded-md">
          <div className="text-sm font-medium mb-2">Fechas del Tour</div>
          <div className="flex items-center text-gray-700">
            <Calendar className="w-4 h-4 mr-2 text-primary-600" />
            <span>
              {formatDate(tour.start_date)} - {formatDate(tour.end_date)}
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Número de Viajeros
          </label>
          {isLoadingAvailability ? (
            <div className="flex items-center justify-center py-2 text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary-600 mr-2"></div>
              <span className="text-sm">Verificando disponibilidad...</span>
            </div>
          ) : availableSpots === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
              No hay lugares disponibles para este tour en este momento.
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTravelerSelector(!showTravelerSelector)}
                className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="text-sm text-gray-700">{getSelectorLabel()}</span>
                </div>
                <svg className={`h-5 w-5 text-gray-400 transition-transform ${showTravelerSelector ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showTravelerSelector && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-gray-300 rounded-md shadow-lg p-4 space-y-4">
                  {tour.admite_adultos !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Adultos</div>
                        <div className="text-xs text-gray-500">13-59 años &middot; ${getPrecioPorCategoria('adulto').toLocaleString()}/persona</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos', -1)}
                          disabled={travelerCounts.adultos === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.adultos}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_ninos !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Niños</div>
                        <div className="text-xs text-gray-500">3-12 años &middot; ${getPrecioPorCategoria('nino').toLocaleString()}/persona</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('ninos', -1)}
                          disabled={travelerCounts.ninos === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.ninos}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('ninos', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_infantes !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Infantes</div>
                        <div className="text-xs text-gray-500">0-2 años &middot; ${getPrecioPorCategoria('infante').toLocaleString()}/persona</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('infantes', -1)}
                          disabled={travelerCounts.infantes === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.infantes}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('infantes', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.admite_adultos_mayores !== false && (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Adultos Mayores</div>
                        <div className="text-xs text-gray-500">60+ con INAPAM &middot; ${getPrecioPorCategoria('adulto_mayor').toLocaleString()}/persona</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos_mayores', -1)}
                          disabled={travelerCounts.adultos_mayores === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.adultos_mayores}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('adultos_mayores', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tour.pet_friendly && (
                    <div className="flex items-center justify-between border-t pt-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">Mascotas</div>
                        <div className="text-xs text-gray-500">Perro o gato &middot; {getPrecioPorCategoria('mascota') > 0 ? `$${getPrecioPorCategoria('mascota').toLocaleString()}` : 'Gratis'}</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          onClick={() => handleCountChange('mascotas', -1)}
                          disabled={travelerCounts.mascotas === 0}
                          className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-medium">{travelerCounts.mascotas}</span>
                        <button
                          type="button"
                          onClick={() => handleCountChange('mascotas', 1)}
                          className="w-8 h-8 rounded-full border-2 border-primary-600 bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <button
                      type="button"
                      onClick={() => setShowTravelerSelector(false)}
                      className="w-full py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )}

              {availableSpots !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  {availableSpots} {availableSpots === 1 ? 'lugar disponible' : 'lugares disponibles'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Promo Activa Aplicada */}
        {activePromotion && promoResult.isActive && totalTravelers > 0 && (
          <div className="mb-4 bg-gradient-to-br from-rose-50 to-pink-50 border-2 border-rose-300 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-rose-600 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-rose-900">
                  Promoción Aplicada
                </h4>
                <p className="text-xs text-rose-700 mt-0.5">{promoResult.label}</p>
                {promoResult.availabilityNote && (
                  <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                    <Info className="h-3 w-3 flex-shrink-0" />
                    {promoResult.availabilityNote}
                  </p>
                )}
              </div>
              <span className="text-sm font-bold text-rose-700 flex-shrink-0">
                -${promoDiscountAmount.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Mensaje motivador para activar promo */}
        {activePromotion && !promoResult.isActive && promoResult.nearMissMessage && totalTravelers > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <Tag className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">{promoResult.nearMissMessage}</span>
            </p>
          </div>
        )}

        {/* Servicios Opcionales */}
        {!isLoadingOptionalServices && optionalServices.length > 0 && totalTravelers > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingBag className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-gray-800">Servicios Adicionales</span>
            </div>
            <div className="space-y-3">
              {optionalServices.map(svc => {
                const qty = optionalServiceQuantities[svc.id] || 0;
                const isSoldOut = svc.available_capacity !== null && svc.available_capacity !== undefined && svc.available_capacity === 0;
                const maxAllowed = Math.min(
                  totalTravelers,
                  svc.available_capacity !== null && svc.available_capacity !== undefined
                    ? svc.available_capacity
                    : Infinity
                );

                return (
                  <div
                    key={svc.id}
                    className={`border rounded-lg p-3 ${
                      isSoldOut
                        ? 'border-gray-200 bg-gray-50 opacity-60'
                        : qty > 0
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{svc.name}</span>
                          {!svc.is_refundable && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                              No reembolsable si cancelas
                            </span>
                          )}
                          {isSoldOut && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                              Agotado
                            </span>
                          )}
                          {!isSoldOut && svc.available_capacity !== null && svc.available_capacity !== undefined && (
                            <span className="text-xs text-gray-500">
                              {svc.available_capacity} {svc.available_capacity === 1 ? 'lugar' : 'lugares'} disponibles
                            </span>
                          )}
                        </div>
                        {svc.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>
                        )}
                        <p className="text-sm font-medium text-primary-600 mt-1">
                          ${svc.price_per_person.toLocaleString()} / persona
                        </p>
                      </div>

                      {!isSoldOut && (
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOptionalServiceChange(svc.id, -1, svc)}
                            disabled={qty === 0}
                            className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => handleOptionalServiceChange(svc.id, 1, svc)}
                            disabled={qty >= maxAllowed}
                            className="w-7 h-7 rounded-full border-2 border-amber-500 bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {qty > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between text-xs">
                        <span className="text-gray-600">{qty} × ${svc.price_per_person.toLocaleString()}</span>
                        <span className="font-semibold text-amber-700">+${(qty * svc.price_per_person).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isLoadingMembership && !hasMembership && totalTravelers > 0 && serviceCharge > 0 && (
          <div className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-lg p-4">
            <div className="flex items-start mb-3">
              <Sparkles className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-gray-900 mb-1">
                  ¡Ahorra ${serviceCharge.toLocaleString()} con ToursRed+!
                </h4>
                <p className="text-xs text-gray-700">
                  Los miembros ToursRed+ no pagan cargo por servicio en reservas nacionales. Agrega una membresía a tu compra y comienza a ahorrar hoy.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={addMembershipToBooking}
                  onChange={(e) => setAddMembershipToBooking(e.target.checked)}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">
                  Agregar membresía ToursRed+ a mi reserva
                </span>
              </label>

              {addMembershipToBooking && (
                <div className="ml-7 space-y-2">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="radio"
                      name="membership-plan"
                      checked={selectedMembershipPlan === 'monthly'}
                      onChange={() => setSelectedMembershipPlan('monthly')}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Plan Mensual</span>
                        <span className="text-sm font-bold text-primary-600">{membershipPrices?.monthlyPriceFormatted || '$49'}/mes</span>
                      </div>
                      <p className="text-xs text-gray-600">Cancela cuando quieras</p>
                    </div>
                  </label>

                  <label className="flex items-start cursor-pointer">
                    <input
                      type="radio"
                      name="membership-plan"
                      checked={selectedMembershipPlan === 'annual'}
                      onChange={() => setSelectedMembershipPlan('annual')}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Plan Anual</span>
                        <span className="text-sm font-bold text-primary-600">{membershipPrices?.annualPriceFormatted || '$490'}/año</span>
                      </div>
                      <p className="text-xs text-gray-600">Ahorra {membershipPrices?.annualSavingsFormatted || '$98'} al año ({membershipPrices?.savingsPercentage || 17}% descuento)</p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {hasMembership && (
          <>
            {!hasReachedExemptionLimit ? (
              <div className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-4">
                <div className="flex items-center">
                  <Crown className="h-6 w-6 text-amber-600 mr-2" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-900">
                      Beneficio ToursRed+ Activo
                    </h4>
                    <p className="text-xs text-gray-700">
                      No se aplicará cargo por servicio en esta reserva
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4 bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-400 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="h-6 w-6 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-900 mb-1">
                      Límite Mensual de Descuento Alcanzado
                    </h4>
                    <p className="text-xs text-gray-700 mb-2">
                      Has usado ${(500 - remainingExemption).toFixed(2)} MXN de tus $500 MXN de descuento este mes. Esta reserva aplicará un cargo por servicio de ${serviceCharge.toFixed(2)} MXN.
                    </p>
                    <div className="bg-white rounded-md p-2 border border-orange-200">
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold text-green-700">Buenas noticias:</span> El cargo por servicio también te genera <span className="font-bold text-green-700">{Math.floor(serviceCharge).toLocaleString()} ToursRed Points</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {totalTravelers > 0 && (
              <div className="mb-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4">
                <div className="flex items-center">
                  <Sparkles className="h-6 w-6 text-green-600 mr-2" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-900">
                      Vas a acumular ToursRed Points
                    </h4>
                    <p className="text-xs text-gray-700">
                      Ganarás <span className="font-bold text-green-700">{Math.floor(userPayment).toLocaleString()} puntos</span> con esta reserva
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!isLoadingPoints && pointsBalance > 0 && totalTravelers > 0 && pointsWalletActive && hasMembership && (
          <div className="mb-4 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-lg p-4">
            <div className="flex items-start mb-3">
              <Award className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-gray-900 mb-1">
                  ToursRed Points Disponibles
                </h4>
                <p className="text-xs text-gray-700">
                  Tienes {pointsBalance.toLocaleString()} puntos (${(pointsBalance / 100).toFixed(2)} MXN). Usa hasta el 50% del total con puntos.
                </p>
              </div>
            </div>

            <label className="flex items-start cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={useToursRedPoints}
                onChange={(e) => {
                  setUseToursRedPoints(e.target.checked);
                  if (!e.target.checked) {
                    setPointsToUse(0);
                  } else {
                    setPointsToUse(Math.min(pointsBalance, maxPointsAllowed));
                  }
                }}
                className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
              />
              <span className="ml-3 text-sm font-medium text-gray-900">
                Usar mis ToursRed Points
              </span>
            </label>

            {useToursRedPoints && (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-2">
                    <span>Puntos a usar:</span>
                    <span className="font-medium">{pointsApplied.toLocaleString()} puntos</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.min(pointsBalance, maxPointsAllowed)}
                    value={pointsToUse}
                    onChange={(e) => setPointsToUse(parseInt(e.target.value))}
                    className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer slider-thumb"
                    style={{
                      background: `linear-gradient(to right, rgb(217, 119, 6) 0%, rgb(217, 119, 6) ${(pointsApplied / Math.min(pointsBalance, maxPointsAllowed)) * 100}%, rgb(253, 230, 138) ${(pointsApplied / Math.min(pointsBalance, maxPointsAllowed)) * 100}%, rgb(253, 230, 138) 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0</span>
                    <span>{Math.min(pointsBalance, maxPointsAllowed).toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-white rounded-md p-3 border border-amber-200 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Descuento con puntos:</span>
                    <span className="font-bold text-amber-600">
                      -${pointsDiscountAmount.toFixed(2)} MXN
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Máximo permitido (50%):</span>
                    <span className="font-medium">
                      {maxPointsAllowed.toLocaleString()} puntos (${(maxPointsAllowed / 100).toFixed(2)})
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Saldo restante:</span>
                    <span className="font-medium">
                      {(pointsBalance - pointsApplied).toLocaleString()} puntos
                    </span>
                  </div>
                </div>

                {pointsApplied >= maxPointsAllowed && (
                  <div className="bg-amber-100 border border-amber-300 rounded-md p-2">
                    <p className="text-xs text-amber-800 font-medium text-center">
                      ℹ Has alcanzado el límite del 50% con puntos
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isLoadingPoints && pointsBalance > 0 && !pointsWalletActive && totalTravelers > 0 && (
          <div className="mb-4 bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
            <div className="flex items-start">
              <Award className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-orange-900 mb-1">
                  Reactiva tu Membresía para Usar Puntos
                </h4>
                <p className="text-xs text-orange-800">
                  Tienes {pointsBalance.toLocaleString()} puntos disponibles, pero necesitas una membresía ToursRed+ activa para usarlos. {' '}
                  <Link to="/traveler/membership" className="underline font-medium">
                    Reactivar membresía
                  </Link>
                </p>
              </div>
            </div>
          </div>
        )}

        {!isLoadingWallet && walletBalance > 0 && totalTravelers > 0 && (
          <div className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-lg p-4">
            <div className="flex items-start mb-3">
              <Wallet className="h-5 w-5 text-amber-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-gray-900 mb-1">
                  Saldo ToursRed Cash Disponible
                </h4>
                <p className="text-xs text-gray-700">
                  Tienes ${walletBalance.toLocaleString()} MXN disponibles. Úsalos para reducir el total a pagar.
                </p>
              </div>
            </div>

            <label className="flex items-start cursor-pointer">
              <input
                type="checkbox"
                checked={useToursRedCash}
                onChange={(e) => setUseToursRedCash(e.target.checked)}
                className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
              />
              <span className="ml-3 text-sm font-medium text-gray-900">
                Usar mi saldo de ToursRed Cash
              </span>
            </label>

            {useToursRedCash && (
              <div className="mt-3 bg-white rounded-md p-3 border border-amber-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Se aplicarán:</span>
                  <span className="font-bold text-amber-600">
                    -${toursRedCashApplied.toLocaleString()} MXN
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>Saldo restante después de esta reserva:</span>
                  <span className="font-medium">
                    ${(walletBalance - toursRedCashApplied).toLocaleString()} MXN
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {totalTravelers > 0 && user && isTraveler && (
          <div className="mb-4">
            {appliedDiscount ? (
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Ticket className="h-5 w-5 text-green-600 mr-2" />
                    <div>
                      <span className="text-sm font-bold text-green-800">{appliedDiscount.code}</span>
                      <span className="text-sm text-green-700 ml-2">
                        {isServiceFeeDiscount
                          ? appliedDiscount.discount_type === 'service_fee_full'
                            ? 'Cargo por Servicio Gratis'
                            : appliedDiscount.discount_type === 'service_fee_percentage'
                              ? `${appliedDiscount.discount_value}% desc. en Cargo por Servicio`
                              : `$${appliedDiscount.discount_value} desc. en Cargo por Servicio`
                          : appliedDiscount.discount_type.includes('percentage')
                            ? `${appliedDiscount.discount_value}% de descuento`
                            : `$${appliedDiscount.discount_value} de descuento`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    className="text-green-600 hover:text-green-800 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {isServiceFeeDiscount && serviceChargeDiscountAmount > 0 && (
                  <p className="text-xs text-green-700 mt-1 ml-7">
                    Ahorro en Cargo por Servicio: -${serviceChargeDiscountAmount.toLocaleString()} MXN
                  </p>
                )}
                {!isServiceFeeDiscount && discountAmount > 0 && (
                  <p className="text-xs text-green-700 mt-1 ml-7">
                    Ahorro: -${discountAmount.toLocaleString()} MXN
                    {appliedDiscount.discount_applies_to === 'payment_amount' ? ' (sobre monto a pagar)' : ' (sobre costo total)'}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Ticket className="h-4 w-4 text-gray-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">Codigo de descuento</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={discountCodeInput}
                    onChange={(e) => {
                      setDiscountCodeInput(e.target.value.toUpperCase());
                      setDiscountCodeError('');
                    }}
                    placeholder="Ingresa tu codigo"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm uppercase focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDiscountCode();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyDiscountCode}
                    disabled={isValidatingCode || !discountCodeInput.trim()}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                  >
                    {isValidatingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Aplicar'
                    )}
                  </button>
                </div>
                {discountCodeError && (
                  <p className="text-xs text-red-600 mt-1">{discountCodeError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {totalTravelers > 0 && (
          <div className="mb-4 bg-gray-50 p-4 rounded-md space-y-2">
            <h4 className="text-sm font-semibold text-gray-900">Desglose de Costos</h4>

            {travelerCounts.adultos > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.adultos} Adulto{travelerCounts.adultos > 1 ? 's' : ''} × ${getPrecioPorCategoria('adulto').toLocaleString()}:</span>
                <span className="font-medium">${precioAdultos.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.ninos > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.ninos} Niño{travelerCounts.ninos > 1 ? 's' : ''} × ${getPrecioPorCategoria('nino').toLocaleString()}:</span>
                <span className="font-medium">${precioNinos.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.infantes > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.infantes} Infante{travelerCounts.infantes > 1 ? 's' : ''} × ${getPrecioPorCategoria('infante').toLocaleString()}:</span>
                <span className="font-medium">${precioInfantes.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.adultos_mayores > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.adultos_mayores} Adulto{travelerCounts.adultos_mayores > 1 ? 's' : ''} Mayor{travelerCounts.adultos_mayores > 1 ? 'es' : ''} × ${getPrecioPorCategoria('adulto_mayor').toLocaleString()}:</span>
                <span className="font-medium">${precioAdultosMayores.toLocaleString()}</span>
              </div>
            )}

            {travelerCounts.mascotas > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{travelerCounts.mascotas} Mascota{travelerCounts.mascotas > 1 ? 's' : ''} × ${getPrecioPorCategoria('mascota').toLocaleString()}:</span>
                <span className="font-medium">${precioMascotas.toLocaleString()}</span>
              </div>
            )}

            {promoResult.isActive && promoDiscountAmount > 0 && (
              <div className="flex justify-between text-sm text-rose-600 border-t pt-2 mt-1">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {promoResult.label}:
                </span>
                <span className="font-medium">-${promoDiscountAmount.toLocaleString()}</span>
              </div>
            )}

            {optionalServicesSubtotal > 0 && (
              <div className="border-t pt-2 mt-1 space-y-1">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicios Adicionales</div>
                {optionalServices
                  .filter(svc => (optionalServiceQuantities[svc.id] || 0) > 0)
                  .map(svc => {
                    const qty = optionalServiceQuantities[svc.id];
                    return (
                      <div key={svc.id} className="flex justify-between text-sm">
                        <span className="text-gray-600 flex items-center gap-1">
                          {svc.name} × {qty}
                          {!svc.is_refundable && (
                            <span className="text-orange-600 text-xs">(no reemb.)</span>
                          )}
                        </span>
                        <span className="font-medium">${(qty * svc.price_per_person).toLocaleString()}</span>
                      </div>
                    );
                  })
                }
              </div>
            )}

            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Precio Total del Tour:</span>
                <span className={`font-semibold ${appliedDiscount && appliedDiscount.discount_applies_to === 'total_price' ? 'line-through text-gray-400' : ''}`}>
                  ${grossTotalPrice.toLocaleString()}
                </span>
              </div>
              {appliedDiscount && appliedDiscount.discount_applies_to === 'total_price' && discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm text-green-600">
                    <span className="flex items-center">
                      <Ticket className="h-3 w-3 mr-1" />
                      Descuento ({appliedDiscount.code}):
                    </span>
                    <span className="font-medium">-${discountAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Precio con descuento:</span>
                    <span className="font-semibold">${totalPrice.toLocaleString()}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Depósito ({effectiveDepositPercentage}%):</span>
                <span className="font-medium">${depositAmount.toLocaleString()}</span>
              </div>

              {(() => {
                const showCodeDiscount = isServiceFeeDiscount && serviceChargeDiscountAmount > 0;
                const chargeFullyWaived = shouldWaiveServiceCharge && !hasReachedExemptionLimit && !showCodeDiscount;
                const chargeFullyFreeByCode = showCodeDiscount && serviceChargeAfterCodeDiscount === 0;

                if (chargeFullyFreeByCode) {
                  return (
                    <>
                      <div className="flex justify-between text-sm text-gray-600 mt-1">
                        <span>Cargo por Servicio ({serviceChargePercentage}%):</span>
                        <span className="font-medium line-through text-gray-400">${fullServiceCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span className="flex items-center">
                          <Ticket className="h-3 w-3 mr-1" />
                          Descuento ({appliedDiscount!.code}):
                        </span>
                        <span className="font-medium">-${serviceChargeDiscountAmount.toFixed(2)}</span>
                      </div>
                    </>
                  );
                }

                if (showCodeDiscount) {
                  return (
                    <>
                      <div className="flex justify-between text-sm text-gray-600 mt-1">
                        <span>Cargo por Servicio ({serviceChargePercentage}%):</span>
                        <span className="font-medium">${fullServiceCharge.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
                        <span className="flex items-center">
                          <Ticket className="h-3 w-3 mr-1" />
                          Descuento ({appliedDiscount!.code}):
                        </span>
                        <span className="font-medium">-${serviceChargeDiscountAmount.toFixed(2)}</span>
                      </div>
                      {shouldWaiveServiceCharge && exemptionUsed > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="flex items-center">
                            <Crown className="h-3 w-3 mr-1" />
                            Descuento ToursRed+:
                          </span>
                          <span className="font-medium">-${exemptionUsed.toFixed(2)}</span>
                        </div>
                      )}
                      {serviceCharge > 0 ? (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>Cargo por Servicio (a pagar):</span>
                          <span className="font-medium">+${serviceCharge.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Cargo por Servicio (a pagar):</span>
                          <span className="font-medium">$0</span>
                        </div>
                      )}
                    </>
                  );
                }

                if (chargeFullyWaived) {
                  return (
                    <div className="flex justify-between text-sm text-green-600 mt-1">
                      <span className="flex items-center">
                        <Crown className="h-3 w-3 mr-1" />
                        Cargo por Servicio ({serviceChargePercentage}%):
                      </span>
                      <span className="font-medium line-through text-gray-400">${fullServiceCharge.toLocaleString()}</span>
                    </div>
                  );
                }

                if (shouldWaiveServiceCharge && hasReachedExemptionLimit) {
                  return (
                    <>
                      <div className="flex justify-between text-sm text-gray-600 mt-1">
                        <span>Cargo por Servicio ({serviceChargePercentage}%):</span>
                        <span className="font-medium">${fullServiceCharge.toFixed(2)}</span>
                      </div>
                      {exemptionUsed > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="flex items-center">
                            <Crown className="h-3 w-3 mr-1" />
                            Descuento ToursRed+:
                          </span>
                          <span className="font-medium">-${exemptionUsed.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm text-orange-600">
                        <span>Cargo por Servicio (a pagar):</span>
                        <span className="font-medium">+${serviceCharge.toFixed(2)}</span>
                      </div>
                    </>
                  );
                }

                return (
                  <div className="flex justify-between text-sm text-orange-600 mt-1">
                    <span>Cargo por Servicio ({serviceChargePercentage}%):</span>
                    <span className="font-medium">+${serviceCharge.toLocaleString()}</span>
                  </div>
                );
              })()}

              {appliedDiscount && appliedDiscount.discount_applies_to === 'payment_amount' && discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600 mt-1">
                  <span className="flex items-center">
                    <Ticket className="h-3 w-3 mr-1" />
                    Descuento ({appliedDiscount.code}):
                  </span>
                  <span className="font-medium">-${discountAmount.toLocaleString()}</span>
                </div>
              )}

              {addMembershipToBooking && (
                <div className="flex justify-between text-sm text-amber-600 mt-1">
                  <span className="flex items-center">
                    <Crown className="h-3 w-3 mr-1" />
                    Membresía ToursRed+ ({selectedMembershipPlan === 'monthly' ? 'Mensual' : 'Anual'}):
                  </span>
                  <span className="font-medium">+${membershipCost.toLocaleString()}</span>
                </div>
              )}

              {useToursRedPoints && pointsApplied > 0 && (
                <div className="flex justify-between text-sm text-amber-600 mt-1">
                  <span className="flex items-center">
                    <Award className="h-3 w-3 mr-1" />
                    ToursRed Points aplicados:
                  </span>
                  <span className="font-medium">-${pointsDiscountAmount.toFixed(2)} ({pointsApplied.toLocaleString()} pts)</span>
                </div>
              )}

              {useToursRedCash && toursRedCashApplied > 0 && (
                <div className="flex justify-between text-sm text-amber-600 mt-1">
                  <span className="flex items-center">
                    <Wallet className="h-3 w-3 mr-1" />
                    ToursRed Cash aplicado:
                  </span>
                  <span className="font-medium">-${toursRedCashApplied.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold text-gray-900">Total a Pagar Ahora:</span>
              <span className="font-bold text-primary-600 text-lg">${totalToPayNow.toLocaleString()}</span>
            </div>

            {shouldWaiveServiceCharge && exemptionUsed > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-md p-2 mt-2">
                <p className="text-xs text-green-800 font-medium text-center">
                  ✓ Ahorraste ${exemptionUsed.toFixed(2)} con ToursRed+
                  {hasReachedExemptionLimit && (
                    <span className="block text-[10px] text-gray-600 mt-0.5">
                      (Límite mensual: ${remainingExemption.toFixed(2)} restantes de $500.00)
                    </span>
                  )}
                </p>
              </div>
            )}

            <div className="text-xs text-gray-500 mt-2">
              <div>Saldo Restante: ${(grossTotalPrice - depositAmount - (appliedDiscount?.discount_applies_to === 'total_price' ? discountAmount : 0)).toLocaleString()}</div>
            </div>
          </div>
        )}

        {totalTravelers > 0 && user && isTraveler && totalToPayNow > 0 && (
          <PaymentProviderSelector
            context={addMembershipToBooking ? 'booking_with_membership' : 'booking'}
            value={paymentProvider}
            onChange={setPaymentProvider}
            disabled={isSubmitting}
          />
        )}

        {bookingDeadlinePassed && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Fecha límite de reserva vencida</p>
              <p className="mt-1">Este tour ya no acepta nuevas reservas.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {tour.booking_approval_type === 'manual' && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start">
            <AlertCircle className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Reserva con aprobación manual</p>
              <p className="mt-1">
                Esta reserva requiere aprobación de la agencia. Se te solicitará el pago una vez que tu reserva sea aprobada.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isTraveler || bookingDeadlinePassed || availableSpots === 0 || totalTravelers === 0}
          className={`w-full py-3 px-4 rounded-md font-semibold flex items-center justify-center transition-colors ${
            isSubmitting || !isTraveler || bookingDeadlinePassed || availableSpots === 0 || totalTravelers === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
              Procesando...
            </>
          ) : tour.booking_approval_type === 'manual' ? (
            <>
              <Settings className="w-5 h-5 mr-2" />
              Enviar Solicitud de Reserva
            </>
          ) : totalToPayNow <= 0 ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Reservar Ahora
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Reservar Ahora
            </>
          )}
        </button>

        {!isTraveler && user && (
          <p className="mt-3 text-sm text-red-600 text-center">
            Solo los viajeros pueden realizar reservas
          </p>
        )}
      </form>
    </div>
  );
};

export default BookingForm;
