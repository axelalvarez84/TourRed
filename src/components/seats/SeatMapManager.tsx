import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, User, AlertCircle, Loader2, RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SeatWithStatus, VehicleSeatLayout } from '../../types/seats';
import { useAuth } from '../../context/AuthContext';

interface SeatMapManagerProps {
  tourId: string;
  slotId?: string | null;
  agencyId: string;
  tourDate?: string;
  slotTime?: string;
}

const SEAT_SIZE = 36;
const SEAT_GAP = 6;
const AISLE_WIDTH = 20;
const PADDING = 16;

interface BlockModalState {
  open: boolean;
  seatNumber: number;
  note: string;
  isSubmitting: boolean;
}

const SeatMapManager: React.FC<SeatMapManagerProps> = ({
  tourId,
  slotId,
  agencyId,
  tourDate,
  slotTime,
}) => {
  const { user } = useAuth();
  const [layout, setLayout] = useState<VehicleSeatLayout | null>(null);
  const [seatsWithStatus, setSeatsWithStatus] = useState<SeatWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockModal, setBlockModal] = useState<BlockModalState>({ open: false, seatNumber: 0, note: '', isSubmitting: false });
  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ seat: number; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data: tourData, error: tourError } = await supabase
        .from('tours')
        .select('vehicle_map_type')
        .eq('id', tourId)
        .maybeSingle();

      if (tourError || !tourData?.vehicle_map_type) {
        setError('No se pudo cargar el tipo de vehiculo del tour.');
        return;
      }

      const { data: layoutData, error: layoutError } = await supabase
        .from('vehicle_seat_layouts')
        .select('*')
        .eq('type', tourData.vehicle_map_type)
        .eq('is_active', true)
        .maybeSingle();

      if (layoutError || !layoutData) {
        setError('No se pudo cargar el layout del vehiculo.');
        return;
      }

      const parsedLayout: VehicleSeatLayout = {
        ...layoutData,
        seats: typeof layoutData.seats === 'string' ? JSON.parse(layoutData.seats) : layoutData.seats,
        vehicle_shape: typeof layoutData.vehicle_shape === 'string' ? JSON.parse(layoutData.vehicle_shape) : layoutData.vehicle_shape,
      };
      setLayout(parsedLayout);

      let query = supabase
        .from('slot_seat_status')
        .select(`
          seat_number, status, booking_id, block_note, blocked_by,
          bookings:booking_id (
            booking_code,
            users:user_id (first_name, last_name)
          )
        `)
        .eq('tour_id', tourId);

      if (slotId) {
        query = query.eq('slot_id', slotId);
      } else {
        query = query.is('slot_id', null);
      }

      const { data: statusData } = await query;

      const statusMap: Record<number, SeatWithStatus> = {};
      (statusData || []).forEach((s: any) => {
        const travelerName = s.bookings?.users
          ? `${s.bookings.users.first_name || ''} ${s.bookings.users.last_name || ''}`.trim()
          : null;
        const normalizedStatus = s.status === 'bloqueado_agencia' ? 'bloqueado'
          : s.status === 'reservado_online' ? 'reservado'
          : 'disponible';
        statusMap[s.seat_number] = {
          number: s.seat_number,
          row: 0,
          col: 0,
          side: 'left',
          type: 'normal',
          status: normalizedStatus,
          booking_id: s.booking_id,
          block_note: s.block_note,
          traveler_name: travelerName,
          booking_code: s.bookings?.booking_code || null,
        };
      });

      const combined: SeatWithStatus[] = parsedLayout.seats.map(seat => ({
        ...seat,
        status: statusMap[seat.number]?.status || 'disponible',
        booking_id: statusMap[seat.number]?.booking_id || null,
        block_note: statusMap[seat.number]?.block_note || null,
        traveler_name: statusMap[seat.number]?.traveler_name || null,
        booking_code: statusMap[seat.number]?.booking_code || null,
      }));

      setSeatsWithStatus(combined);
    } catch (err: any) {
      setError('Error al cargar el mapa de asientos.');
    } finally {
      setIsLoading(false);
    }
  }, [tourId, slotId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel(`seat-manager-${tourId}-${slotId || 'no-slot'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'slot_seat_status',
        filter: `tour_id=eq.${tourId}`,
      }, () => { loadData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tourId, slotId, loadData]);

  const handleSeatClick = (seat: SeatWithStatus) => {
    if (seat.status === 'reservado') return;
    if (seat.status === 'bloqueado') {
      handleUnblock(seat.number);
      return;
    }
    setBlockModal({ open: true, seatNumber: seat.number, note: '', isSubmitting: false });
  };

  const handleBlock = async () => {
    if (!user) return;
    setBlockModal(prev => ({ ...prev, isSubmitting: true }));
    try {
      let deleteQuery = supabase
        .from('slot_seat_status')
        .delete()
        .eq('tour_id', tourId)
        .eq('seat_number', blockModal.seatNumber);

      if (slotId) {
        deleteQuery = (deleteQuery as any).eq('slot_id', slotId);
      } else {
        deleteQuery = (deleteQuery as any).is('slot_id', null);
      }
      await deleteQuery;

      const payload: any = {
        tour_id: tourId,
        agency_id: agencyId,
        seat_number: blockModal.seatNumber,
        status: 'bloqueado_agencia',
        block_note: blockModal.note || null,
        blocked_by: user.id,
        blocked_at: new Date().toISOString(),
      };
      if (slotId) payload.slot_id = slotId;

      const { error } = await supabase
        .from('slot_seat_status')
        .insert(payload);

      if (error) throw error;
      setActionFeedback({ seat: blockModal.seatNumber, message: 'Asiento bloqueado' });
      setTimeout(() => setActionFeedback(null), 2500);
      setBlockModal({ open: false, seatNumber: 0, note: '', isSubmitting: false });
      await loadData();
    } catch (err: any) {
      setBlockModal(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleUnblock = async (seatNumber: number) => {
    try {
      let query = supabase
        .from('slot_seat_status')
        .delete()
        .eq('tour_id', tourId)
        .eq('seat_number', seatNumber)
        .eq('status', 'bloqueado_agencia');

      if (slotId) {
        query = (query as any).eq('slot_id', slotId);
      } else {
        query = (query as any).is('slot_id', null);
      }

      await query;
      setActionFeedback({ seat: seatNumber, message: 'Asiento desbloqueado' });
      setTimeout(() => setActionFeedback(null), 2500);
      await loadData();
    } catch (err: any) {
      console.error('Error desbloqueando asiento:', err);
    }
  };

  const renderSeatGrid = () => {
    if (!layout) return null;
    const shape = layout.vehicle_shape;

    const seatMap: Record<string, SeatWithStatus> = {};
    seatsWithStatus.forEach(s => { seatMap[`${s.row}-${s.col}`] = s; });

    const colWidth = SEAT_SIZE + SEAT_GAP;
    const rowHeight = SEAT_SIZE + SEAT_GAP;
    const aisleX = (shape.aisleAfterCol + 1) * colWidth + PADDING;
    const totalWidth = shape.totalCols * colWidth + AISLE_WIDTH + PADDING * 2;
    const driverOffset = shape.hasDriver && shape.driverRow === 0 ? rowHeight + 8 : 0;
    const totalHeight = shape.totalRows * rowHeight + PADDING * 2 + driverOffset;

    const getColX = (col: number) => {
      const baseX = PADDING;
      return col <= shape.aisleAfterCol
        ? baseX + col * colWidth
        : baseX + col * colWidth + AISLE_WIDTH;
    };

    const getRowY = (row: number) => PADDING + driverOffset + row * rowHeight;

    return (
      <svg width={totalWidth} height={totalHeight} className="block mx-auto">
        <rect x={0} y={0} width={totalWidth} height={totalHeight} rx={16} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1.5} />

        {shape.hasDriver && shape.driverRow === 0 && (
          <g>
            <rect x={getColX(shape.driverCol)} y={PADDING} width={SEAT_SIZE} height={SEAT_SIZE} rx={6} fill="#94a3b8" stroke="#64748b" strokeWidth={1.5} />
            <text x={getColX(shape.driverCol) + SEAT_SIZE / 2} y={PADDING + SEAT_SIZE / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#475569" fontWeight="600">COND</text>
          </g>
        )}

        <line x1={aisleX} y1={PADDING} x2={aisleX} y2={totalHeight - PADDING} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4,4" />

        {shape.hasBathroom && shape.bathroomRow !== undefined && shape.bathroomCol !== undefined && (
          <g>
            <rect x={getColX(shape.bathroomCol)} y={getRowY(shape.bathroomRow)} width={SEAT_SIZE} height={SEAT_SIZE} rx={6} fill="#bfdbfe" stroke="#93c5fd" strokeWidth={1.5} />
            <text x={getColX(shape.bathroomCol) + SEAT_SIZE / 2} y={getRowY(shape.bathroomRow) + SEAT_SIZE / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1d4ed8" fontWeight="600">WC</text>
          </g>
        )}

        {Array.from({ length: shape.totalRows }, (_, row) =>
          Array.from({ length: shape.totalCols }, (_, col) => {
            const key = `${row}-${col}`;
            const seat = seatMap[key];
            if (!seat) return null;

            const isHovered = hoveredSeat === seat.number;
            const x = getColX(col);
            const y = getRowY(row);

            let fill = '#ffffff';
            let stroke = '#d1d5db';
            let textFill = '#374151';
            let cursor = 'pointer';

            if (seat.status === 'reservado') {
              fill = '#9ca3af'; stroke = '#6b7280'; textFill = '#4b5563'; cursor = 'default';
            } else if (seat.status === 'bloqueado') {
              fill = '#fbbf24'; stroke = '#d97706'; textFill = '#78350f';
            } else if (isHovered) {
              fill = '#dbeafe'; stroke = '#3b82f6';
            }

            const tooltip = seat.status === 'reservado'
              ? `Asiento ${seat.number} - ${seat.traveler_name || 'Reservado'}${seat.booking_code ? ` (${seat.booking_code})` : ''}`
              : seat.status === 'bloqueado'
              ? `Asiento ${seat.number} - Bloqueado${seat.block_note ? `: ${seat.block_note}` : ''} — Click para desbloquear`
              : `Asiento ${seat.number} - Disponible — Click para bloquear`;

            return (
              <g
                key={key}
                onClick={() => seat.status !== 'reservado' && handleSeatClick(seat)}
                onMouseEnter={() => setHoveredSeat(seat.number)}
                onMouseLeave={() => setHoveredSeat(null)}
                style={{ cursor }}
              >
                <title>{tooltip}</title>
                <rect x={x} y={y} width={SEAT_SIZE} height={SEAT_SIZE} rx={6} fill={fill} stroke={stroke} strokeWidth={isHovered ? 2 : 1.5} />
                <text x={x + SEAT_SIZE / 2} y={y + SEAT_SIZE / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="500" fill={textFill}>
                  {seat.number}
                </text>
                {seat.status === 'bloqueado' && (
                  <g>
                    <circle cx={x + SEAT_SIZE - 7} cy={y + 7} r={6} fill="#d97706" />
                    <text x={x + SEAT_SIZE - 7} y={y + 8} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#fff">🔒</text>
                  </g>
                )}
                {seat.status === 'reservado' && (
                  <g>
                    <circle cx={x + SEAT_SIZE - 7} cy={y + 7} r={6} fill="#6b7280" />
                    <text x={x + SEAT_SIZE - 7} y={y + 8} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#fff">👤</text>
                  </g>
                )}
              </g>
            );
          })
        )}
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Cargando mapa de asientos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (!layout) return null;

  const totalSeats = seatsWithStatus.length;
  const reservados = seatsWithStatus.filter(s => s.status === 'reservado').length;
  const bloqueados = seatsWithStatus.filter(s => s.status === 'bloqueado').length;
  const disponibles = totalSeats - reservados - bloqueados;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">
          Gestion de Asientos
          {tourDate && <span className="ml-2 text-sm font-normal text-gray-500">— {tourDate}{slotTime ? ` ${slotTime}` : ''}</span>}
        </h3>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{disponibles}</p>
          <p className="text-xs text-green-600">Disponibles</p>
        </div>
        <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-600">{reservados}</p>
          <p className="text-xs text-gray-500">Reservados</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{bloqueados}</p>
          <p className="text-xs text-amber-500">Bloqueados</p>
        </div>
      </div>

      {actionFeedback && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-pulse">
          <Check className="w-4 h-4" />
          <span>Asiento {actionFeedback.seat}: {actionFeedback.message}</span>
        </div>
      )}

      <div className="overflow-auto pb-2">
        <div className="min-w-max mx-auto">
          {renderSeatGrid()}
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-gray-300 bg-white" />
          <span>Disponible — click para bloquear</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-gray-400 bg-gray-300" />
          <span>Reservado (online)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-amber-500 bg-amber-400" />
          <span>Bloqueado — click para desbloquear</span>
        </div>
      </div>

      {hoveredSeat !== null && (() => {
        const seat = seatsWithStatus.find(s => s.number === hoveredSeat);
        if (!seat || seat.status === 'disponible') return null;
        return (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <User className="w-4 h-4" />
              <span className="font-medium">Asiento {seat.number}</span>
              {seat.status === 'reservado' && (
                <span className="text-gray-600">
                  — {seat.traveler_name || 'Viajero'}{seat.booking_code ? ` · Reserva ${seat.booking_code}` : ''}
                </span>
              )}
              {seat.status === 'bloqueado' && (
                <span className="text-amber-700">
                  — Bloqueado{seat.block_note ? `: ${seat.block_note}` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {blockModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-gray-800">Bloquear Asiento {blockModal.seatNumber}</h3>
              </div>
              <button onClick={() => setBlockModal({ open: false, seatNumber: 0, note: '', isSubmitting: false })} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Este asiento quedara bloqueado para nuevas reservas online. Util para ventas realizadas fuera de la plataforma.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nota opcional (nombre del cliente, canal de venta)</label>
              <input
                type="text"
                value={blockModal.note}
                onChange={e => setBlockModal(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Ej: Juan Garcia - Venta directa"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBlockModal({ open: false, seatNumber: 0, note: '', isSubmitting: false })}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBlock}
                disabled={blockModal.isSubmitting}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {blockModal.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Bloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeatMapManager;
