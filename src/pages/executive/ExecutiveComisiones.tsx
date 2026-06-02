import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Upload, CheckCircle, AlertCircle, X, Clock,
  FileText, ChevronDown, Filter, Download
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyMXN } from '../../utils/formatCurrency';

interface Commission {
  id: string;
  commission_type: string;
  amount: number;
  status: string;
  period_month: number | null;
  period_year: number | null;
  cfdi_xml_url: string | null;
  cfdi_pdf_url: string | null;
  cfdi_uuid_fiscal: string | null;
  cfdi_total: number | null;
  cfdi_uploaded_at: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  created_at: string;
  agencies: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  approval: 'Aprobación de agencia',
  first_tour_and_booking: 'Primer tour y reserva',
  platform_period: 'Comisión de periodo',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-100' },
  invoiced: { label: 'CFDI enviado', color: 'text-blue-700', bg: 'bg-blue-100' },
  approved: { label: 'Aprobado', color: 'text-green-700', bg: 'bg-green-100' },
  paid: { label: 'Pagado', color: 'text-gray-700', bg: 'bg-gray-100' },
  rejected: { label: 'Rechazado', color: 'text-red-700', bg: 'bg-red-100' },
};

export default function ExecutiveComisiones() {
  const { accountExecutiveInfo } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [cfdiModal, setCfdiModal] = useState<Commission | null>(null);
  const [cfdiXmlFile, setCfdiXmlFile] = useState<File | null>(null);
  const [cfdiTotal, setCfdiTotal] = useState('');
  const [cfdiUuid, setCfdiUuid] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadCommissions = useCallback(async () => {
    if (!accountExecutiveInfo?.executiveId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('executive_commissions')
        .select('*, agencies(name)')
        .eq('executive_id', accountExecutiveInfo.executiveId)
        .order('created_at', { ascending: false });
      setCommissions((data || []) as Commission[]);
    } finally {
      setIsLoading(false);
    }
  }, [accountExecutiveInfo?.executiveId]);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  const filtered = commissions.filter(c =>
    statusFilter === 'all' || c.status === statusFilter
  );

  const totals = {
    pending: commissions.filter(c => ['pending', 'invoiced', 'approved'].includes(c.status))
      .reduce((s, c) => s + Number(c.amount), 0),
    paid: commissions.filter(c => c.status === 'paid')
      .reduce((s, c) => s + Number(c.amount), 0),
    total: commissions.reduce((s, c) => s + Number(c.amount), 0),
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const uploadCfdi = async () => {
    if (!cfdiModal || !cfdiXmlFile || !cfdiTotal) {
      setMessage({ type: 'error', text: 'Debes subir el XML del CFDI y especificar el monto.' });
      return;
    }
    setIsSaving(true);
    try {
      const execId = accountExecutiveInfo!.executiveId;
      const xmlPath = `executive-cfdi/${execId}/${cfdiModal.id}/${Date.now()}.xml`;

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(xmlPath, cfdiXmlFile, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(xmlPath);

      // Si hay IDs seleccionados, actualizar todos; si no, solo el actual
      const idsToUpdate = selectedIds.length > 0 ? selectedIds : [cfdiModal.id];

      for (const id of idsToUpdate) {
        await supabase.from('executive_commissions').update({
          status: 'invoiced',
          cfdi_xml_url: urlData.publicUrl || xmlPath,
          cfdi_total: Number(cfdiTotal),
          cfdi_uuid_fiscal: cfdiUuid.trim() || null,
          cfdi_uploaded_at: new Date().toISOString(),
        }).eq('id', id);
      }

      setMessage({ type: 'success', text: 'CFDI enviado correctamente. El administrador lo revisará para aprobarlo.' });
      setCfdiModal(null);
      setCfdiXmlFile(null);
      setCfdiTotal('');
      setCfdiUuid('');
      setSelectedIds([]);
      loadCommissions();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Error al subir el CFDI.' });
    } finally {
      setIsSaving(false);
    }
  };

  const pendingCommissions = commissions.filter(c => c.status === 'pending');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Comisiones</h1>
        <p className="text-gray-500 mt-1">Estado de cuenta y cobro de comisiones</p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Pendiente de cobro</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrencyMXN(totals.pending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Cobrado</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrencyMXN(totals.paid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Total acumulado</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrencyMXN(totals.total)}</p>
        </div>
      </div>

      {/* Cobrar comisiones pendientes */}
      {pendingCommissions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Tienes comisiones pendientes de cobrar</h3>
              <p className="text-sm text-blue-700">
                Total pendiente: <strong>{formatCurrencyMXN(totals.pending)}</strong> —
                Selecciona las comisiones que quieres cobrar y sube tu CFDI de tipo Ingreso.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pendingCommissions.map(c => (
              <label key={c.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors border border-blue-100">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="rounded text-blue-600"
                />
                <div className="flex-1 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {TYPE_LABELS[c.commission_type] || c.commission_type}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(c.agencies as any)?.name}
                      {c.period_month && ` — ${c.period_month}/${c.period_year}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{formatCurrencyMXN(c.amount)}</p>
                </div>
              </label>
            ))}
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-blue-800 font-medium">
                {selectedIds.length} comisión(es) seleccionada(s) —
                Total: {formatCurrencyMXN(
                  commissions.filter(c => selectedIds.includes(c.id)).reduce((s, c) => s + Number(c.amount), 0)
                )}
              </p>
              <button
                onClick={() => {
                  const first = commissions.find(c => selectedIds.includes(c.id));
                  if (first) setCfdiModal(first);
                }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Upload className="h-4 w-4" /> Subir CFDI
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {['all', 'pending', 'invoiced', 'approved', 'paid', 'rejected'].map(s => {
          const cfg = s === 'all' ? null : STATUS_CONFIG[s];
          const count = s === 'all' ? commissions.length : commissions.filter(c => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? (cfg ? `${cfg.bg} ${cfg.color} ring-1 ring-current` : 'bg-gray-900 text-white')
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'Todas' : cfg?.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <DollarSign className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>No hay comisiones en este estado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Tipo', 'Agencia', 'Monto', 'Periodo', 'Estado', 'CFDI', 'Fecha'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(comm => {
                  const cfg = STATUS_CONFIG[comm.status] || STATUS_CONFIG.pending;
                  return (
                    <tr key={comm.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{TYPE_LABELS[comm.commission_type] || comm.commission_type}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{(comm.agencies as any)?.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">{formatCurrencyMXN(comm.amount)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-500">
                          {comm.period_month ? `${comm.period_month}/${comm.period_year}` : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {comm.status === 'rejected' && comm.rejection_reason && (
                          <p className="text-xs text-red-500 mt-0.5">{comm.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {comm.cfdi_xml_url ? (
                          <a href={comm.cfdi_xml_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Ver CFDI
                          </a>
                        ) : comm.status === 'pending' ? (
                          <button
                            onClick={() => { setCfdiModal(comm); setCfdiXmlFile(null); setCfdiTotal(String(comm.amount)); setCfdiUuid(''); }}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Upload className="h-3 w-3" /> Subir CFDI
                          </button>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-400">{new Date(comm.created_at).toLocaleDateString('es-MX')}</p>
                        {comm.paid_at && (
                          <p className="text-xs text-green-500">Pago: {new Date(comm.paid_at).toLocaleDateString('es-MX')}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Subir CFDI */}
      {cfdiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Subir CFDI para cobro</h2>
              <p className="text-sm text-gray-500 mb-5">
                Sube tu Comprobante Fiscal Digital (CFDI) de tipo Ingreso para que el administrador apruebe el pago.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
                <p className="text-xs text-blue-700">
                  El CFDI debe ser a nombre de ToursRed (RFC emisor) por el monto exacto indicado.
                  Una vez aprobado, el pago se procesará por transferencia bancaria.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto del CFDI (MXN) *</label>
                  <input
                    type="number"
                    value={cfdiTotal}
                    onChange={e => setCfdiTotal(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comisiones seleccionadas: {formatCurrencyMXN(
                      commissions.filter(c => selectedIds.length > 0 ? selectedIds.includes(c.id) : c.id === cfdiModal.id)
                        .reduce((s, c) => s + Number(c.amount), 0)
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">UUID Fiscal del CFDI</label>
                  <input
                    value={cfdiUuid}
                    onChange={e => setCfdiUuid(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Archivo XML del CFDI *</label>
                  <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${cfdiXmlFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'}`}>
                    {cfdiXmlFile ? (
                      <div className="text-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
                        <p className="text-sm text-green-700 font-medium">{cfdiXmlFile.name}</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                        <p className="text-sm text-gray-500">Seleccionar XML</p>
                      </div>
                    )}
                    <input type="file" className="hidden" accept=".xml,.pdf" onChange={e => setCfdiXmlFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setCfdiModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button
                onClick={uploadCfdi}
                disabled={isSaving || !cfdiXmlFile || !cfdiTotal}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Enviando...' : 'Enviar para revisión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
