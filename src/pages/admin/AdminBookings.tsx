import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Search, X, ChevronDown, ChevronUp, ChevronsUpDown,
  User, Building2, MapPin, Calendar, CreditCard, DollarSign,
  CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw,
  Users, Star, Coins, Shield, FileText, ArrowLeftRight,
  Phone, Mail, Package, Percent, Hash, Tag, Info, Receipt,
  TrendingUp, BarChart2, Activity
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrencyMXN } from '../../utils/formatCurrency';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  booking_code: string | null;
  created_at: string;
  updated_at: string;
  booking_date: string | null;
  status: string;
  payment_status: string;
  approval_status: string | null;
  total_price: number;
  deposit_amount: number | null;
  service_charge: number;
  commission_amount: number;
  user_payment: number;
  platform_revenue: number;
  points_earned: number;
  points_used: number;
  used_membership_benefit: boolean;
  membership_service_fee_saved: number;
  service_charge_discount: number;
  preventa_comision_descuento: number;
  es_reserva_preventa: boolean;
  travelers_count: number;
  count_adultos: number;
  count_ninos: number;
  count_infantes: number;
  count_adultos_mayores: number;
  count_mascotas: number;
  payment_intent_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  payment_receipt_url: string | null;
  approval_notes: string | null;
  approved_at: string | null;
  is_no_show: boolean;
  no_show_marked_at: string | null;
  cancelled_at: string | null;
  cancellation_type: string | null;
  cancellation_refund_amount: number | null;
  has_pending_reschedule: boolean;
  reschedule_response: string | null;
  original_booking_date: string | null;
  needs_seat_reselection: boolean;
  confirmation_email_sent: boolean;
  // joined
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_number: string | null;
    profile_picture_url: string | null;
    is_active: boolean;
    curp: string | null;
    rfc: string | null;
    razon_social: string | null;
    regimen_fiscal: string | null;
    uso_cfdi: string | null;
    is_foreign_traveler: boolean | null;
    passport_number: string | null;
  } | null;
  user_email: string | null;
  tours: {
    id: string;
    name: string;
    destination: string | null;
    category: string[] | null;
    price: number;
    start_date: string | null;
    end_date: string | null;
    image_url: string | null;
    deposit_percentage: number | null;
    booking_approval_type: string | null;
  } | null;
  agencies: {
    id: string;
    name: string;
    logo: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    commission_rate: number | null;
  } | null;
  commission_records: {
    agency_commission_rate: number | null;
    agency_commission_amount: number | null;
    service_charge_rate: number | null;
    service_charge_amount: number | null;
    platform_total_revenue: number | null;
    agency_net_amount: number | null;
    status: string | null;
    processed_at: string | null;
  }[] | null;
}

interface Stats {
  total: number;
  pagadas: number;
  pendientes: number;
  procesando: number;
  canceladas: number;
  totalRevenue: number;
  totalServiceCharges: number;
  totalCommissions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  succeeded: { label: 'Pagada', cls: 'bg-green-100 text-green-800' },
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  processing: { label: 'Procesando', cls: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800' },
  canceled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800' },
  failed: { label: 'Fallida', cls: 'bg-red-100 text-red-800' },
};

const BOOKING_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', cls: 'bg-green-100 text-green-800' },
  completed: { label: 'Completada', cls: 'bg-teal-100 text-teal-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-800' },
  payment_not_received: { label: 'Pago no recibido', cls: 'bg-orange-100 text-orange-800' },
};

const APPROVAL_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprobada', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-800' },
};

const fmtDate = (d: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
  d ? new Date(d).toLocaleDateString('es-MX', opts ?? { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ─── Section components used inside the detail modal ─────────────────────────

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
      <span className="text-blue-600">{icon}</span>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h3>
    </div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex flex-col">
    <span className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</span>
    <span className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
  </div>
);

// ─── Sort Icon ─────────────────────────────────────────────────────────────────

const SortIcon: React.FC<{ active: boolean; dir: 'asc' | 'desc' }> = ({ active, dir }) => {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0, pagadas: 0, pendientes: 0, procesando: 0, canceladas: 0,
    totalRevenue: 0, totalServiceCharges: 0, totalCommissions: 0,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterApproval, setFilterApproval] = useState('');

  // Sort
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Detail modal
  const [selected, setSelected] = useState<BookingRow | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('bookings')
        .select(`
          id, booking_code, created_at, updated_at, booking_date, status,
          payment_status, approval_status, total_price, deposit_amount,
          service_charge, commission_amount, user_payment, platform_revenue,
          points_earned, points_used, used_membership_benefit,
          membership_service_fee_saved, service_charge_discount,
          preventa_comision_descuento, es_reserva_preventa,
          travelers_count, count_adultos, count_ninos, count_infantes,
          count_adultos_mayores, count_mascotas,
          payment_intent_id, payment_method, paid_at, payment_receipt_url,
          approval_notes, approved_at, is_no_show, no_show_marked_at,
          cancelled_at, cancellation_type, cancellation_refund_amount,
          has_pending_reschedule, reschedule_response, original_booking_date,
          needs_seat_reselection, confirmation_email_sent,
          user:user_id(
            id, first_name, last_name, email, phone_number, profile_picture_url,
            is_active, curp, rfc, razon_social, regimen_fiscal, uso_cfdi,
            is_foreign_traveler, passport_number
          ),
          tours(id, name, destination, category, price, start_date, end_date, image_url, deposit_percentage, booking_approval_type),
          agencies(id, name, logo, contact_email, contact_phone, commission_rate),
          commission_records(agency_commission_rate, agency_commission_amount, service_charge_rate, service_charge_amount, platform_total_revenue, agency_net_amount, status, processed_at)
        `)
        .order('created_at', { ascending: false });

      if (err) throw err;

      const enriched = ((data || []) as unknown as (Omit<BookingRow, 'users' | 'user_email'> & { user: BookingRow['users'] })[]).map(r => ({
        ...r,
        users: r.user ?? null,
        user_email: r.user?.email ?? null,
      })) as unknown as BookingRow[];

      setBookings(enriched);

      // Compute stats
      setStats({
        total: enriched.length,
        pagadas: enriched.filter(b => b.payment_status === 'succeeded').length,
        pendientes: enriched.filter(b => b.payment_status === 'pending').length,
        procesando: enriched.filter(b => b.payment_status === 'processing').length,
        canceladas: enriched.filter(b => b.payment_status === 'cancelled' || b.payment_status === 'canceled' || b.payment_status === 'failed').length,
        totalRevenue: enriched.filter(b => b.payment_status === 'succeeded').reduce((s, b) => s + Number(b.total_price), 0),
        totalServiceCharges: enriched.filter(b => b.payment_status === 'succeeded').reduce((s, b) => s + Number(b.service_charge), 0),
        totalCommissions: enriched.filter(b => b.payment_status === 'succeeded').reduce((s, b) => s + Number(b.commission_amount), 0),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter + sort ────────────────────────────────────────────────────────────

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    if (q) {
      const haystack = [
        b.booking_code,
        b.users?.first_name,
        b.users?.last_name,
        b.user_email,
        b.tours?.name,
        b.tours?.destination,
        b.agencies?.name,
        b.id,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filterPayment && b.payment_status !== filterPayment) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterApproval && b.approval_status !== filterApproval) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    let cmp = 0;
    switch (sortCol) {
      case 'booking_code': cmp = (a.booking_code || a.id).localeCompare(b.booking_code || b.id); break;
      case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      case 'booking_date': cmp = (a.booking_date ?? '').localeCompare(b.booking_date ?? ''); break;
      case 'traveler': cmp = `${a.users?.first_name} ${a.users?.last_name}`.localeCompare(`${b.users?.first_name} ${b.users?.last_name}`); break;
      case 'tour': cmp = (a.tours?.name ?? '').localeCompare(b.tours?.name ?? ''); break;
      case 'agency': cmp = (a.agencies?.name ?? '').localeCompare(b.agencies?.name ?? ''); break;
      case 'payment_status': cmp = (a.payment_status ?? '').localeCompare(b.payment_status ?? ''); break;
      case 'status': cmp = (a.status ?? '').localeCompare(b.status ?? ''); break;
      case 'total_price': cmp = Number(a.total_price) - Number(b.total_price); break;
      case 'service_charge': cmp = Number(a.service_charge) - Number(b.service_charge); break;
      case 'pax': {
        const pa = (a.count_adultos || 0) + (a.count_ninos || 0) + (a.count_infantes || 0) + (a.count_adultos_mayores || 0) + (a.count_mascotas || 0) || a.travelers_count || 0;
        const pb = (b.count_adultos || 0) + (b.count_ninos || 0) + (b.count_infantes || 0) + (b.count_adultos_mayores || 0) + (b.count_mascotas || 0) || b.travelers_count || 0;
        cmp = pa - pb;
        break;
      }
    }
    return cmp * dir;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const Th: React.FC<{ col: string; label: string; align?: string }> = ({ col, label, align = 'left' }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-4 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 transition-colors`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <span className={sortCol === col ? 'text-blue-600 font-semibold' : ''}>{label}</span>
        <span className={sortCol === col ? 'text-blue-600' : ''}><SortIcon active={sortCol === col} dir={sortDir} /></span>
      </span>
    </th>
  );

  // ── Stats cards ──────────────────────────────────────────────────────────────

  const statCards = [
    { label: 'Total Reservas', value: stats.total.toLocaleString(), icon: <ShoppingBag className="h-5 w-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Pagadas', value: stats.pagadas.toLocaleString(), icon: <CheckCircle className="h-5 w-5" />, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Pendientes', value: stats.pendientes.toLocaleString(), icon: <Clock className="h-5 w-5" />, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Procesando', value: stats.procesando.toLocaleString(), icon: <Activity className="h-5 w-5" />, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Canceladas/Fallidas', value: stats.canceladas.toLocaleString(), icon: <XCircle className="h-5 w-5" />, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Ingresos Totales', value: formatCurrencyMXN(stats.totalRevenue), icon: <TrendingUp className="h-5 w-5" />, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Cargos por Servicio', value: formatCurrencyMXN(stats.totalServiceCharges), icon: <BarChart2 className="h-5 w-5" />, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Comisiones Agencias', value: formatCurrencyMXN(stats.totalCommissions), icon: <Percent className="h-5 w-5" />, color: 'text-gray-600', bg: 'bg-gray-50' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reservas</h1>
            <p className="mt-1 text-gray-500">Vista completa de todas las reservas de la plataforma</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm transition"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
          {statCards.map(c => (
            <div key={c.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className={`inline-flex p-2 rounded-lg ${c.bg} mb-2`}>
                <span className={c.color}>{c.icon}</span>
              </div>
              <div className="text-lg font-bold text-gray-900 leading-tight">{c.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por folio, viajero, tour, agencia..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              value={filterPayment}
              onChange={e => setFilterPayment(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Pago: Todos</option>
              <option value="succeeded">Pagada</option>
              <option value="pending">Pendiente</option>
              <option value="processing">Procesando</option>
              <option value="cancelled">Cancelada</option>
              <option value="failed">Fallida</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Estado: Todos</option>
              <option value="draft">Borrador</option>
              <option value="pending">Pendiente</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
              <option value="payment_not_received">Pago no recibido</option>
            </select>
            <select
              value={filterApproval}
              onChange={e => setFilterApproval(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Aprobacion: Todas</option>
              <option value="pending">Pendiente</option>
              <option value="approved">Aprobada</option>
              <option value="rejected">Rechazada</option>
            </select>
            {(search || filterPayment || filterStatus || filterApproval) && (
              <button
                onClick={() => { setSearch(''); setFilterPayment(''); setFilterStatus(''); setFilterApproval(''); }}
                className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <ShoppingBag className="h-12 w-12 mb-3" />
              <p className="text-base">No se encontraron reservas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th col="booking_code" label="Folio" />
                    <Th col="traveler" label="Viajero" />
                    <Th col="tour" label="Tour" />
                    <Th col="agency" label="Agencia" />
                    <Th col="created_at" label="Fecha Reserva" />
                    <Th col="booking_date" label="Fecha Tour" />
                    <Th col="payment_status" label="Pago" />
                    <Th col="status" label="Estado" />
                    <Th col="pax" label="Pax" align="right" />
                    <Th col="total_price" label="Total" align="right" />
                    <Th col="service_charge" label="Cargo Serv." align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map(b => {
                    const pax = (b.count_adultos || 0) + (b.count_ninos || 0) + (b.count_infantes || 0) + (b.count_adultos_mayores || 0) + (b.count_mascotas || 0) || b.travelers_count || 0;
                    const ps = PAYMENT_STATUS_MAP[b.payment_status] ?? { label: b.payment_status, cls: 'bg-gray-100 text-gray-600' };
                    const bs = BOOKING_STATUS_MAP[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600' };
                    const hasBadge = b.is_no_show || b.has_pending_reschedule || b.es_reserva_preventa;
                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-gray-700 font-medium">
                              {b.booking_code || b.id.slice(0, 8).toUpperCase()}
                            </span>
                            {hasBadge && (
                              <span className="flex gap-0.5">
                                {b.is_no_show && <span title="No-show" className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />}
                                {b.has_pending_reschedule && <span title="Reagendamiento pendiente" className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />}
                                {b.es_reserva_preventa && <span title="Preventa" className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {b.users?.profile_picture_url ? (
                              <img src={b.users.profile_picture_url} alt="" className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                <User className="h-3.5 w-3.5 text-blue-600" />
                              </div>
                            )}
                            <span className="text-gray-800 font-medium max-w-[140px] truncate">
                              {b.users ? `${b.users.first_name} ${b.users.last_name}` : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap max-w-[180px] truncate text-gray-700">
                          {b.tours?.name || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap max-w-[140px] truncate text-gray-600">
                          {b.agencies?.name || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                          {fmtDate(b.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                          {fmtDate(b.booking_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>
                            {ps.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bs.cls}`}>
                            {bs.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">{pax || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-gray-900">
                          {formatCurrencyMXN(Number(b.total_price))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-gray-600">
                          {formatCurrencyMXN(Number(b.service_charge))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Counter */}
        {!loading && (
          <div className="mt-3 text-xs text-gray-500 text-right">
            Mostrando {sorted.length} de {bookings.length} reservas
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <DetailModal booking={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

const DetailModal: React.FC<{ booking: BookingRow; onClose: () => void }> = ({ booking: b, onClose }) => {
  const ps = PAYMENT_STATUS_MAP[b.payment_status] ?? { label: b.payment_status, cls: 'bg-gray-100 text-gray-600' };
  const bs = BOOKING_STATUS_MAP[b.status] ?? { label: b.status, cls: 'bg-gray-100 text-gray-600' };
  const ap = b.approval_status ? (APPROVAL_MAP[b.approval_status] ?? { label: b.approval_status, cls: 'bg-gray-100 text-gray-600' }) : null;

  const pax = (b.count_adultos || 0) + (b.count_ninos || 0) + (b.count_infantes || 0) + (b.count_adultos_mayores || 0) + (b.count_mascotas || 0) || b.travelers_count || 0;
  const commRec = b.commission_records?.[0];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl my-6 shadow-2xl">

        {/* Modal header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xl font-bold text-gray-900">
                {b.booking_code || b.id.slice(0, 8).toUpperCase()}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ps.cls}`}>{ps.label}</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${bs.cls}`}>{bs.label}</span>
              {ap && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ap.cls}`}>{ap.label}</span>}
              {b.es_reserva_preventa && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Preventa</span>}
              {b.is_no_show && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">No-show</span>}
              {b.has_pending_reschedule && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">Reagendamiento pendiente</span>}
              {b.needs_seat_reselection && <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">Re-seleccion asientos</span>}
            </div>
            <p className="mt-1 text-sm text-gray-400 font-mono">{b.id}</p>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2">

          {/* ── Viajero ─────────────────────────────────────────────────────────── */}
          <Section title="Viajero" icon={<User className="h-4 w-4" />}>
            <div className="flex items-start gap-4 mb-4">
              {b.users?.profile_picture_url ? (
                <img src={b.users.profile_picture_url} alt="" className="h-14 w-14 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center border border-gray-200">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
              )}
              <div>
                <div className="font-semibold text-gray-900 text-base">
                  {b.users ? `${b.users.first_name} ${b.users.last_name}` : '—'}
                </div>
                {b.user_email && <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><Mail className="h-3.5 w-3.5" />{b.user_email}</div>}
                {b.users?.phone_number && <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="h-3.5 w-3.5" />{b.users.phone_number}</div>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="ID Usuario" value={<span className="font-mono text-xs">{b.users?.id?.slice(0, 16) ?? '—'}…</span>} />
              <Field label="Estado cuenta" value={b.users?.is_active ? <span className="text-green-700 font-medium">Activa</span> : <span className="text-red-600 font-medium">Inactiva</span>} />
              {b.users?.is_foreign_traveler ? (
                <>
                  <Field label="Pasaporte" value={b.users.passport_number} mono />
                </>
              ) : (
                <>
                  <Field label="CURP" value={b.users?.curp} mono />
                  <Field label="RFC" value={b.users?.rfc} mono />
                </>
              )}
              <Field label="Razon Social" value={b.users?.razon_social} />
              <Field label="Regimen Fiscal" value={b.users?.regimen_fiscal} />
              <Field label="Uso CFDI" value={b.users?.uso_cfdi} />
              <Field label="Viajero extranjero" value={b.users?.is_foreign_traveler ? 'Si' : 'No'} />
            </div>
          </Section>

          {/* ── Tour ────────────────────────────────────────────────────────────── */}
          <Section title="Tour" icon={<Package className="h-4 w-4" />}>
            {b.tours?.image_url && (
              <img
                src={b.tours.image_url}
                alt={b.tours.name}
                className="w-full h-28 object-cover rounded-lg mb-3 border border-gray-100"
              />
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Nombre" value={<span className="font-medium text-gray-900">{b.tours?.name}</span>} />
              <Field label="Destino" value={<span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" />{b.tours?.destination}</span>} />
              <Field label="Fecha inicio" value={fmtDate(b.tours?.start_date)} />
              <Field label="Fecha fin" value={fmtDate(b.tours?.end_date)} />
              <Field label="Fecha de la reserva" value={fmtDate(b.booking_date)} />
              <Field label="Precio base" value={b.tours?.price != null ? formatCurrencyMXN(Number(b.tours.price)) : '—'} />
              <Field label="% Deposito" value={b.tours?.deposit_percentage != null ? `${b.tours.deposit_percentage}%` : '—'} />
              <Field label="Tipo aprobacion" value={b.tours?.booking_approval_type === 'automatic' ? 'Automatica' : 'Manual'} />
              {b.tours?.category && b.tours.category.length > 0 && (
                <div className="col-span-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Categorias</span>
                  <div className="flex flex-wrap gap-1">
                    {b.tours.category.map(c => (
                      <span key={c} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                        <Tag className="h-2.5 w-2.5" />{c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Agencia ─────────────────────────────────────────────────────────── */}
          <Section title="Agencia" icon={<Building2 className="h-4 w-4" />}>
            <div className="flex items-center gap-3 mb-3">
              {b.agencies?.logo ? (
                <img src={b.agencies.logo} alt="" className="h-10 w-10 rounded-lg object-contain border border-gray-100" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <span className="font-semibold text-gray-900">{b.agencies?.name ?? '—'}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Email contacto" value={b.agencies?.contact_email} />
              <Field label="Telefono" value={b.agencies?.contact_phone} />
              <Field label="Tasa de comision" value={b.agencies?.commission_rate != null ? `${(Number(b.agencies.commission_rate) * 100).toFixed(1)}%` : '—'} />
            </div>
          </Section>

          {/* ── Pasajeros ───────────────────────────────────────────────────────── */}
          <Section title="Pasajeros" icon={<Users className="h-4 w-4" />}>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Adultos', val: b.count_adultos },
                { label: 'Ninos', val: b.count_ninos },
                { label: 'Infantes', val: b.count_infantes },
                { label: 'Adultos mayores', val: b.count_adultos_mayores },
                { label: 'Mascotas', val: b.count_mascotas },
                { label: 'Total', val: pax },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{val ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Desglose financiero ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <Section title="Desglose Financiero" icon={<DollarSign className="h-4 w-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                {[
                  { label: 'Total Reserva', val: Number(b.total_price), highlight: true },
                  { label: 'Deposito requerido', val: Number(b.deposit_amount ?? 0) },
                  { label: 'Pago del viajero', val: Number(b.user_payment ?? 0) },
                  { label: 'Cargo por servicio', val: Number(b.service_charge) },
                  { label: 'Ingreso plataforma', val: Number(b.platform_revenue ?? 0) },
                ].map(({ label, val, highlight }) => (
                  <div key={label} className={`rounded-lg p-3 ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                    <div className={`text-base font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
                      {formatCurrencyMXN(val)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 border-t border-gray-100 pt-4">
                <Field label="Comision agencia" value={formatCurrencyMXN(Number(b.commission_amount))} />
                <Field label="Desc. cargo servicio" value={formatCurrencyMXN(Number(b.service_charge_discount ?? 0))} />
                <Field label="Ahorro por membresia" value={formatCurrencyMXN(Number(b.membership_service_fee_saved ?? 0))} />
                <Field label="Desc. comision preventa" value={formatCurrencyMXN(Number(b.preventa_comision_descuento ?? 0))} />
                <Field label="Puntos ganados" value={<span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-yellow-500" />{b.points_earned ?? 0} pts</span>} />
                <Field label="Puntos usados" value={<span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-gray-400" />{b.points_used ?? 0} pts</span>} />
                <Field label="Beneficio membresia" value={b.used_membership_benefit ? <span className="text-green-700 font-medium flex items-center gap-1"><Star className="h-3.5 w-3.5" />Si</span> : 'No'} />
              </div>
            </Section>
          </div>

          {/* ── Estado de Pago ──────────────────────────────────────────────────── */}
          <Section title="Estado de Pago" icon={<CreditCard className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Estado pago" value={<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>} />
              <Field label="Metodo de pago" value={b.payment_method || '—'} />
              <Field label="Fecha de pago" value={fmtDateTime(b.paid_at)} />
              <Field label="Email confirmacion enviado" value={b.confirmation_email_sent ? <span className="text-green-700">Si</span> : <span className="text-gray-400">No</span>} />
              <div className="col-span-2">
                <Field label="Payment Intent ID (Stripe)" value={<span className="font-mono text-xs break-all">{b.payment_intent_id || '—'}</span>} mono />
              </div>
              {b.payment_receipt_url && (
                <div className="col-span-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Comprobante de pago</span>
                  <a href={b.payment_receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                    <Receipt className="h-3.5 w-3.5" /> Ver comprobante
                  </a>
                </div>
              )}
            </div>
          </Section>

          {/* ── Aprobacion ──────────────────────────────────────────────────────── */}
          <Section title="Aprobacion" icon={<Shield className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Estado aprobacion" value={ap ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ap.cls}`}>{ap.label}</span> : '—'} />
              <Field label="Fecha aprobacion" value={fmtDateTime(b.approved_at)} />
              {b.approval_notes && (
                <div className="col-span-2">
                  <Field label="Notas de aprobacion" value={<span className="text-gray-700 italic">"{b.approval_notes}"</span>} />
                </div>
              )}
            </div>
          </Section>

          {/* ── Comisiones ──────────────────────────────────────────────────────── */}
          {commRec && (
            <Section title="Registro de Comision" icon={<Percent className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Tasa comision agencia" value={commRec.agency_commission_rate != null ? `${(Number(commRec.agency_commission_rate) * 100).toFixed(1)}%` : '—'} />
                <Field label="Monto comision agencia" value={commRec.agency_commission_amount != null ? formatCurrencyMXN(Number(commRec.agency_commission_amount)) : '—'} />
                <Field label="Tasa cargo servicio" value={commRec.service_charge_rate != null ? `${(Number(commRec.service_charge_rate) * 100).toFixed(1)}%` : '—'} />
                <Field label="Monto cargo servicio" value={commRec.service_charge_amount != null ? formatCurrencyMXN(Number(commRec.service_charge_amount)) : '—'} />
                <Field label="Revenue total plataforma" value={commRec.platform_total_revenue != null ? formatCurrencyMXN(Number(commRec.platform_total_revenue)) : '—'} />
                <Field label="Neto agencia" value={commRec.agency_net_amount != null ? formatCurrencyMXN(Number(commRec.agency_net_amount)) : '—'} />
                <Field label="Estado pago comision" value={commRec.status ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    commRec.status === 'paid_out' ? 'bg-green-100 text-green-800' :
                    commRec.status === 'processed' ? 'bg-blue-100 text-blue-800' :
                    commRec.status === 'disputed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>{commRec.status === 'paid_out' ? 'Pagado' : commRec.status === 'processed' ? 'Procesado' : commRec.status === 'disputed' ? 'Disputado' : commRec.status}</span>
                ) : '—'} />
                <Field label="Procesado el" value={fmtDateTime(commRec.processed_at)} />
              </div>
            </Section>
          )}

          {/* ── Cancelacion ─────────────────────────────────────────────────────── */}
          {(b.cancelled_at || b.is_no_show) && (
            <Section title="Cancelacion / No-show" icon={<XCircle className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {b.is_no_show && (
                  <>
                    <Field label="No-show" value={<span className="text-red-700 font-semibold">Si</span>} />
                    <Field label="Marcado el" value={fmtDateTime(b.no_show_marked_at)} />
                  </>
                )}
                {b.cancelled_at && (
                  <>
                    <Field label="Cancelado el" value={fmtDateTime(b.cancelled_at)} />
                    <Field label="Tipo cancelacion" value={b.cancellation_type || '—'} />
                    <Field label="Reembolso" value={b.cancellation_refund_amount != null ? formatCurrencyMXN(Number(b.cancellation_refund_amount)) : '—'} />
                  </>
                )}
              </div>
            </Section>
          )}

          {/* ── Reagendamiento ──────────────────────────────────────────────────── */}
          {(b.has_pending_reschedule || b.original_booking_date) && (
            <Section title="Reagendamiento" icon={<ArrowLeftRight className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Pendiente de respuesta" value={b.has_pending_reschedule ? <span className="text-orange-600 font-medium">Si</span> : 'No'} />
                <Field label="Fecha original" value={fmtDate(b.original_booking_date)} />
                <Field label="Nueva fecha" value={fmtDate(b.booking_date)} />
                {b.reschedule_response && <Field label="Respuesta viajero" value={b.reschedule_response} />}
              </div>
            </Section>
          )}

          {/* ── Timestamps ──────────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-xs text-gray-500">
              <div><span className="block text-gray-400 uppercase tracking-wide mb-0.5">Creado</span>{fmtDateTime(b.created_at)}</div>
              <div><span className="block text-gray-400 uppercase tracking-wide mb-0.5">Actualizado</span>{fmtDateTime(b.updated_at)}</div>
              <div><span className="block text-gray-400 uppercase tracking-wide mb-0.5">Pagado</span>{fmtDateTime(b.paid_at)}</div>
              <div><span className="block text-gray-400 uppercase tracking-wide mb-0.5">ID completo</span><span className="font-mono">{b.id}</span></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 shadow-sm transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
