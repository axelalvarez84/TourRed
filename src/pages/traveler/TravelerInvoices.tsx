import React, { useState, useEffect } from 'react';
import { FileText, Download, ExternalLink, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyMXN } from '../../utils/formatCurrency';

interface CfdiInvoice {
  id: string;
  uuid_fiscal: string | null;
  folio: string | null;
  serie: string | null;
  receptor_rfc: string;
  subtotal: number;
  iva_amount: number;
  total: number;
  status: 'pending' | 'stamped' | 'cancelled' | 'error';
  xml_url: string | null;
  pdf_url: string | null;
  stamped_at: string | null;
  created_at: string;
  bookings?: { booking_code: string | null; tours?: { name: string } | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  stamped: { label: 'Timbrado', color: 'bg-success-100 text-success-700', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  pending: { label: 'Procesando', color: 'bg-warning-100 text-warning-700', icon: <Clock className="h-3.5 w-3.5" /> },
  error: { label: 'Error', color: 'bg-error-100 text-error-700', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const TravelerInvoices: React.FC = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<CfdiInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'stamped' | 'pending' | 'error' | 'cancelled'>('all');

  const fetchInvoices = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('cfdi_invoices')
        .select(`*, bookings(booking_code, tours(name))`)
        .eq('invoice_type', 'booking')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        const mine = await Promise.all(
          data.map(async (inv) => {
            if (!inv.booking_id) return null;
            const { data: booking } = await supabase
              .from('bookings')
              .select('user_id')
              .eq('id', inv.booking_id)
              .maybeSingle();
            return booking?.user_id === user.id ? inv : null;
          })
        );
        setInvoices(mine.filter(Boolean) as CfdiInvoice[]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [user?.id]);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const counts = {
    all: invoices.length,
    stamped: invoices.filter(i => i.status === 'stamped').length,
    pending: invoices.filter(i => i.status === 'pending').length,
    error: invoices.filter(i => i.status === 'error').length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary-600" />
            Mis Facturas (CFDI)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Comprobantes fiscales digitales de tus reservas, validos ante el SAT.
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          disabled={isLoading}
          className="btn btn-outline btn-sm flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'stamped', 'pending', 'error', 'cancelled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'Todos' : STATUS_CONFIG[f]?.label}
            <span className="ml-1.5 text-xs opacity-75">({counts[f]})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {filter === 'all'
              ? 'Aun no tienes comprobantes fiscales generados.'
              : `No hay facturas con estado "${STATUS_CONFIG[filter]?.label}".`}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Las facturas se generan automaticamente al confirmar tu pago cuando la configuracion fiscal esta activa.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => {
            const s = STATUS_CONFIG[inv.status];
            const booking = inv.bookings as { booking_code: string | null; tours?: { name: string } | null } | null;
            const tourName = booking?.tours?.name;
            const bookingCode = booking?.booking_code;

            return (
              <div
                key={inv.id}
                className="bg-white rounded-xl border border-gray-200 hover:border-primary-200 hover:shadow-sm transition-all p-4 flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
                      {s.icon}
                      {s.label}
                    </span>
                    {bookingCode && (
                      <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        {bookingCode}
                      </span>
                    )}
                  </div>
                  {tourName && (
                    <div className="text-sm font-semibold text-gray-800 truncate">{tourName}</div>
                  )}
                  {inv.uuid_fiscal && (
                    <div className="text-xs font-mono text-gray-400 truncate mt-0.5">{inv.uuid_fiscal}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(inv.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                    {inv.serie && inv.folio && ` · ${inv.serie}-${inv.folio}`}
                    {inv.receptor_rfc && ` · RFC: ${inv.receptor_rfc}`}
                  </div>
                </div>

                <div className="text-right shrink-0 mr-2">
                  <div className="text-base font-bold text-gray-900">{formatCurrencyMXN(inv.total)}</div>
                  <div className="text-xs text-gray-400">IVA incl.</div>
                  {inv.iva_amount > 0 && (
                    <div className="text-xs text-gray-400">IVA: {formatCurrencyMXN(inv.iva_amount)}</div>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  {inv.xml_url && (
                    <a
                      href={inv.xml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Descargar XML"
                      className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  {inv.pdf_url && (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver PDF"
                      className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {!inv.xml_url && !inv.pdf_url && inv.status === 'stamped' && (
                    <span className="text-xs text-gray-400 px-2">Archivos no disponibles</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TravelerInvoices;
