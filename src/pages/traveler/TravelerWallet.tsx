import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, Calendar, DollarSign, Gift, RefreshCw, Award, AlertCircle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface WalletInfo {
  id: string;
  balance: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: 'credit' | 'debit' | 'refund' | 'promotion' | 'gift_card' | 'adjustment';
  description: string;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
}

const TravelerWallet: React.FC = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (user) {
      loadWalletData();
    }
  }, [user]);

  const loadWalletData = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data: walletData, error: walletError } = await supabase
        .from('toursred_cash_wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletError) throw walletError;
      setWallet(walletData);

      if (walletData) {
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('toursred_cash_transactions')
          .select('*')
          .eq('wallet_id', walletData.id)
          .order('created_at', { ascending: false });

        if (transactionsError) throw transactionsError;
        setTransactions(transactionsData || []);
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'credit':
        return <ArrowUpCircle className="h-5 w-5 text-green-600" />;
      case 'debit':
        return <ArrowDownCircle className="h-5 w-5 text-red-600" />;
      case 'refund':
        return <RefreshCw className="h-5 w-5 text-blue-600" />;
      case 'promotion':
        return <Award className="h-5 w-5 text-accent-600" />;
      case 'gift_card':
        return <Gift className="h-5 w-5 text-purple-600" />;
      case 'adjustment':
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
      default:
        return <DollarSign className="h-5 w-5 text-gray-600" />;
    }
  };

  const getTransactionTypeLabel = (type: Transaction['type']) => {
    const labels = {
      credit: 'Crédito',
      debit: 'Débito',
      refund: 'Reembolso',
      promotion: 'Bonificación',
      gift_card: 'Tarjeta de Regalo',
      adjustment: 'Ajuste'
    };
    return labels[type] || type;
  };

  const getTransactionColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'credits') return t.amount > 0;
    if (filter === 'debits') return t.amount < 0;
    return true;
  });

  const totalCredits = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalDebits = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-gray-600">Cargando tu monedero...</div>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Monedero no disponible</h3>
          <p className="text-gray-600">No se pudo cargar tu monedero ToursRed Cash.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Wallet className="h-8 w-8 text-accent-600" />
          ToursRed Cash
        </h1>

        {/* Balance Card */}
        <div className="mb-8 bg-gradient-to-br from-accent-500 via-accent-600 to-orange-600 rounded-xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-accent-100 text-sm mb-2">Saldo Disponible</p>
              <p className="text-5xl font-bold">
                ${Number(wallet.balance).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-accent-100 mt-2">{wallet.currency}</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
              <Wallet className="h-12 w-12" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-300" />
                <p className="text-sm text-accent-100">Total Recibido</p>
              </div>
              <p className="text-2xl font-bold">
                ${totalCredits.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-5 w-5 text-red-300" />
                <p className="text-sm text-accent-100">Total Utilizado</p>
              </div>
              <p className="text-2xl font-bold">
                ${totalDebits.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-600" />
                Historial de Movimientos
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-accent-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilter('credits')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'credits'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Ingresos
                </button>
                <button
                  onClick={() => setFilter('debits')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'debits'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Egresos
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">No hay movimientos todavía</p>
                <p className="text-sm text-gray-500">
                  {filter === 'all'
                    ? 'Tus transacciones aparecerán aquí'
                    : filter === 'credits'
                    ? 'No hay ingresos registrados'
                    : 'No hay egresos registrados'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="bg-white rounded-full p-2 shadow-sm">
                        {getTransactionIcon(transaction.type)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{transaction.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600 font-medium">
                            {getTransactionTypeLabel(transaction.type)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(transaction.created_at), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${getTransactionColor(transaction.amount)}`}>
                        {transaction.amount >= 0 ? '+' : ''}
                        ${Math.abs(Number(transaction.amount)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Saldo: ${Number(transaction.balance_after).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Sobre ToursRed Cash</p>
              <p>
                Tu monedero ToursRed Cash es donde recibes reembolsos por cancelaciones, bonificaciones promocionales y tarjetas de regalo.
                Puedes usar este saldo para pagar tus futuras reservas en ToursRed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelerWallet;
