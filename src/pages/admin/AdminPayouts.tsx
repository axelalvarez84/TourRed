import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Calendar, Clock, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import type { CommissionRecord, Agency, Tour, AgencyPayout } from '../../types';

interface AgencyPayoutSummary {
  agency_id: string;
  agency_name: string;
  total_pending: number;
  tours_count: number;
  commission_records_count: number;
  last_payout_date?: string;
  days_since_last_payout?: number;
  frequency: string;
  next_scheduled_payout?: string;
}

const AdminPayouts: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'by-agency' | 'by-tour'>('by-agency');
  const [agencySummaries, setAgencySummaries] = useState<AgencyPayoutSummary[]>([]);
  const [completedTours, setCompletedTours] = useState<any[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);

  useEffect(() => {
    fetchPayoutData();
  }, [view]);

  const fetchPayoutData = async () => {
    try {
      setIsLoading(true);

      if (view === 'by-agency') {
        await fetchAgencyView();
      } else {
        await fetchTourView();
      }
    } catch (error) {
      console.error('Error fetching payout data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAgencyView = async () => {
    const { data: commissionRecords, error } = await supabase
      .from('commission_records')
      .select(`
        *,
        agencies!inner(id, name),
        payout_schedules(frequency, last_payout_date, next_scheduled_payout)
      `)
      .in('status', ['pending', 'processed']);

    if (error) throw error;

    const agencyMap = new Map<string, AgencyPayoutSummary>();

    commissionRecords?.forEach((record) => {
      const agencyId = record.agency_id;
      if (!agencyMap.has(agencyId)) {
        const schedule = record.payout_schedules;
        const lastPayoutDate = schedule?.last_payout_date;
        const daysSince = lastPayoutDate
          ? Math.floor((Date.now() - new Date(lastPayoutDate).getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        agencyMap.set(agencyId, {
          agency_id: agencyId,
          agency_name: record.agencies.name,
          total_pending: 0,
          tours_count: 0,
          commission_records_count: 0,
          last_payout_date: lastPayoutDate,
          days_since_last_payout: daysSince,
          frequency: schedule?.frequency || 'weekly',
          next_scheduled_payout: schedule?.next_scheduled_payout,
        });
      }

      const summary = agencyMap.get(agencyId)!;
      summary.total_pending += Number(record.agency_net_amount);
      summary.commission_records_count++;
    });

    setAgencySummaries(Array.from(agencyMap.values()).sort((a, b) => b.total_pending - a.total_pending));
  };

  const fetchTourView = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: tours, error } = await supabase
      .from('tours')
      .select(`
        *,
        agencies(name),
        bookings!inner(
          id,
          status,
          payment_status,
          total_price
        )
      `)
      .lt('end_date', today.toISOString())
      .eq('bookings.status', 'confirmed')
      .eq('bookings.payment_status', 'succeeded');

    if (error) throw error;

    const tourMap = new Map();

    tours?.forEach((tour) => {
      if (!tourMap.has(tour.id)) {
        const daysCompleted = Math.floor((Date.now() - new Date(tour.end_date).getTime()) / (1000 * 60 * 60 * 24));
        tourMap.set(tour.id, {
          tour_id: tour.id,
          tour_name: tour.name,
          agency_name: tour.agencies.name,
          end_date: tour.end_date,
          days_completed: daysCompleted,
          bookings_count: 0,
          total_revenue: 0,
          ready_for_payout: daysCompleted >= 3,
        });
      }

      const tourData = tourMap.get(tour.id);
      tourData.bookings_count++;
      tourData.total_revenue += Number(tour.bookings[0]?.total_price || 0);
    });

    setCompletedTours(
      Array.from(tourMap.values()).sort((a, b) => b.days_completed - a.days_completed)
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const getFrequencyBadge = (frequency: string) => {
    const labels = {
      weekly: 'Semanal',
      biweekly: 'Quincenal',
      monthly: 'Mensual',
      custom: 'Personalizado',
    };

    return (
      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
        {labels[frequency as keyof typeof labels] || frequency}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Pagos</h1>
        <p className="mt-2 text-gray-600">
          Administra y procesa pagos a agencias
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setView('by-agency')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              view === 'by-agency'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Por Agencia
          </button>
          <button
            onClick={() => setView('by-tour')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              view === 'by-tour'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Por Tour Completado
          </button>
        </div>

        {view === 'by-agency' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Pendiente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registros
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Último Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frecuencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Próximo Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {agencySummaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No hay pagos pendientes
                    </td>
                  </tr>
                ) : (
                  agencySummaries.map((agency) => (
                    <tr key={agency.agency_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{agency.agency_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-green-600">
                          {formatCurrency(agency.total_pending)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{agency.commission_records_count}</div>
                      </td>
                      <td className="px-6 py-4">
                        {agency.last_payout_date ? (
                          <div>
                            <div className="text-sm text-gray-900">
                              {format(new Date(agency.last_payout_date), 'dd/MM/yyyy')}
                            </div>
                            <div className="text-xs text-gray-500">
                              Hace {agency.days_since_last_payout} días
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Sin pagos previos</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {getFrequencyBadge(agency.frequency)}
                      </td>
                      <td className="px-6 py-4">
                        {agency.next_scheduled_payout ? (
                          <div className="text-sm text-gray-900">
                            {format(new Date(agency.next_scheduled_payout), 'dd/MM/yyyy')}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedAgency(agency.agency_id);
                            setShowProcessModal(true);
                          }}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
                        >
                          Procesar Pago
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tour
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agencia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha Fin
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Días Completado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reservas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {completedTours.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No hay tours completados pendientes de pago
                    </td>
                  </tr>
                ) : (
                  completedTours.map((tour) => (
                    <tr key={tour.tour_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{tour.tour_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tour.agency_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {format(new Date(tour.end_date), 'dd/MM/yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tour.days_completed} días</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tour.bookings_count}</div>
                      </td>
                      <td className="px-6 py-4">
                        {tour.ready_for_payout ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                            Listo para Pago
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                            En Espera
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showProcessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Procesar Pago</h3>
            <p className="text-gray-600 mb-6">
              La funcionalidad de procesamiento de pagos estará disponible próximamente.
            </p>
            <button
              onClick={() => {
                setShowProcessModal(false);
                setSelectedAgency(null);
              }}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayouts;