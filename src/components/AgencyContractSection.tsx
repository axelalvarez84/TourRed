import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText, CheckCircle, Clock, XCircle, ExternalLink,
  AlertTriangle, ThumbsUp, ThumbsDown, RefreshCw, Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AgencyDocument {
  id: string;
  document_type_key: string;
  file_name: string;
  storage_path: string;
  status: 'pending_review' | 'rejected' | 'superseded';
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

interface Props {
  agencyId: string;
  legacySignedContractUrl?: string | null;
  onboardingStatus?: string | null;
  /** Called after a document action changes the state, so the parent can re-fetch the agency */
  onRefresh?: () => void;
}

const ONBOARDING_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_documents: { label: 'Pendiente de documentos', color: 'text-gray-600 bg-gray-50 border-gray-200',   icon: <Clock className="w-4 h-4" /> },
  pending_review:    { label: 'En revisión',              color: 'text-amber-700 bg-amber-50 border-amber-200', icon: <Clock className="w-4 h-4" /> },
  pending_signature: { label: 'Pendiente de firma',       color: 'text-blue-700 bg-blue-50 border-blue-200',   icon: <FileText className="w-4 h-4" /> },
  active:            { label: 'Activa',                   color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="w-4 h-4" /> },
  rejected:          { label: 'Rechazada',                color: 'text-red-700 bg-red-50 border-red-200',       icon: <XCircle className="w-4 h-4" /> },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  acta_constitutiva:           'Acta constitutiva',
  poder_notarial:              'Poder notarial',
  identificacion_oficial:      'Identificación oficial',
  comprobante_domicilio:       'Comprobante de domicilio',
  constancia_situacion_fiscal: 'Constancia de situación fiscal',
  contrato_agencia:            'Contrato de colaboración',
  registro_sec_tur:            'Registro SECTUR / Licencia operación',
  aviso_funcionamiento:        'Aviso de funcionamiento',
  membresia_amav_clia:         'Membresía AMAV / CLIA',
};

function isApproved(doc: AgencyDocument) {
  return doc.status === 'pending_review' && doc.reviewed_at !== null;
}

function isPending(doc: AgencyDocument) {
  return doc.status === 'pending_review' && doc.reviewed_at === null;
}

const AgencyContractSection: React.FC<Props> = ({
  agencyId,
  legacySignedContractUrl,
  onboardingStatus,
  onRefresh,
}) => {
  const [documents, setDocuments]         = useState<AgencyDocument[]>([]);
  const [loading, setLoading]             = useState(true);
  const [signedUrls, setSignedUrls]       = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [rejectingId, setRejectingId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [actionError, setActionError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: docs } = await supabase
      .from('agency_documents')
      .select('id, document_type_key, file_name, storage_path, status, rejection_reason, reviewed_at, reviewed_by, created_at')
      .eq('agency_id', agencyId)
      .eq('is_current', true)
      .order('created_at', { ascending: true });

    setDocuments(docs ?? []);
    setLoading(false);

    // Pre-generate signed URLs for all docs
    const urls: Record<string, string> = {};
    await Promise.all((docs ?? []).map(async (doc) => {
      const { data } = await supabase.storage
        .from('agency-documents')
        .createSignedUrl(doc.storage_path, 3600);
      if (data?.signedUrl) urls[doc.id] = data.signedUrl;
    }));
    setSignedUrls(urls);
  }, [agencyId]);

  useEffect(() => { load(); }, [load]);

  const callApproveEndpoint = async (payload: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-agency-documents`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Error al procesar la acción');
    return json;
  };

  const handleApprove = async (doc: AgencyDocument) => {
    setActionLoading(prev => ({ ...prev, [doc.id]: true }));
    setActionError('');
    try {
      await callApproveEndpoint({
        agency_id:    agencyId,
        action:       'approve',
        document_ids: [doc.id],
      });
      await load();
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleRejectSubmit = async (doc: AgencyDocument) => {
    if (!rejectReason.trim()) return;
    setActionLoading(prev => ({ ...prev, [doc.id]: true }));
    setActionError('');
    try {
      await callApproveEndpoint({
        agency_id:        agencyId,
        action:           'reject',
        document_ids:     [doc.id],
        rejection_reason: rejectReason.trim(),
      });
      setRejectingId(null);
      setRejectReason('');
      await load();
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  const contractDoc    = documents.find(d => d.document_type_key === 'contrato_agencia');
  const reviewableDocs = documents.filter(d => d.document_type_key !== 'contrato_agencia');
  const statusCfg      = onboardingStatus ? ONBOARDING_STATUS[onboardingStatus] : null;

  const contractUrl = signedUrls[contractDoc?.id ?? ''] ?? legacySignedContractUrl ?? null;
  const isLegacyContract = !contractDoc && !!legacySignedContractUrl;

  return (
    <div className="space-y-5">
      {/* Onboarding status */}
      {statusCfg && (
        <div className={`inline-flex items-center gap-2 text-sm border rounded-full px-3 py-1 font-medium ${statusCfg.color}`}>
          {statusCfg.icon}
          Estado de onboarding: {statusCfg.label}
        </div>
      )}

      {/* Error banner */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {actionError}
        </div>
      )}

      {/* --- Reviewable documents --- */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
          Cargando documentos…
        </div>
      ) : reviewableDocs.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">La agencia aún no ha subido documentos.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Documentos de verificación
          </p>
          {reviewableDocs.map(doc => {
            const approved    = isApproved(doc);
            const pending     = isPending(doc);
            const rejected    = doc.status === 'rejected';
            const busy        = actionLoading[doc.id];
            const isRejecting = rejectingId === doc.id;
            const url         = signedUrls[doc.id];

            return (
              <div
                key={doc.id}
                className={`border rounded-xl p-4 transition-colors ${
                  approved ? 'border-green-200 bg-green-50/40' :
                  rejected ? 'border-red-200 bg-red-50/40' :
                             'border-gray-200 bg-white'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {DOC_TYPE_LABELS[doc.document_type_key] ?? doc.document_type_key}
                      </span>
                      {/* Status badge */}
                      {approved && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                          <CheckCircle className="w-3 h-3" /> Aprobado
                        </span>
                      )}
                      {rejected && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
                          <XCircle className="w-3 h-3" /> Rechazado
                        </span>
                      )}
                      {pending && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                          <Clock className="w-3 h-3" /> Pendiente de revisión
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{doc.file_name}</p>
                    {doc.rejection_reason && (
                      <p className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1">
                        Motivo: {doc.rejection_reason}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 px-2.5 py-1.5 rounded-lg transition-colors"
                        title="Ver documento"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </a>
                    )}

                    {/* Approve */}
                    {!approved && !isRejecting && (
                      <button
                        onClick={() => handleApprove(doc)}
                        disabled={busy}
                        title="Aprobar documento"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {busy ? <div className="w-3.5 h-3.5 border-2 border-green-400/30 border-t-green-600 rounded-full animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        Aprobar
                      </button>
                    )}

                    {/* Re-review approved */}
                    {approved && !isRejecting && (
                      <button
                        onClick={() => { setRejectingId(doc.id); setRejectReason(''); }}
                        title="Re-revisar / rechazar"
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Re-revisar
                      </button>
                    )}

                    {/* Reject button (pending or re-review) */}
                    {!isRejecting && (pending || rejected) && (
                      <button
                        onClick={() => { setRejectingId(doc.id); setRejectReason(''); }}
                        disabled={busy}
                        title="Rechazar documento"
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        Rechazar
                      </button>
                    )}

                    {/* Cancel reject */}
                    {isRejecting && (
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline reject form */}
                {isRejecting && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Motivo de rechazo <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
                      rows={2}
                      placeholder="Describe el problema con este documento…"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                    />
                    <div className="flex justify-end mt-2 gap-2">
                      <button
                        onClick={() => handleRejectSubmit(doc)}
                        disabled={!rejectReason.trim() || busy}
                        className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {busy
                          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <XCircle className="w-3.5 h-3.5" />}
                        Confirmar rechazo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* --- Contract document --- */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Contrato de colaboración
        </p>
        <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {contractDoc?.file_name ?? 'Sin contrato generado'}
              </p>
              {isLegacyContract && (
                <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Contrato legado (fuera del flujo digital)
                </p>
              )}
            </div>
          </div>
          {contractUrl ? (
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver contrato
            </a>
          ) : (
            <span className="text-xs text-gray-400 flex-shrink-0">No generado aún</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgencyContractSection;
