import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Calendar, Clock, CheckCircle, AlertCircle, Download, Plus, RefreshCw, Upload } from 'lucide-react';
import { formatCurrencyMXN } from '../../utils/formatCurrency';
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

interface CompletedTourData {
  tour_id: string;
  tour_name: string;
  agency_id: string;
  agency_name: string;
  end_date: string;
  days_completed: number;
  bookings_count: number;
  total_revenue: number;
  commission_records_exist: boolean;
  commission_records_count: number;
  total_commission_pending: number;
  ready_for_payout: boolean;
  can_create_commissions: boolean;
}

const AdminPayouts: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'by-agency' | 'by-tour'>('by-tour');
  const [agencySummaries, setAgencySummaries] = useState<AgencyPayoutSummary[]>([]);
  const [completedTours, setCompletedTours] = useState<CompletedTourData[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState<string | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [isCreatingCommissions, setIsCreatingCommissions] = useState(false);
  const [creationMessage, setCreationMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

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
        agencies!inner(id, name)
      `)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching commission records:', error);
      throw error;
    }

    if (!commissionRecords || commissionRecords.length === 0) {
      setAgencySummaries([]);
      return;
    }

    const agencyIds = [...new Set(commissionRecords.map(r => r.agency_id))];

    const { data: payoutSchedules } = await supabase
      .from('payout_schedules')
      .select('*')
      .in('agency_id', agencyIds);

    const scheduleMap = new Map(payoutSchedules?.map(s => [s.agency_id, s]) || []);

    const agencyMap = new Map<string, AgencyPayoutSummary>();

    commissionRecords?.forEach((record) => {
      const agencyId = record.agency_id;
      if (!agencyMap.has(agencyId)) {
        const schedule = scheduleMap.get(agencyId);
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
    const { data, error } = await supabase.rpc('get_completed_tours_with_commission_status');

    if (error) {
      console.error('Error fetching completed tours:', error);
      throw error;
    }

    setCompletedTours(data || []);
  };

  const createCommissionRecords = async (tourId: string) => {
    setIsCreatingCommissions(true);
    setCreationMessage(null);

    try {
      const { data, error } = await supabase.rpc('create_commission_records_for_tour', {
        p_tour_id: tourId
      });

      if (error) throw error;

      if (data.success) {
        setCreationMessage({
          type: 'success',
          text: `${data.created_count} comisiones creadas para "${data.tour_name}". ${data.skipped_count > 0 ? `${data.skipped_count} ya existían.` : ''}`
        });

        await fetchPayoutData();
      } else {
        setCreationMessage({
          type: 'error',
          text: data.message || 'Error al crear comisiones'
        });
      }
    } catch (error: any) {
      console.error('Error creating commission records:', error);
      setCreationMessage({
        type: 'error',
        text: error.message || 'Error al crear comisiones'
      });
    } finally {
      setIsCreatingCommissions(false);

      setTimeout(() => {
        setCreationMessage(null);
      }, 5000);
    }
  };

  const formatCurrency = (amount: number) => formatCurrencyMXN(amount);

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
          <div>
            {creationMessage && (
              <div className={`mb-4 p-4 rounded-lg ${
                creationMessage.type === 'success'
                  ? 'bg-green-100 text-green-800 border border-green-200'
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {creationMessage.type === 'success' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  <p className="text-sm font-medium">{creationMessage.text}</p>
                </div>
              </div>
            )}

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
                      Comisión Pendiente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {completedTours.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
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
                          {tour.commission_records_exist && (
                            <div className="text-xs text-gray-500">
                              {tour.commission_records_count} comisiones
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {tour.commission_records_exist ? (
                            <div className="text-sm font-bold text-green-600">
                              {formatCurrency(tour.total_commission_pending)}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {!tour.commission_records_exist ? (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full font-medium">
                              Sin Comisiones
                            </span>
                          ) : tour.ready_for_payout ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                              Listo para Pago
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                              En Espera
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {!tour.commission_records_exist && tour.can_create_commissions ? (
                            <button
                              onClick={() => createCommissionRecords(tour.tour_id)}
                              disabled={isCreatingCommissions}
                              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isCreatingCommissions ? (
                                <>
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  Creando...
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4" />
                                  Crear Comisiones
                                </>
                              )}
                            </button>
                          ) : tour.commission_records_exist && tour.ready_for_payout ? (
                            <button
                              onClick={() => {
                                setSelectedTour(tour.tour_id);
                                setSelectedAgency(tour.agency_id);
                                setShowProcessModal(true);
                              }}
                              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
                            >
                              <DollarSign className="h-4 w-4" />
                              Procesar Pago
                            </button>
                          ) : tour.commission_records_exist ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Clock className="h-4 w-4" />
                              <span>Esperando {3 - tour.days_completed} días</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showProcessModal && (
        <ProcessPaymentModal
          isOpen={showProcessModal}
          onClose={() => {
            setShowProcessModal(false);
            setSelectedAgency(null);
            setSelectedTour(null);
          }}
          agencyId={selectedAgency}
          tourId={selectedTour}
          onSuccess={async () => {
            await fetchPayoutData();
            setShowProcessModal(false);
            setSelectedAgency(null);
            setSelectedTour(null);
          }}
        />
      )}
    </div>
  );
};

interface ProcessPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agencyId: string | null;
  tourId: string | null;
  onSuccess: () => void;
}

const ProcessPaymentModal: React.FC<ProcessPaymentModalProps> = ({
  isOpen,
  onClose,
  agencyId,
  tourId,
  onSuccess
}) => {
  const formatCurrency = (amount: number) => formatCurrencyMXN(amount);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'check' | 'paypal' | 'mercadopago' | 'other'>('bank_transfer');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  useEffect(() => {
    const loadPaymentDetails = async () => {
      if (isOpen && (agencyId || tourId)) {
        try {
          let query = supabase
            .from('commission_records')
            .select(`
              *,
              agencies!inner(id, name),
              tours!inner(id, name)
            `)
            .eq('status', 'pending');

          if (tourId) {
            query = query.eq('tour_id', tourId);
          } else if (agencyId) {
            query = query.eq('agency_id', agencyId);
          }

          const { data, error } = await query;

          if (error) throw error;

          const totalAmount = data?.reduce((sum, record) => sum + Number(record.agency_net_amount), 0) || 0;
          const recordsCount = data?.length || 0;

          setPaymentDetails({
            records: data,
            totalAmount,
            recordsCount,
            agencyName: data?.[0]?.agencies?.name || '',
            tourName: data?.[0]?.tours?.name || ''
          });
        } catch (error) {
          console.error('Error fetching payment details:', error);
        }
      }
    };
    loadPaymentDetails();
  }, [isOpen, agencyId, tourId]);

  const processPayment = async () => {
    if (!paymentDetails || !paymentDetails.records) return;

    setIsProcessing(true);

    try {
      const commissionIds = paymentDetails.records.map((r: any) => r.id);
      let receiptUrl = null;
      let receiptFilename = null;

      if (receiptFile) {
        setUploadingReceipt(true);
        const fileExt = receiptFile.name.split('.').pop();
        const timestamp = Date.now();
        const fileName = `${agencyId || tourId}_${timestamp}.${fileExt}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('payment-receipts')
          .upload(fileName, receiptFile);

        if (uploadError) {
          throw new Error('Error al subir comprobante: ' + uploadError.message);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('payment-receipts')
          .getPublicUrl(fileName);

        receiptUrl = publicUrl;
        receiptFilename = receiptFile.name;
        setUploadingReceipt(false);
      }

      const { error: updateError } = await supabase
        .from('commission_records')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          payment_method: paymentMethod,
          payment_notes: notes || null,
          payment_receipt_url: receiptUrl,
          payment_receipt_filename: receiptFilename,
          notified_at: new Date().toISOString()
        })
        .in('id', commissionIds);

      if (updateError) throw updateError;

      const agencyIdToNotify = agencyId || paymentDetails.records[0]?.agency_id;

      if (agencyIdToNotify) {
        await supabase.functions.invoke('send-payout-confirmation', {
          body: {
            agency_id: agencyIdToNotify,
            commission_ids: commissionIds,
            total_amount: paymentDetails.totalAmount,
            payment_method: paymentMethod,
            payment_notes: notes,
            receipt_url: receiptUrl
          }
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      alert('Error al procesar el pago: ' + error.message);
    } finally {
      setIsProcessing(false);
      setUploadingReceipt(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Procesar Pago</h3>
          {paymentDetails && (
            <p className="mt-2 text-gray-600">
              {tourId
                ? `Tour: ${paymentDetails.tourName}`
                : `Agencia: ${paymentDetails.agencyName}`}
            </p>
          )}
        </div>

        {paymentDetails ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total a Pagar</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(paymentDetails.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Comisiones</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {paymentDetails.recordsCount}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Método de Pago
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="bank_transfer">Transferencia Bancaria</option>
                <option value="check">Cheque</option>
                <option value="paypal">PayPal</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comprobante de Pago (opcional)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Formatos permitidos: JPG, PNG, PDF (máx. 5MB)
              </p>
              {receiptFile && (
                <p className="mt-2 text-sm text-green-600">
                  Archivo seleccionado: {receiptFile.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Agregar notas sobre este pago..."
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Importante:</p>
                  <p>
                    Al confirmar, las comisiones se marcarán como procesadas. Asegúrate de
                    haber realizado la transferencia bancaria antes de continuar.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={processPayment}
                disabled={isProcessing || uploadingReceipt}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploadingReceipt ? (
                  <>
                    <Upload className="h-5 w-5 animate-pulse" />
                    Subiendo comprobante...
                  </>
                ) : isProcessing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Confirmar Pago
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPayouts;