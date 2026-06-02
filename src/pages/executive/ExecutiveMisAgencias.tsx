import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, CheckCircle, Clock, AlertCircle, TrendingUp,
  Calendar, Upload, X, Eye, ChevronDown, FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyMXN } from '../../utils/formatCurrency';

interface Agency {
  id: string;
  name: string;
  contact_email: string;
  contact_phone: string | null;
  is_approved: boolean;
  is_active: boolean;
  registered_by_executive: boolean;
  account_executive_id: string | null;
  signed_contract_url: string | null;
  approval_period_start: string | null;
  first_tour_published_at: string | null;
  first_paid_booking_at: string | null;
  created_at: string;
  _tours_count?: number;
  _bookings_count?: number;
  _platform_revenue?: number;
}

export default function ExecutiveMisAgencias() {
  const { accountExecutiveInfo } = useAuth();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [approveModal, setApproveModal] = useState<Agency | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAgencies = useCallback(async () => {
    if (!accountExecutiveInfo?.executiveId) return;
    setIsLoading(true);
    try {
      const { data: agenciesData } = await supabase
        .from('agencies')
        .select(`
          id, name, contact_email, contact_phone, is_approved, is_active,
          registered_by_executive, account_executive_id, signed_contract_url,
          approval_period_start, first_tour_published_at, first_paid_booking_at,
          created_at
        `)
        .eq('account_executive_id', accountExecutiveInfo.executiveId)
        .order('created_at', { ascending: false });

      if (!agenciesData) { setAgencies([]); return; }

      const agencyIds = agenciesData.map(a => a.id);

      const [toursRes, bookingsRes, commissionsRes] = await Promise.all([
        supabase.from('tours').select('agency_id').in('agency_id', agencyIds),
        supabase.from('bookings').select('agency_id').in('agency_id', agencyIds).eq('payment_status', 'paid'),
        supabase.from('commission_records').select('agency_id, platform_total_revenue').in('agency_id', agencyIds),
      ]);

      const tourCounts: Record<string, number> = {};
      const bookingCounts: Record<string, number> = {};
      const revenueMap: Record<string, number> = {};

      (toursRes.data || []).forEach((t: any) => { tourCounts[t.agency_id] = (tourCounts[t.agency_id] || 0) + 1; });
      (bookingsRes.data || []).forEach((b: any) => { bookingCounts[b.agency_id] = (bookingCounts[b.agency_id] || 0) + 1; });
      (commissionsRes.data || []).forEach((c: any) => { revenueMap[c.agency_id] = (revenueMap[c.agency_id] || 0) + Number(c.platform_total_revenue || 0); });

      const enriched = agenciesData.map(a => ({
        ...a,
        _tours_count: tourCounts[a.id] || 0,
        _bookings_count: bookingCounts[a.id] || 0,
        _platform_revenue: revenueMap[a.id] || 0,
      }));

      setAgencies(enriched);
    } finally {
      setIsLoading(false);
    }
  }, [accountExecutiveInfo?.executiveId]);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  const getDaysRemainingInPeriod = (approvalDate: string) => {
    const start = new Date(approvalDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const approveAgency = async () => {
    if (!approveModal || !contractFile) {
      setMessage({ type: 'error', text: 'Debes subir el contrato firmado.' });
      return;
    }
    setIsApproving(true);
    try {
      const fileExt = contractFile.name.split('.').pop();
      const filePath = `contracts/${approveModal.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('signed-contracts')
        .upload(filePath, contractFile, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('signed-contracts').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('agencies')
        .update({
          is_approved: true,
          signed_contract_url: urlData.publicUrl || filePath,
        })
        .eq('id', approveModal.id);

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: `Agencia "${approveModal.name}" aprobada exitosamente.` });
      setApproveModal(null);
      setContractFile(null);
      loadAgencies();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al aprobar la agencia.' });
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Agencias</h1>
        <p className="text-gray-500 mt-1">Agencias que has registrado y gestionas</p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {agencies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Aún no tienes agencias registradas</p>
          <p className="text-sm text-gray-400 mt-1">Convierte un lead en agencia desde el pipeline</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agencies.map(agency => {
            const inPeriod = agency.approval_period_start
              ? getDaysRemainingInPeriod(agency.approval_period_start) > 0
              : false;
            const daysLeft = agency.approval_period_start
              ? getDaysRemainingInPeriod(agency.approval_period_start)
              : 0;

            return (
              <div key={agency.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{agency.name}</h3>
                    <p className="text-sm text-gray-400">{agency.contact_email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {agency.is_approved ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle className="h-3 w-3" /> Aprobada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                        <Clock className="h-3 w-3" /> Pendiente aprobación
                      </span>
                    )}
                    {agency.is_approved && inPeriod && (
                      <span className="text-xs text-blue-600 font-medium">{daysLeft} días de comisión</span>
                    )}
                  </div>
                </div>

                {/* Milestones */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className={`rounded-lg p-2 ${agency.is_approved ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <p className={`text-lg font-bold ${agency.is_approved ? 'text-green-600' : 'text-gray-300'}`}>
                      {agency.is_approved ? '✓' : '○'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Aprobada</p>
                  </div>
                  <div className={`rounded-lg p-2 ${agency.first_tour_published_at ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className={`text-lg font-bold ${agency.first_tour_published_at ? 'text-blue-600' : 'text-gray-300'}`}>
                      {agency.first_tour_published_at ? '✓' : '○'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">1er tour</p>
                  </div>
                  <div className={`rounded-lg p-2 ${agency.first_paid_booking_at ? 'bg-blue-50' : 'bg-gray-50'}`}>
                    <p className={`text-lg font-bold ${agency.first_paid_booking_at ? 'text-blue-600' : 'text-gray-300'}`}>
                      {agency.first_paid_booking_at ? '✓' : '○'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">1a reserva</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 text-center border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agency._tours_count}</p>
                    <p className="text-xs text-gray-400">Tours</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agency._bookings_count}</p>
                    <p className="text-xs text-gray-400">Reservas</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{formatCurrencyMXN(agency._platform_revenue || 0)}</p>
                    <p className="text-xs text-gray-400">Ingreso plataforma</p>
                  </div>
                </div>

                {/* Aprobar */}
                {!agency.is_approved && agency.registered_by_executive && (
                  <button
                    onClick={() => { setApproveModal(agency); setContractFile(null); }}
                    className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Aprobar agencia (subir contrato)
                  </button>
                )}

                {agency.signed_contract_url && (
                  <a
                    href={agency.signed_contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" /> Ver contrato firmado
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Aprobar */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Aprobar agencia</h2>
              <p className="text-sm text-gray-500 mb-5">
                Subir contrato firmado para <strong>{approveModal.name}</strong>
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
                <p className="text-xs text-blue-700">
                  Al aprobar la agencia se generará automáticamente tu comisión de aprobación ($100 MXN por defecto).
                  Además comenzará el periodo de 3 meses de comisiones sobre ingresos de plataforma.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Contrato firmado (PDF) *</label>
                <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${contractFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400'}`}>
                  {contractFile ? (
                    <div className="text-center">
                      <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />
                      <p className="text-sm text-green-700 font-medium">{contractFile.name}</p>
                      <p className="text-xs text-green-500">{(contractFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">Haz clic para seleccionar el PDF</p>
                    </div>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setContractFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => { setApproveModal(null); setContractFile(null); }}
                className="px-4 py-2 text-sm text-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={approveAgency}
                disabled={isApproving || !contractFile}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isApproving ? 'Aprobando...' : 'Aprobar agencia'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
