import React, { useEffect, useState } from 'react';
import { FileText, CheckCircle, Clock, XCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AgencyDocument {
  id: string;
  document_type_key: string;
  file_name: string;
  storage_path: string;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Props {
  agencyId: string;
  legacySignedContractUrl?: string | null;
  onboardingStatus?: string | null;
}

/** Resolves the signed contract document in priority order:
 *  1. agency_documents with document_type_key='contrato_agencia' + is_current=true
 *  2. legacy agencies.signed_contract_url
 */
async function resolveContractUrl(agencyId: string, legacyUrl?: string | null): Promise<string | null> {
  const { data: doc } = await supabase
    .from('agency_documents')
    .select('storage_path, status')
    .eq('agency_id', agencyId)
    .eq('document_type_key', 'contrato_agencia')
    .eq('is_current', true)
    .maybeSingle();

  if (doc?.storage_path) {
    const { data } = await supabase.storage
      .from('agency-documents')
      .createSignedUrl(doc.storage_path, 3600);
    return data?.signedUrl ?? null;
  }

  return legacyUrl ?? null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_documents:  { label: 'Pendiente de documentos', color: 'text-gray-600 bg-gray-50 border-gray-200',   icon: <Clock className="w-4 h-4" /> },
  pending_review:     { label: 'En revisión',              color: 'text-amber-700 bg-amber-50 border-amber-200', icon: <Clock className="w-4 h-4" /> },
  pending_signature:  { label: 'Pendiente de firma',       color: 'text-blue-700 bg-blue-50 border-blue-200',   icon: <FileText className="w-4 h-4" /> },
  active:             { label: 'Activa',                   color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="w-4 h-4" /> },
  rejected:           { label: 'Rechazada',                color: 'text-red-700 bg-red-50 border-red-200',       icon: <XCircle className="w-4 h-4" /> },
};

const AgencyContractSection: React.FC<Props> = ({ agencyId, legacySignedContractUrl, onboardingStatus }) => {
  const [contractUrl, setContractUrl]   = useState<string | null>(null);
  const [documents, setDocuments]       = useState<AgencyDocument[]>([]);
  const [loadingUrl, setLoadingUrl]     = useState(false);
  const [source, setSource]             = useState<'new' | 'legacy' | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingUrl(true);
      try {
        // Load all current docs
        const { data: docs } = await supabase
          .from('agency_documents')
          .select('id, document_type_key, file_name, storage_path, status, rejection_reason, reviewed_at, created_at')
          .eq('agency_id', agencyId)
          .eq('is_current', true)
          .order('created_at', { ascending: false });

        if (!cancelled) setDocuments(docs ?? []);

        // Resolve contract
        const contractDoc = (docs ?? []).find(d => d.document_type_key === 'contrato_agencia');
        if (contractDoc?.storage_path) {
          const { data: urlData } = await supabase.storage
            .from('agency-documents')
            .createSignedUrl(contractDoc.storage_path, 3600);
          if (!cancelled) {
            setContractUrl(urlData?.signedUrl ?? null);
            setSource('new');
          }
        } else if (legacySignedContractUrl) {
          if (!cancelled) {
            setContractUrl(legacySignedContractUrl);
            setSource('legacy');
          }
        }
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [agencyId, legacySignedContractUrl]);

  const statusCfg = onboardingStatus ? STATUS_CONFIG[onboardingStatus] : null;

  const DOC_TYPE_LABELS: Record<string, string> = {
    acta_constitutiva:          'Acta constitutiva',
    identificacion_oficial:     'Identificación oficial',
    comprobante_domicilio:      'Comprobante de domicilio',
    constancia_situacion_fiscal:'Constancia de situación fiscal',
    contrato_agencia:           'Contrato de colaboración',
  };

  const nonContractDocs = documents.filter(d => d.document_type_key !== 'contrato_agencia');

  return (
    <div className="space-y-4">
      {/* Onboarding status badge */}
      {statusCfg && (
        <div className={`inline-flex items-center gap-2 text-sm border rounded-full px-3 py-1 font-medium ${statusCfg.color}`}>
          {statusCfg.icon}
          Estado de onboarding: {statusCfg.label}
        </div>
      )}

      {/* Contract document */}
      <div className="border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Contrato de colaboración</span>
            {source === 'legacy' && (
              <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                Contrato legado
              </span>
            )}
          </div>
          {loadingUrl ? (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          ) : contractUrl ? (
            <a
              href={contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver contrato
            </a>
          ) : (
            <span className="text-xs text-gray-400">Sin contrato registrado</span>
          )}
        </div>
        {source === 'legacy' && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 mt-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Este contrato fue firmado fuera del flujo de onboarding digital.</span>
          </div>
        )}
      </div>

      {/* Other documents */}
      {nonContractDocs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documentos verificados</p>
          <div className="space-y-2">
            {nonContractDocs.map(doc => (
              <div key={doc.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {DOC_TYPE_LABELS[doc.document_type_key] ?? doc.document_type_key}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{doc.file_name}</p>
                  {doc.rejection_reason && (
                    <p className="text-xs text-red-600 mt-0.5">{doc.rejection_reason}</p>
                  )}
                </div>
                <span className={`flex-shrink-0 ml-3 text-xs font-medium rounded-full px-2 py-0.5 border ${
                  doc.status === 'approved'       ? 'bg-green-50 text-green-700 border-green-200' :
                  doc.status === 'rejected'       ? 'bg-red-50 text-red-700 border-red-200'       :
                  doc.status === 'pending_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    'bg-gray-50 text-gray-500 border-gray-200'
                }`}>
                  {doc.status === 'approved' ? 'Aprobado' :
                   doc.status === 'rejected' ? 'Rechazado' :
                   doc.status === 'pending_review' ? 'En revisión' : 'Reemplazado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgencyContractSection;
