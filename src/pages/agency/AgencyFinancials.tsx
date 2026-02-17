import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { DollarSign, TrendingUp, Calendar, Download, FileText, CheckCircle, Clock, Eye, CreditCard, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import type { FinancialSummary, TourFinancialSummary, CommissionRecord } from '../../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const AgencyFinancials: React.FC = () => {
  const { user } = useAuth();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary>({
    pending_balance: 0,
    paid_this_month: 0,
    total_lifetime: 0,
  });
  const [tourSummaries, setTourSummaries] = useState<TourFinancialSummary[]>([]);
  const [commissionRecords, setCommissionRecords] = useState<CommissionRecord[]>([]);
  const [processedPayments, setProcessedPayments] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user?.id) {
      fetchAgencyData();
    }
  }, [user]);

  useEffect(() => {
    if (agencyId) {
      fetchFinancialData();
    }
  }, [agencyId, startDate, endDate, statusFilter]);

  const fetchAgencyData = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setAgencyId(data.id);
    } catch (error) {
      console.error('Error fetching agency:', error);
    }
  };

  const fetchFinancialData = async () => {
    if (!agencyId) return;

    try {
      setIsLoading(true);

      let query = supabase
        .from('commission_records')
        .select(`
          *,
          bookings!inner(
            tour_id,
            booking_date,
            tours!inner(name, start_date)
          )
        `)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: records, error } = await query;

      if (error) throw error;

      setCommissionRecords(records || []);

      const pending = records?.filter(r => r.status === 'pending').reduce((sum, r) => sum + Number(r.agency_net_amount), 0) || 0;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const paidThisMonth = records?.filter(r => {
        if (r.status !== 'processed' && r.status !== 'paid_out') return false;
        const processedDate = new Date(r.processed_at || r.created_at);
        return processedDate >= startOfMonth;
      }).reduce((sum, r) => sum + Number(r.agency_net_amount), 0) || 0;

      const totalLifetime = records?.filter(r => r.status === 'processed' || r.status === 'paid_out').reduce((sum, r) => sum + Number(r.agency_net_amount), 0) || 0;

      setSummary({
        pending_balance: pending,
        paid_this_month: paidThisMonth,
        total_lifetime: totalLifetime,
      });

      const tourMap = new Map<string, TourFinancialSummary>();

      records?.forEach(record => {
        const booking = record.bookings;
        if (!booking || !booking.tour_id) return;

        const tour = booking.tours;
        if (!tour) return;

        const tourId = booking.tour_id;

        if (!tourMap.has(tourId)) {
          tourMap.set(tourId, {
            tour_id: tourId,
            tour_name: tour.name,
            tour_date: tour.start_date,
            bookings_count: 0,
            gross_revenue: 0,
            platform_commission: 0,
            net_to_agency: 0,
            payment_status: (record.status === 'processed' || record.status === 'paid_out') ? 'paid' : 'pending',
          });
        }

        const summary = tourMap.get(tourId)!;
        summary.bookings_count++;
        summary.gross_revenue += Number(record.total_tour_price);
        summary.platform_commission += Number(record.agency_commission_amount) + Number(record.service_charge_amount);
        summary.net_to_agency += Number(record.agency_net_amount);
      });

      setTourSummaries(Array.from(tourMap.values()).sort((a, b) =>
        new Date(b.tour_date).getTime() - new Date(a.tour_date).getTime()
      ));

      const processedPaymentsMap = new Map<string, any>();

      records?.filter(r => r.status === 'processed' && r.processed_at).forEach(record => {
        const paymentDate = format(new Date(record.processed_at), 'yyyy-MM-dd');
        const paymentMethod = record.payment_method || 'bank_transfer';

        if (!processedPaymentsMap.has(paymentDate)) {
          processedPaymentsMap.set(paymentDate, {
            payment_date: record.processed_at,
            payment_method: paymentMethod,
            total_amount: 0,
            records_count: 0,
            payment_receipt_url: record.payment_receipt_url,
            payment_notes: record.payment_notes,
          });
        }

        const payment = processedPaymentsMap.get(paymentDate)!;
        payment.total_amount += Number(record.agency_net_amount);
        payment.records_count++;
      });

      setProcessedPayments(Array.from(processedPaymentsMap.values()).sort((a, b) =>
        new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      ));

    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      processed: 'bg-blue-100 text-blue-800',
      paid_out: 'bg-green-100 text-green-800',
      paid: 'bg-green-100 text-green-800',
    };

    const labels = {
      pending: 'Pendiente',
      processed: 'Procesado',
      paid_out: 'Pagado',
      paid: 'Pagado',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      bank_transfer: 'Transferencia Bancaria',
      check: 'Cheque',
      paypal: 'PayPal',
      mercadopago: 'Mercado Pago',
      other: 'Otro',
    };
    return labels[method] || method;
  };

  const generatePDFStatement = async () => {
    if (!agencyId) return;

    try {
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('name, email, phone')
        .eq('id', agencyId)
        .single();

      const doc = new jsPDF();

      doc.setFontSize(20);
      doc.text('Estado de Cuenta', 105, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.text(`Agencia: ${agencyData?.name || 'N/A'}`, 20, 35);
      doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy')}`, 20, 42);

      if (startDate || endDate) {
        const period = `Período: ${startDate ? format(new Date(startDate), 'dd/MM/yyyy') : 'Inicio'} - ${endDate ? format(new Date(endDate), 'dd/MM/yyyy') : 'Actual'}`;
        doc.text(period, 20, 49);
      }

      doc.setFontSize(14);
      doc.text('Resumen Financiero', 20, 65);

      const summaryData = [
        ['Concepto', 'Monto'],
        ['Saldo Pendiente', formatCurrency(summary.pending_balance)],
        ['Cobrado Este Mes', formatCurrency(summary.paid_this_month)],
        ['Total Histórico', formatCurrency(summary.total_lifetime)],
      ];

      (doc as any).autoTable({
        startY: 70,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 15;

      doc.setFontSize(14);
      doc.text('Detalle por Tour', 20, currentY);

      const tourData = [
        ['Tour', 'Fecha', 'Reservas', 'Ingreso Bruto', 'Comisión', 'Neto', 'Estado'],
        ...tourSummaries.map(tour => [
          tour.tour_name,
          format(new Date(tour.tour_date), 'dd/MM/yyyy'),
          tour.bookings_count.toString(),
          formatCurrency(tour.gross_revenue),
          formatCurrency(tour.platform_commission),
          formatCurrency(tour.net_to_agency),
          tour.payment_status === 'paid' ? 'Pagado' : 'Pendiente',
        ]),
      ];

      (doc as any).autoTable({
        startY: currentY + 5,
        head: [tourData[0]],
        body: tourData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8 },
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      if (processedPayments.length > 0) {
        doc.setFontSize(14);
        doc.text('Pagos Recibidos', 20, currentY);

        const paymentsData = [
          ['Fecha', 'Monto', 'Método', 'Comisiones'],
          ...processedPayments.map(payment => [
            format(new Date(payment.payment_date), 'dd/MM/yyyy'),
            formatCurrency(payment.total_amount),
            getPaymentMethodLabel(payment.payment_method),
            payment.records_count.toString(),
          ]),
        ];

        (doc as any).autoTable({
          startY: currentY + 5,
          head: [paymentsData[0]],
          body: paymentsData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] },
        });
      }

      doc.save(`estado-cuenta-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF');
    }
  };

  const generateExcelStatement = async () => {
    if (!agencyId) return;

    try {
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('name, email, phone')
        .eq('id', agencyId)
        .single();

      const wb = XLSX.utils.book_new();

      const summarySheet = [
        ['Estado de Cuenta - ' + (agencyData?.name || 'Agencia')],
        ['Fecha:', format(new Date(), 'dd/MM/yyyy')],
        [''],
        ['Resumen Financiero'],
        ['Concepto', 'Monto'],
        ['Saldo Pendiente', summary.pending_balance],
        ['Cobrado Este Mes', summary.paid_this_month],
        ['Total Histórico', summary.total_lifetime],
      ];

      const ws1 = XLSX.utils.aoa_to_sheet(summarySheet);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

      const tourSheet = [
        ['Detalle por Tour'],
        [''],
        ['Tour', 'Fecha', 'Reservas', 'Ingreso Bruto', 'Comisión Plataforma', 'Neto para Agencia', 'Estado'],
        ...tourSummaries.map(tour => [
          tour.tour_name,
          format(new Date(tour.tour_date), 'dd/MM/yyyy'),
          tour.bookings_count,
          tour.gross_revenue,
          tour.platform_commission,
          tour.net_to_agency,
          tour.payment_status === 'paid' ? 'Pagado' : 'Pendiente',
        ]),
      ];

      const ws2 = XLSX.utils.aoa_to_sheet(tourSheet);
      XLSX.utils.book_append_sheet(wb, ws2, 'Tours');

      if (processedPayments.length > 0) {
        const paymentsSheet = [
          ['Pagos Recibidos'],
          [''],
          ['Fecha', 'Monto', 'Método de Pago', 'Comisiones Pagadas', 'Notas'],
          ...processedPayments.map(payment => [
            format(new Date(payment.payment_date), 'dd/MM/yyyy'),
            payment.total_amount,
            getPaymentMethodLabel(payment.payment_method),
            payment.records_count,
            payment.payment_notes || '-',
          ]),
        ];

        const ws3 = XLSX.utils.aoa_to_sheet(paymentsSheet);
        XLSX.utils.book_append_sheet(wb, ws3, 'Pagos');
      }

      XLSX.writeFile(wb, `estado-cuenta-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Error al generar el archivo Excel');
    }
  };

  if (isLoading && !agencyId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Estado Financiero</h1>
        <p className="mt-2 text-gray-600">
          Gestiona y monitorea tus ingresos, comisiones y pagos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Saldo Pendiente</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(summary.pending_balance)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">Por cobrar de tours completados</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Cobrado Este Mes</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(summary.paid_this_month)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">Pagos recibidos en {format(new Date(), 'MMMM')}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Histórico</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(summary.total_lifetime)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">Ingresos totales acumulados</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Próximo Pago</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {summary.next_payout_date ? format(new Date(summary.next_payout_date), 'dd/MM') : '-'}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            {summary.next_payout_amount ? formatCurrency(summary.next_payout_amount) : 'Por determinar'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-xl font-bold text-gray-900">Resumen por Tour</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="processed">Procesado</option>
                <option value="paid_out">Pagado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tour
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reservas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ingreso Bruto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comisión Plataforma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Neto para Agencia
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tourSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No hay registros financieros disponibles
                  </td>
                </tr>
              ) : (
                tourSummaries.map((tour) => (
                  <tr key={tour.tour_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{tour.tour_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {format(new Date(tour.tour_date), 'dd/MM/yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{tour.bookings_count}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(tour.gross_revenue)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-red-600">
                        -{formatCurrency(tour.platform_commission)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-green-600">
                        {formatCurrency(tour.net_to_agency)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(tour.payment_status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {tourSummaries.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr className="font-bold">
                  <td colSpan={2} className="px-6 py-4 text-sm text-gray-900">
                    TOTALES
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {tourSummaries.reduce((sum, t) => sum + t.bookings_count, 0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatCurrency(tourSummaries.reduce((sum, t) => sum + t.gross_revenue, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600">
                    -{formatCurrency(tourSummaries.reduce((sum, t) => sum + t.platform_commission, 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-green-600">
                    {formatCurrency(tourSummaries.reduce((sum, t) => sum + t.net_to_agency, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Pagos Recibidos</h2>

        {processedPayments.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No hay pagos recibidos aún</p>
            <p className="text-sm text-gray-500 mt-1">
              Los pagos procesados aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {processedPayments.map((payment, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CreditCard className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {formatCurrency(payment.total_amount)}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {format(new Date(payment.payment_date), "dd 'de' MMMM, yyyy")}
                        </p>
                      </div>
                    </div>

                    <div className="ml-11 space-y-1">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Método:</span> {getPaymentMethodLabel(payment.payment_method)}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Comisiones pagadas:</span> {payment.records_count}
                      </p>
                      {payment.payment_notes && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Notas:</span> {payment.payment_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {payment.payment_receipt_url && (
                    <div>
                      <a
                        href={payment.payment_receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        <Eye className="h-4 w-4" />
                        Ver Comprobante
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <FileText className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Descargar Estado de Cuenta
            </h3>
            <p className="text-gray-700 mb-4">
              Genera y descarga tu estado de cuenta completo con el desglose de todas tus transacciones, pagos recibidos y saldos pendientes.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={generatePDFStatement}
                className="flex items-center gap-2 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </button>
              <button
                onClick={generateExcelStatement}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyFinancials;