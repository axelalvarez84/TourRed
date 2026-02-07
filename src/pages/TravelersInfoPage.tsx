import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Users, ArrowLeft, Save, UserPlus, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Booking, BookingTraveler, Tour, FrequentCompanion } from '../types';
import { useAuth } from '../context/AuthContext';
import { validateBirthDateForCategory, validateAllTravelers } from '../utils/birthDateValidation';

interface TravelerFormData {
  categoria_viajero: 'adulto' | 'nino' | 'infante' | 'adulto_mayor' | 'mascota';
  nombre: string;
  email: string;
  telefono: string;
  fecha_nacimiento: string;
  precio_aplicado: number;
  saveAsFrequentCompanion: boolean;
  selectedCompanionId?: string;
}

const TravelersInfoPage: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [travelers, setTravelers] = useState<TravelerFormData[]>([]);
  const [frequentCompanions, setFrequentCompanions] = useState<FrequentCompanion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [travelerErrors, setTravelerErrors] = useState<string[]>([]);
  const [showCompanionsSection, setShowCompanionsSection] = useState(true);

  useEffect(() => {
    if (!bookingId) {
      navigate('/');
      return;
    }
    loadBookingData();
  }, [bookingId]);

  const loadBookingData = async () => {
    try {
      setIsLoading(true);

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          tours (*)
        `)
        .eq('id', bookingId)
        .maybeSingle();

      if (bookingError || !bookingData) {
        throw new Error('No se pudo cargar la reserva');
      }

      if (bookingData.user_id !== user?.id) {
        throw new Error('No tienes permiso para ver esta reserva');
      }

      setBooking(bookingData);
      setTour(bookingData.tours);

      await loadFrequentCompanions();

      const existingTravelers = await loadExistingTravelers();

      if (existingTravelers.length > 0) {
        setTravelers(existingTravelers);
      } else {
        await initializeTravelerForms(bookingData);
      }

    } catch (err: any) {
      console.error('Error loading booking:', err);
      setError(err.message || 'Error al cargar la reserva');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFrequentCompanions = async () => {
    const { data, error } = await supabase
      .from('frequent_companions')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setFrequentCompanions(data);
    }
  };

  const loadExistingTravelers = async (): Promise<TravelerFormData[]> => {
    const { data, error } = await supabase
      .from('booking_travelers')
      .select('*')
      .eq('booking_id', bookingId);

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map(t => ({
      categoria_viajero: t.categoria_viajero,
      nombre: t.nombre,
      email: t.email,
      telefono: t.telefono || '',
      fecha_nacimiento: t.fecha_nacimiento,
      precio_aplicado: t.precio_aplicado,
      saveAsFrequentCompanion: false,
      selectedCompanionId: t.frequent_companion_id,
    }));
  };

  const initializeTravelerForms = async (bookingData: Booking) => {
    const travelersList: TravelerFormData[] = [];
    const tourData = bookingData.tours as Tour;

    const countAdultos = bookingData.count_adultos || 0;
    const countNinos = bookingData.count_ninos || 0;
    const countInfantes = bookingData.count_infantes || 0;
    const countAdultosMayores = bookingData.count_adultos_mayores || 0;
    const countMascotas = bookingData.count_mascotas || 0;

    const { data: userData } = await supabase
      .from('users')
      .select('first_name, last_name, email, phone_number, date_of_birth')
      .eq('id', user?.id)
      .maybeSingle();

    console.log('User data loaded:', userData);

    for (let i = 0; i < countAdultos; i++) {
      if (i === 0 && userData) {
        travelersList.push({
          categoria_viajero: 'adulto',
          nombre: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          email: userData.email || user?.email || '',
          telefono: userData.phone_number || '',
          fecha_nacimiento: userData.date_of_birth || '',
          precio_aplicado: tourData.precio_adulto || tourData.price,
          saveAsFrequentCompanion: false,
        });
      } else {
        travelersList.push(createEmptyTraveler('adulto', tourData.precio_adulto || tourData.price));
      }
    }

    for (let i = 0; i < countNinos; i++) {
      travelersList.push(createEmptyTraveler('nino', tourData.precio_nino || tourData.price));
    }

    for (let i = 0; i < countInfantes; i++) {
      travelersList.push(createEmptyTraveler('infante', tourData.precio_infante || tourData.price));
    }

    for (let i = 0; i < countAdultosMayores; i++) {
      travelersList.push(createEmptyTraveler('adulto_mayor', tourData.precio_adulto_mayor || tourData.price));
    }

    for (let i = 0; i < countMascotas; i++) {
      travelersList.push(createEmptyTraveler('mascota', tourData.precio_mascota || 0));
    }

    setTravelers(travelersList);
  };

  const createEmptyTraveler = (categoria: 'adulto' | 'nino' | 'infante' | 'adulto_mayor' | 'mascota', precio: number): TravelerFormData => {
    return {
      categoria_viajero: categoria,
      nombre: '',
      email: user?.email || '',
      telefono: '',
      fecha_nacimiento: '',
      precio_aplicado: precio,
      saveAsFrequentCompanion: false,
    };
  };

  const getCategoryLabel = (categoria: string): string => {
    const labels: Record<string, string> = {
      adulto: 'Adulto',
      nino: 'Niño',
      infante: 'Infante',
      adulto_mayor: 'Adulto Mayor',
      mascota: 'Mascota',
    };
    return labels[categoria] || categoria;
  };

  const handleTravelerChange = (index: number, field: keyof TravelerFormData, value: string | number | boolean) => {
    const updatedTravelers = [...travelers];
    updatedTravelers[index] = {
      ...updatedTravelers[index],
      [field]: value,
    };
    setTravelers(updatedTravelers);

    if (field === 'fecha_nacimiento' && typeof value === 'string' && value) {
      const result = validateBirthDateForCategory(
        value,
        updatedTravelers[index].categoria_viajero,
        tour?.start_date
      );
      const newErrors = [...travelerErrors];
      while (newErrors.length <= index) newErrors.push('');
      newErrors[index] = result.isValid ? '' : result.errorMessage;
      setTravelerErrors(newErrors);
    }
  };

  const selectFrequentCompanion = (index: number, companion: FrequentCompanion) => {
    const updatedTravelers = [...travelers];
    updatedTravelers[index] = {
      ...updatedTravelers[index],
      nombre: companion.nombre,
      email: companion.email,
      telefono: companion.telefono || '',
      fecha_nacimiento: companion.fecha_nacimiento,
      selectedCompanionId: companion.id,
    };
    setTravelers(updatedTravelers);

    if (companion.fecha_nacimiento && updatedTravelers[index].categoria_viajero !== 'mascota') {
      const result = validateBirthDateForCategory(
        companion.fecha_nacimiento,
        updatedTravelers[index].categoria_viajero,
        tour?.start_date
      );
      const newErrors = [...travelerErrors];
      while (newErrors.length <= index) newErrors.push('');
      newErrors[index] = result.isValid ? '' : result.errorMessage;
      setTravelerErrors(newErrors);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: string[] = new Array(travelers.length).fill('');

    for (let i = 0; i < travelers.length; i++) {
      const traveler = travelers[i];

      if (!traveler.nombre.trim()) {
        setError(`Por favor ingresa el nombre completo del viajero ${i + 1}`);
        return false;
      }

      if (traveler.categoria_viajero !== 'mascota') {
        if (!traveler.email.trim()) {
          setError(`Por favor ingresa el email del viajero ${i + 1}`);
          return false;
        }

        if (!traveler.fecha_nacimiento) {
          setError(`Por favor ingresa la fecha de nacimiento del viajero ${i + 1}`);
          return false;
        }

        const result = validateBirthDateForCategory(
          traveler.fecha_nacimiento,
          traveler.categoria_viajero,
          tour?.start_date
        );
        if (!result.isValid) {
          newErrors[i] = result.errorMessage;
          setTravelerErrors(newErrors);
          setError(`La fecha de nacimiento del viajero ${i + 1} no corresponde con su categoría. Verifica los datos o regresa a modificar la reserva.`);
          return false;
        }
      }
    }

    setTravelerErrors(newErrors);
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      await supabase
        .from('booking_travelers')
        .delete()
        .eq('booking_id', bookingId);

      const travelersToInsert = travelers.map(traveler => ({
        booking_id: bookingId,
        categoria_viajero: traveler.categoria_viajero,
        nombre: traveler.nombre,
        email: traveler.email,
        telefono: traveler.telefono || null,
        fecha_nacimiento: traveler.fecha_nacimiento || null,
        precio_aplicado: traveler.precio_aplicado,
        frequent_companion_id: traveler.selectedCompanionId || null,
      }));

      console.log('Datos a insertar:', travelersToInsert);

      const { error: insertError } = await supabase
        .from('booking_travelers')
        .insert(travelersToInsert);

      if (insertError) {
        console.error('Error de inserción:', insertError);
        throw new Error(`Error al guardar los datos de viajeros: ${insertError.message}`);
      }

      for (const traveler of travelers) {
        if (traveler.saveAsFrequentCompanion && traveler.categoria_viajero !== 'mascota') {
          const existingCompanion = frequentCompanions.find(
            c => c.email === traveler.email && c.fecha_nacimiento === traveler.fecha_nacimiento
          );

          if (!existingCompanion) {
            await supabase.from('frequent_companions').insert({
              user_id: user?.id,
              nombre: traveler.nombre,
              email: traveler.email,
              telefono: traveler.telefono || null,
              fecha_nacimiento: traveler.fecha_nacimiento,
            });
          }
        }
      }

      const isEditingExisting = booking?.payment_status === 'succeeded' ||
                                booking?.status === 'confirmed' ||
                                booking?.status === 'completed';

      if (isEditingExisting) {
        navigate('/traveler/bookings');
      } else if (tour?.booking_approval_type === 'manual') {
        // Enviar notificación por email a la agencia
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log('📧 Enviando notificación de reserva a la agencia...');
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-request-notification`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ booking_id: bookingId }),
              }
            );

            const result = await response.json();
            console.log('📧 Respuesta del servidor:', result);

            if (!response.ok) {
              console.error('❌ Error al enviar notificación:', result);
            } else {
              console.log('✅ Notificación enviada exitosamente');
            }
          }
        } catch (emailError) {
          console.error('❌ Error enviando notificación a la agencia:', emailError);
        }
        navigate(`/booking-pending/${bookingId}`);
      } else {
        proceedToPayment();
      }

    } catch (err: any) {
      console.error('Error saving travelers:', err);
      setError(err.message || 'Error al guardar los datos');
    } finally {
      setIsSaving(false);
    }
  };

  const proceedToPayment = async () => {
    try {
      const { data: savedTravelers, error: travelersFetchError } = await supabase
        .from('booking_travelers')
        .select('categoria_viajero, fecha_nacimiento, nombre')
        .eq('booking_id', bookingId);

      if (!travelersFetchError && savedTravelers && savedTravelers.length > 0) {
        const { isValid, errors } = validateAllTravelers(savedTravelers, tour?.start_date);
        if (!isValid) {
          const firstErrorIdx = errors.findIndex(e => e !== '');
          const travelerName = savedTravelers[firstErrorIdx]?.nombre || `Viajero ${firstErrorIdx + 1}`;
          setError(`No se puede procesar el pago: la fecha de nacimiento de ${travelerName} no corresponde con su categoría de viajero. Por favor corrige los datos.`);
          setTravelerErrors(errors);
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Calcular el monto a cobrar después de aplicar puntos y ToursRed Cash
      const pointsUsed = booking?.points_used || 0;
      const pointsDiscountAmount = pointsUsed / 100; // convertir puntos a pesos
      const toursRedCashUsed = booking?.toursred_cash_used || 0;
      const amountToCharge = (booking?.user_payment || 0) - pointsDiscountAmount - toursRedCashUsed;

      console.log('💵 Cálculo de pago:', {
        user_payment: booking?.user_payment,
        pointsUsed,
        pointsDiscountAmount,
        toursRedCashUsed,
        amountToCharge
      });

      // Si el monto a cobrar es 0 o menor, marcar la reserva como pagada directamente
      if (amountToCharge <= 0) {
        console.log('💰 Procesando pago con puntos y/o ToursRed Cash...');

        // PRIMERO: Descontar ToursRed Cash usando la función que actualiza el saldo
        if (toursRedCashUsed > 0) {
          console.log(`💵 Descontando ${toursRedCashUsed} MXN de ToursRed Cash...`);
          const { data: walletResult, error: walletError } = await supabase.rpc(
            'update_wallet_balance',
            {
              p_user_id: user?.id,
              p_amount: -toursRedCashUsed, // Negativo para restar del saldo
              p_type: 'debit',
              p_description: `Pago de reserva para ${tour?.name}`,
              p_reference_id: bookingId,
              p_reference_type: 'booking'
            }
          );

          if (walletError) {
            console.error('❌ Error descontando ToursRed Cash del monedero:', walletError);
            throw new Error(`Error al procesar el pago con ToursRed Cash: ${walletError.message}`);
          }

          console.log('✅ ToursRed Cash descontado exitosamente:', walletResult);
        }

        // SEGUNDO: Descontar puntos del monedero manualmente
        if (pointsUsed > 0) {
          console.log(`🎯 Descontando ${pointsUsed} puntos del monedero...`);

          try {
            const { data: wallet, error: walletError } = await supabase
              .from('toursred_points_wallets')
              .select('id, balance, total_used')
              .eq('user_id', user?.id)
              .single();

            if (walletError || !wallet) {
              throw new Error('No se encontró la billetera de puntos');
            }

            const newBalance = wallet.balance - pointsUsed;
            const newTotalUsed = wallet.total_used + pointsUsed;

            const { error: updateWalletError } = await supabase
              .from('toursred_points_wallets')
              .update({
                balance: newBalance,
                total_used: newTotalUsed,
                updated_at: new Date().toISOString()
              })
              .eq('id', wallet.id);

            if (updateWalletError) {
              throw new Error(`Error al actualizar wallet: ${updateWalletError.message}`);
            }

            const { error: txError } = await supabase
              .from('toursred_points_transactions')
              .insert({
                wallet_id: wallet.id,
                user_id: user?.id,
                amount: -pointsUsed,
                balance_after: newBalance,
                type: 'redeemed',
                description: 'Puntos canjeados en reserva',
                reference_id: bookingId,
                reference_type: 'booking'
              });

            if (txError) {
              console.error('Error creando transacción de puntos:', txError);
            }

            console.log(`✅ Puntos descontados del monedero`);
          } catch (pointsError) {
            console.error('Error al canjear puntos:', pointsError);
            throw new Error(`Error al canjear puntos: ${pointsError instanceof Error ? pointsError.message : String(pointsError)}`);
          }
        }

        // TERCERO: Calcular beneficio de membresía si aplica (ANTES de actualizar)
        let membershipBenefitData: any = {};
        try {
          const { data: bookingWithDetails } = await supabase
            .from('bookings')
            .select('user_id, total_price, service_charge')
            .eq('id', bookingId)
            .single();

          if (bookingWithDetails) {
            const { data: membership } = await supabase
              .from('memberships')
              .select('id, service_fee_exemption_used')
              .eq('user_id', bookingWithDetails.user_id)
              .eq('status', 'active')
              .maybeSingle();

            if (membership) {
              const { data: settings } = await supabase
                .from('platform_settings')
                .select('service_charge_percentage')
                .maybeSingle();

              const serviceChargeRate = settings?.service_charge_percentage || 5;
              const fullServiceCharge = (bookingWithDetails.total_price * serviceChargeRate) / 100;
              const actualServiceCharge = parseFloat(bookingWithDetails.service_charge || 0);
              const exemptionUsed = fullServiceCharge - actualServiceCharge;

              if (exemptionUsed > 0) {
                await supabase
                  .from('memberships')
                  .update({
                    service_fee_exemption_used: parseFloat(membership.service_fee_exemption_used) + exemptionUsed
                  })
                  .eq('id', membership.id);

                membershipBenefitData = {
                  used_membership_benefit: true,
                  membership_service_fee_saved: exemptionUsed
                };

                console.log(`✅ Beneficio de membresía calculado: ${exemptionUsed} MXN`);
              }
            }
          }
        } catch (membershipError) {
          console.error('Error procesando beneficio de membresía:', membershipError);
        }

        // CUARTO: Determinar el método de pago y actualizar la reserva (UN SOLO UPDATE)
        let paymentMethod = 'toursred_points';
        if (pointsUsed > 0 && toursRedCashUsed > 0) {
          paymentMethod = 'toursred_points_cash';
        } else if (toursRedCashUsed > 0) {
          paymentMethod = 'toursred_cash';
        }

        console.log(`📝 Confirmando reserva con método de pago: ${paymentMethod}`);
        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            payment_status: 'succeeded',
            status: 'confirmed',
            payment_method: paymentMethod,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            points_used: pointsUsed,
            toursred_cash_used: toursRedCashUsed,
            ...membershipBenefitData
          })
          .eq('id', bookingId);

        if (updateError) {
          console.error('❌ Error al confirmar la reserva:', updateError);
          throw new Error(`Error al confirmar la reserva: ${updateError.message}`);
        }

        console.log('✅ Reserva confirmada exitosamente');

        if (booking?.discount_code_id) {
          try {
            await supabase.from('discount_code_usage').insert({
              discount_code_id: booking.discount_code_id,
              user_id: user?.id,
              booking_id: bookingId,
            });
          } catch (discountErr) {
            console.error('Error registrando uso de codigo de descuento:', discountErr);
          }
        }

        // QUINTO: Enviar emails de confirmación a viajero, agencia y admin
        try {
          console.log('📧 Enviando emails de confirmación para reserva pagada con puntos/cash...');
          console.log('📧 URL del endpoint:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-confirmation`);
          console.log('📧 Booking ID:', bookingId);
          console.log('📧 Session token presente:', !!session.access_token);

          const emailResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-confirmation`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ booking_id: bookingId }),
            }
          );

          console.log('📧 Status de respuesta del email:', emailResponse.status);

          if (emailResponse.ok) {
            const emailResult = await emailResponse.json();
            console.log('✅ Emails de confirmación enviados exitosamente:', emailResult);
          } else {
            const errorText = await emailResponse.text();
            console.error('❌ Error HTTP en envío de emails:', {
              status: emailResponse.status,
              statusText: emailResponse.statusText,
              error: errorText
            });
            // No lanzamos error aquí porque los emails no deben bloquear el flujo
          }
        } catch (emailError) {
          console.error('❌ Excepción al enviar emails de confirmación:', {
            error: emailError,
            message: emailError instanceof Error ? emailError.message : String(emailError),
            stack: emailError instanceof Error ? emailError.stack : undefined
          });
          // No lanzamos error aquí porque los emails no deben bloquear el flujo
        }

        console.log('✅ Proceso completado, redirigiendo a página de éxito...');
        // Redirigir a la página de éxito
        navigate(`/booking-success?booking_id=${bookingId}`);
        return;
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
            bookingId: bookingId,
            customerEmail: user?.email,
            amount: amountToCharge,
            description: `Depósito para ${tour?.name}`,
            success_url: `${window.location.origin}/booking-success?booking_id=${bookingId}`,
            cancel_url: `${window.location.origin}/booking-cancel?booking_id=${bookingId}`,
            toursRedCashUsed: toursRedCashUsed,
            pointsUsed: pointsUsed,
            metadata: {
              points_used: pointsUsed.toString(),
              points_discount: pointsDiscountAmount.toString(),
              discount_code_id: booking?.discount_code_id || '',
              discount_amount: (booking?.discount_amount || 0).toString(),
            }
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear la sesión de pago');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al crear la sesión de pago');
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No se recibió la URL de pago');
      }

    } catch (error: any) {
      console.error('Error creando sesión de checkout:', error);
      setError(error.message || 'Error al procesar el pago');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!booking || !tour) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">No se pudo cargar la información de la reserva</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Volver
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center mb-4">
            <Users className="w-6 h-6 text-primary-600 mr-2" />
            <h1 className="text-2xl font-bold">Información de Viajeros</h1>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Tour:</strong> {tour.name}
            </p>
            <p className="text-sm text-blue-800 mt-1">
              Por favor ingresa la información de todos los viajeros que participarán en este tour.
            </p>
          </div>

          {frequentCompanions.length > 0 && (
            <div className="mb-6 border-t border-gray-200 pt-6">
              <button
                onClick={() => setShowCompanionsSection(!showCompanionsSection)}
                className="flex items-center justify-between w-full text-left mb-4"
              >
                <h2 className="text-lg font-semibold flex items-center">
                  <UserPlus className="w-5 h-5 mr-2" />
                  Acompañantes frecuentes
                </h2>
                <span className="text-sm text-gray-500">
                  {showCompanionsSection ? '▼' : '▶'}
                </span>
              </button>

              {showCompanionsSection && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {frequentCompanions.map((companion) => (
                    <div
                      key={companion.id}
                      className="border border-gray-200 rounded-lg p-3 hover:border-primary-500 hover:bg-primary-50 transition-colors cursor-default"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-2">
                            <Users className="w-5 h-5 text-primary-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{companion.nombre}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(companion.fecha_nacimiento).getFullYear()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{companion.email}</p>
                      <p className="text-xs text-gray-400">
                        Haz clic en "Usar datos" para autocompletar
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {travelers.map((traveler, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">
                    {getCategoryLabel(traveler.categoria_viajero)} {index + 1}
                    <span className="text-sm text-gray-500 ml-2">
                      (${traveler.precio_aplicado.toLocaleString()})
                    </span>
                  </h3>

                  {frequentCompanions.length > 0 && traveler.categoria_viajero !== 'mascota' && (
                    <div className="relative">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const companion = frequentCompanions.find(c => c.id === e.target.value);
                            if (companion) selectFrequentCompanion(index, companion);
                          }
                        }}
                        className="text-sm border border-gray-300 rounded-md px-3 py-1 hover:border-primary-500 focus:border-primary-500 focus:outline-none"
                        value=""
                      >
                        <option value="">Usar datos guardados</option>
                        {frequentCompanions.map((companion) => (
                          <option key={companion.id} value={companion.id}>
                            {companion.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      value={traveler.nombre}
                      onChange={(e) => handleTravelerChange(index, 'nombre', e.target.value)}
                      className="input"
                      placeholder={traveler.categoria_viajero === 'mascota' ? 'Nombre de la mascota' : 'Nombre y apellidos'}
                      required
                    />
                  </div>

                  {traveler.categoria_viajero !== 'mascota' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fecha de Nacimiento *
                        </label>
                        <input
                          type="date"
                          value={traveler.fecha_nacimiento}
                          onChange={(e) => handleTravelerChange(index, 'fecha_nacimiento', e.target.value)}
                          className={`input ${travelerErrors[index] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          required
                        />
                        {travelerErrors[index] && (
                          <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-3">
                            <div className="flex items-start">
                              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                              <div className="text-sm text-red-700">
                                <p>{travelerErrors[index]}</p>
                                <p className="mt-2 text-xs">
                                  Verifica la fecha de nacimiento o{' '}
                                  <Link
                                    to={`/tours/${tour?.id}`}
                                    className="font-semibold text-red-800 underline hover:text-red-900"
                                  >
                                    regresa a actualizar la reserva
                                  </Link>{' '}
                                  y selecciona el tipo de viajero que corresponde.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={traveler.email}
                          onChange={(e) => handleTravelerChange(index, 'email', e.target.value)}
                          className="input"
                          placeholder="correo@ejemplo.com"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={traveler.telefono}
                          onChange={(e) => handleTravelerChange(index, 'telefono', e.target.value)}
                          className="input"
                          placeholder="+52 123 456 7890"
                        />
                      </div>
                    </>
                  )}
                </div>

                {traveler.categoria_viajero !== 'mascota' && index > 0 && (
                  <div className="mt-4">
                    <label className="flex items-center text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={traveler.saveAsFrequentCompanion}
                        onChange={(e) => handleTravelerChange(index, 'saveAsFrequentCompanion', e.target.checked)}
                        className="mr-2 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="flex items-center">
                        <Check className="w-4 h-4 text-green-600 mr-1" />
                        Guardar como acompañante frecuente
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 ml-6 mt-1">
                      Los datos de este viajero se guardarán en tu cuenta para futuras reservas
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || travelerErrors.some(e => e !== '')}
              className={`px-6 py-3 rounded-md font-semibold flex items-center ${
                isSaving || travelerErrors.some(e => e !== '')
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  {(booking?.payment_status === 'succeeded' ||
                    booking?.status === 'confirmed' ||
                    booking?.status === 'completed')
                    ? 'Guardar Cambios'
                    : 'Continuar al Pago'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelersInfoPage;
