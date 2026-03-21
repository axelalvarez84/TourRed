import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, RefreshCw, AlertCircle, CheckCircle, Clock, SkipForward, Filter, Search, RotateCcw, TrendingUp, Users, FileText, DollarSign, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SyncLogEntry {
  id: string;
  provider: string;
  record_type: string;
  record_id: string;
  external_entity_type?: string;
  external_entity_id?: string;
  status: 'pending' | 'synced' | 'error' | 'skipped';
  error_message?: string;
  synced_at?: string;
  retry_count: number;
  payload_summary?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SyncStats {
  provider: string;
  total_synced: number;
  total_pending: number;
  total_errors: number;
  total_skipped: number;
  contacts_synced: number;
  bookings_synced: number;
  payouts_synced: number;
  last_sync_at?: string;
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  contact_agency: 'Agencia',
  contact_traveler: 'Viajero',
  booking: 'Reserva',
  payout: 'Pago a Agencia',
  commission: 'Comision',
  journal_entry: 'Asiento Contable',
  gift_card: 'Tarjeta de Regalo',
};

const PROVIDER_LABELS: Record<string, string> = {
  zoho_books: 'Zoho Books',
  odoo: 'Odoo',
  quickbooks: 'QuickBooks',
  contpaqi_cloud: 'Contpaqi Cloud',
  none: 'Sin proveedor',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    synced: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-600',
  };
  const icons: Record<string, React.ReactNode> = {
    synced: <CheckCircle className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    error: <AlertCircle className="w-3 h-3" />,
    skipped: <SkipForward className="w-3 h-3" />,
  };
  const labels: Record<string, string> = {
    synced: 'Sincronizado',
    pending: 'Pendiente',
    error: 'Error',
    skipped: 'Omitido',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {icons[status]}
      {labels[status] || status}
    </span>
  );
};

const AdminContabilidad: React.FC = () => {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [stats, setStats] = useState<SyncStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ healthy: boolean; provider?: string; error?: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<string>('none');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [logsResult, statsResult, settingsResult] = await Promise.all([
        supabase
          .from('accounting_sync_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.rpc('get_accounting_sync_stats'),
        supabase.from('platform_settings').select('accounting_provider, accounting_sync_enabled').maybeSingle(),
      ]);

      if (logsResult.data) setLogs(logsResult.data);
      if (statsResult.data) setStats(statsResult.data);
      if (settingsResult.data) {
        setCurrentProvider(settingsResult.data.accounting_provider || 'none');
        setSyncEnabled(settingsResult.data.accounting_sync_enabled || false);
      }
    } catch (err) {
      console.error('Error fetching accounting data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    setHealthStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-to-accounting', {
        body: { action: 'health_check' },
      });
      if (error) throw error;
      setHealthStatus(data);
    } catch (err: any) {
      setHealthStatus({ healthy: false, error: err.message });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleRetryErrors = async () => {
    if (!confirm('Reintentar todos los registros con error (hasta 5 intentos previos)? Esto puede tomar unos segundos.')) return;
    setIsRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-to-accounting', {
        body: { action: 'retry_errors' },
      });
      if (error) throw error;
      setMessage({ type: 'success', text: `Reintento completado: ${data.succeeded} exitosos, ${data.failed} fallidos de ${data.retried} total` });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error al reintentar: ${err.message}` });
    } finally {
      setIsRetrying(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleRetryOne = async (entry: SyncLogEntry) => {
    try {
      const action = entry.record_type.startsWith('contact') ? 'sync_contact' :
        entry.record_type === 'booking' ? 'sync_invoice' :
        entry.record_type === 'payout' ? 'sync_bill' : 'sync_payment';

      await supabase.functions.invoke('sync-to-accounting', {
        body: { action, record_type: entry.record_type, record_id: entry.record_id },
      });
      setMessage({ type: 'success', text: 'Reintento enviado' });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (filterType !== 'all' && l.record_type !== filterType) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        l.record_id.toLowerCase().includes(s) ||
        l.external_entity_id?.toLowerCase().includes(s) ||
        l.record_type.toLowerCase().includes(s) ||
        l.error_message?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const currentStats = stats.find((s) => s.provider === currentProvider);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Integracion Contable</h1>
          <p className="text-gray-600 mt-1">
            Monitor de sincronizacion con{' '}
            <span className="font-medium text-primary-700">{PROVIDER_LABELS[currentProvider] || currentProvider}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleHealthCheck}
            disabled={isCheckingHealth || currentProvider === 'none'}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            {isCheckingHealth ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Verificar Conexion
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {healthStatus && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${healthStatus.healthy ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {healthStatus.healthy ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <div className="text-sm">
            {healthStatus.healthy
              ? `Conexion exitosa con ${PROVIDER_LABELS[healthStatus.provider || ''] || healthStatus.provider}`
              : `Sin conexion: ${healthStatus.error || 'Error desconocido'}`}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6 p-4 bg-white rounded-lg border border-gray-200">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${currentProvider === 'none' ? 'bg-gray-300' : syncEnabled ? 'bg-green-500' : 'bg-amber-400'}`} />
        <div className="text-sm">
          {currentProvider === 'none'
            ? 'No hay proveedor contable configurado. Ve a Configuracion → Integracion Contable para activar.'
            : syncEnabled
            ? `Sincronizacion activa con ${PROVIDER_LABELS[currentProvider]}. Los registros se sincronizan automaticamente en tiempo real.`
            : `Proveedor ${PROVIDER_LABELS[currentProvider]} configurado pero sincronizacion desactivada. Activa el toggle en Configuracion.`}
        </div>
      </div>

      {currentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-gray-600">Sincronizados</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{currentStats.total_synced.toLocaleString()}</p>
            {currentStats.last_sync_at && (
              <p className="text-xs text-gray-400 mt-1">
                Ultimo: {new Date(currentStats.last_sync_at).toLocaleString('es-MX')}
              </p>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm font-medium text-gray-600">Errores</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{currentStats.total_errors.toLocaleString()}</p>
            {currentStats.total_errors > 0 && (
              <button
                onClick={handleRetryErrors}
                disabled={isRetrying}
                className="text-xs text-primary-600 hover:text-primary-700 mt-1 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reintentar todos
              </button>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-600">Contactos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{currentStats.contacts_synced.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-gray-600">Pagos</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{currentStats.payouts_synced.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-500" />
            Historial de Sincronizacion
            <span className="text-sm font-normal text-gray-500">({filteredLogs.length} registros)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500 w-48"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Todos los estados</option>
              <option value="synced">Sincronizados</option>
              <option value="error">Con error</option>
              <option value="pending">Pendientes</option>
              <option value="skipped">Omitidos</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(RECORD_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Sin registros de sincronizacion</p>
            <p className="text-sm mt-1">Los eventos apareceran aqui una vez que la sincronizacion este activa</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLogs.map((entry) => (
              <div key={entry.id} className="hover:bg-gray-50 transition-colors">
                <div
                  className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                >
                  <StatusBadge status={entry.status} />
                  <span className="text-xs font-medium text-gray-600 w-28 flex-shrink-0">
                    {RECORD_TYPE_LABELS[entry.record_type] || entry.record_type}
                  </span>
                  <span className="font-mono text-xs text-gray-500 truncate flex-1">
                    {entry.record_id}
                  </span>
                  {entry.external_entity_id && (
                    <span className="font-mono text-xs text-primary-600 truncate hidden md:block w-32">
                      → {entry.external_entity_id}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:block flex-shrink-0">
                    {new Date(entry.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {entry.retry_count > 0 && (
                    <span className="text-xs text-amber-600 flex-shrink-0">{entry.retry_count} reintentos</span>
                  )}
                  {entry.status === 'error' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRetryOne(entry); }}
                      className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 flex-shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reintentar
                    </button>
                  )}
                  {expandedRow === entry.id ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </div>
                {expandedRow === entry.id && (
                  <div className="px-4 pb-3 pt-0 bg-gray-50 text-xs space-y-1.5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <span className="text-gray-400 block">Proveedor</span>
                        <span className="font-medium">{PROVIDER_LABELS[entry.provider] || entry.provider}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Tipo externo</span>
                        <span className="font-medium">{entry.external_entity_type || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">ID externo</span>
                        <span className="font-mono">{entry.external_entity_id || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Sincronizado a las</span>
                        <span className="font-medium">{entry.synced_at ? new Date(entry.synced_at).toLocaleString('es-MX') : '—'}</span>
                      </div>
                    </div>
                    {entry.error_message && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 font-mono break-all">
                        {entry.error_message}
                      </div>
                    )}
                    {entry.payload_summary && (
                      <div className="mt-2 p-2 bg-gray-100 rounded font-mono text-gray-600 break-all">
                        {JSON.stringify(entry.payload_summary)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminContabilidad;
