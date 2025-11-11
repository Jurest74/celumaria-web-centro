import { useState, useMemo, useEffect } from 'react';
import { Receipt, DollarSign, Calendar, User, CreditCard, Banknote, Smartphone, Clock, Search, Filter, X } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';
import { InvoiceModal } from './Sales';
import { salesService } from '../services/firebase/firestore';
import { Sale } from '../types';

export function MyDailySales() {
  const { appUser } = useAuth();
  const [todaySales, setTodaySales] = useState<Sale[]>([]);

  // Suscripción optimizada: solo ventas del día del vendedor actual
  useEffect(() => {
    if (!appUser?.uid) return;

    console.log('🔥 Iniciando suscripción optimizada a ventas del día');
    const unsubscribe = salesService.subscribeTodaySalesBySalesperson(
      appUser.uid,
      (sales) => {
        console.log('🔥 Ventas del día actualizadas:', sales.length);
        setTodaySales(sales);
      }
    );

    return () => {
      console.log('🔥 Cerrando suscripción a ventas del día');
      unsubscribe();
    };
  }, [appUser?.uid]);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  // Estados de filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // Ya no necesitamos filtrar porque la suscripción ya trae solo las ventas del día del vendedor
  const myTodaySales = todaySales;

  // Aplicar filtros adicionales a las ventas del día
  const filteredSales = useMemo(() => {
    return myTodaySales.filter((sale: any) => {
      // Filtro por búsqueda de cliente
      if (searchQuery) {
        const customerName = (sale.customerName || 'Cliente General').toLowerCase();
        if (!customerName.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      // Filtro por método de pago
      if (selectedPaymentMethod !== 'all') {
        const hasPaymentMethod = Array.isArray(sale.paymentMethods)
          ? sale.paymentMethods.some((pm: any) => pm.method === selectedPaymentMethod)
          : sale.paymentMethod === selectedPaymentMethod;

        if (!hasPaymentMethod) return false;
      }

      // Filtro por monto mínimo
      if (minAmount) {
        const saleTotal = sale.finalTotal || sale.total || 0;
        if (saleTotal < parseFloat(minAmount)) return false;
      }

      // Filtro por monto máximo
      if (maxAmount) {
        const saleTotal = sale.finalTotal || sale.total || 0;
        if (saleTotal > parseFloat(maxAmount)) return false;
      }

      return true;
    });
  }, [myTodaySales, searchQuery, selectedPaymentMethod, minAmount, maxAmount]);

  // Obtener métodos de pago únicos disponibles
  const availablePaymentMethods = useMemo(() => {
    const methods = new Set<string>();
    myTodaySales.forEach((sale: any) => {
      if (Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0) {
        sale.paymentMethods.forEach((pm: any) => methods.add(pm.method));
      } else if (sale.paymentMethod) {
        methods.add(sale.paymentMethod);
      }
    });
    return Array.from(methods);
  }, [myTodaySales]);

  // Calcular estadísticas del día
  const todayStats = useMemo(() => {
    const totalSales = myTodaySales.length;
    const totalRevenue = myTodaySales.reduce((sum, sale) => sum + (sale.finalTotal || sale.total || 0), 0);
    const totalItems = myTodaySales.reduce((sum, sale) => {
      if (!sale.items || !Array.isArray(sale.items)) return sum;
      return sum + sale.items.reduce((itemSum: number, item: any) => itemSum + item.quantity, 0);
    }, 0);

    // Calcular ventas por método de pago
    const paymentMethodTotals: Record<string, number> = {};

    myTodaySales.forEach((sale: any) => {
      const saleTotal = sale.finalTotal || sale.total || 0;

      if (Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0) {
        // Ventas con múltiples métodos de pago
        sale.paymentMethods.forEach((payment: any) => {
          const method = payment.method || 'efectivo';
          paymentMethodTotals[method] = (paymentMethodTotals[method] || 0) + payment.amount;
        });
      } else {
        // Ventas con método de pago único (compatibilidad)
        const method = sale.paymentMethod || 'efectivo';
        paymentMethodTotals[method] = (paymentMethodTotals[method] || 0) + saleTotal;
      }
    });

    // Calcular ventas por tipo (para cuadre de caja)
    let cellphones = 0;
    let otherProducts = 0;
    let technicalServices = 0;
    let layawayPayments = 0;

    // Debug: ver tipos de ventas
    const salesByType = myTodaySales.reduce((acc: any, sale: any) => {
      const type = sale.type || 'regular';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    console.log('📊 Tipos de ventas del día:', salesByType);

    // Debug: buscar abonos
    const layawaySales = myTodaySales.filter((s: any) => s.isLayaway);
    console.log('🔍 Ventas con isLayaway:', layawaySales.length);
    if (layawaySales.length > 0) {
      layawaySales.forEach((s: any) => {
        console.log('  - ID:', s.id.substring(0, 8), 'Type:', s.type, 'isLayaway:', s.isLayaway, 'Total:', s.total);
      });
    }

    myTodaySales.forEach((sale: any) => {
      const saleAmount = sale.finalTotal || sale.total || 0;

      // Servicios técnicos (pero excluir abonos de plan separe mal etiquetados)
      if (sale.type === 'technical_service_payment' && !sale.isLayaway) {
        technicalServices += saleAmount;
        return;
      }

      // Abonos a plan separe - Soporta formato antiguo (isLayaway sin type) y nuevo (type='layaway_payment')
      if (sale.type === 'layaway_payment' || (sale.isLayaway && sale.type !== 'layaway_delivery')) {
        console.log('💵 Abono plan separe encontrado:', {
          id: sale.id.substring(0, 8),
          amount: saleAmount,
          type: sale.type,
          isLayaway: sale.isLayaway
        });
        layawayPayments += saleAmount;
        return;
      }

      // Entregas de plan separe (no cuentan como ingreso nuevo)
      if (sale.type === 'layaway_delivery') {
        return;
      }

      // Ventas regulares: separar celulares de otros productos
      if (sale.type === 'regular' || !sale.type) {
        // Verificar que items existe y es un array
        if (sale.items && Array.isArray(sale.items) && sale.items.length > 0) {
          sale.items.forEach((item: any) => {
            const itemTotal = item.totalRevenue;

            // Verificar si es un celular
            if (item.category && item.category.toLowerCase().includes('celular')) {
              cellphones += itemTotal;
            } else {
              otherProducts += itemTotal;
            }
          });

          // Si hay descuento, prorratearlo proporcionalmente
          if (sale.discount > 0) {
            const subtotal = sale.subtotal;
            if (subtotal > 0) {
              const discountRatio = sale.discount / subtotal;
              cellphones -= (sale.items
                .filter((item: any) => item.category && item.category.toLowerCase().includes('celular'))
                .reduce((sum: number, item: any) => sum + item.totalRevenue, 0) * discountRatio);
              otherProducts -= (sale.items
                .filter((item: any) => !item.category || !item.category.toLowerCase().includes('celular'))
                .reduce((sum: number, item: any) => sum + item.totalRevenue, 0) * discountRatio);
            }
          }
        }
      }
    });

    return {
      totalSales,
      totalRevenue,
      totalItems,
      paymentMethods: paymentMethodTotals,
      breakdown: {
        cellphones,
        otherProducts,
        technicalServices,
        layawayPayments,
        percentages: {
          cellphones: totalRevenue > 0 ? (cellphones / totalRevenue) * 100 : 0,
          otherProducts: totalRevenue > 0 ? (otherProducts / totalRevenue) * 100 : 0,
          technicalServices: totalRevenue > 0 ? (technicalServices / totalRevenue) * 100 : 0,
          layawayPayments: totalRevenue > 0 ? (layawayPayments / totalRevenue) * 100 : 0,
        }
      }
    };
  }, [myTodaySales]);

  const handleViewInvoice = (sale: any) => {
    setSelectedSale(sale);
    setShowInvoice(true);
  };

  const handleCloseInvoice = () => {
    setShowInvoice(false);
    setSelectedSale(null);
  };

  // Función para limpiar todos los filtros
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedPaymentMethod('all');
    setMinAmount('');
    setMaxAmount('');
  };

  // Verificar si hay filtros activos
  const hasActiveFilters = searchQuery || selectedPaymentMethod !== 'all' || minAmount || maxAmount;

  // Función para obtener el ícono y nombre del método de pago
  const getPaymentMethodInfo = (method: string) => {
    switch (method) {
      case 'efectivo':
        return { name: 'Efectivo', icon: Banknote, color: 'text-green-600', bgColor: 'bg-green-100' };
      case 'transferencia':
        return { name: 'Transferencia', icon: Smartphone, color: 'text-blue-600', bgColor: 'bg-blue-100' };
      case 'tarjeta':
        return { name: 'Tarjeta', icon: CreditCard, color: 'text-purple-600', bgColor: 'bg-purple-100' };
      case 'crédito':
      case 'credit':
        return { name: 'Crédito', icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-100' };
      default:
        return { name: method, icon: DollarSign, color: 'text-gray-600', bgColor: 'bg-gray-100' };
    }
  };

  // Función para determinar el tipo de venta
  const getSaleType = (sale: any) => {
    // Servicios técnicos
    if (sale.type === 'technical_service_payment') {
      return {
        label: 'Servicio Técnico',
        icon: '🔧',
        bgColor: 'bg-green-100',
        textColor: 'text-green-700',
        borderColor: 'border-green-200'
      };
    }

    // Abonos a plan separe
    if (sale.type === 'layaway_payment') {
      return {
        label: 'Plan Separe',
        icon: '💵',
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200'
      };
    }

    // Entregas de plan separe
    if (sale.type === 'layaway_delivery') {
      return {
        label: 'Entrega Separe',
        icon: '📦',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200'
      };
    }

    // Ventas regulares: determinar si es celular u otros
    const hasCellphones = sale.items.some((item: any) =>
      item.category && item.category.toLowerCase().includes('celular')
    );
    const hasOthers = sale.items.some((item: any) =>
      !item.category || !item.category.toLowerCase().includes('celular')
    );

    if (hasCellphones && hasOthers) {
      return {
        label: 'Mixta',
        icon: '📱🛍️',
        bgColor: 'bg-indigo-100',
        textColor: 'text-indigo-700',
        borderColor: 'border-indigo-200'
      };
    } else if (hasCellphones) {
      return {
        label: 'Celulares',
        icon: '📱',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200'
      };
    } else {
      return {
        label: 'Otros Productos',
        icon: '🛍️',
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-700',
        borderColor: 'border-purple-200'
      };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Ventas del Día</h1>
            <p className="text-gray-600 mt-1">
              Ventas realizadas por {appUser?.displayName || appUser?.email} el {new Date().toLocaleDateString('es-CO')}
            </p>
          </div>
          <div className="flex items-center space-x-2 text-blue-600">
            <User className="h-6 w-6" />
            <Calendar className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Estadísticas del día */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <Receipt className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Ventas Realizadas</p>
              <p className="text-2xl font-bold text-gray-900">{todayStats.totalSales}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Vendido</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(todayStats.totalRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-full">
              <Receipt className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Productos Vendidos</p>
              <p className="text-2xl font-bold text-gray-900">{todayStats.totalItems}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Desglose por Tipo de Ingreso (Cuadre de Caja) */}
      {todayStats.totalRevenue > 0 && (
        <div className="bg-gray-50 rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Desglose de Ingresos (Cuadre de Caja)</h2>
            <p className="text-sm text-gray-600">Segregación de ventas por tipo de producto y servicio</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Celulares */}
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">📱</span>
                  <span className="text-sm font-medium text-gray-700">Celulares</span>
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                  {todayStats.breakdown.percentages.cellphones.toFixed(0)}%
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(todayStats.breakdown.cellphones)}
              </p>
            </div>

            {/* Otros Productos */}
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">🛍️</span>
                  <span className="text-sm font-medium text-gray-700">Otros productos</span>
                </div>
                <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                  {todayStats.breakdown.percentages.otherProducts.toFixed(0)}%
                </span>
              </div>
              <p className="text-2xl font-bold text-purple-700">
                {formatCurrency(todayStats.breakdown.otherProducts)}
              </p>
            </div>

            {/* Servicios Técnicos */}
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">🔧</span>
                  <span className="text-sm font-medium text-gray-700">Servicios técnicos</span>
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  {todayStats.breakdown.percentages.technicalServices.toFixed(0)}%
                </span>
              </div>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(todayStats.breakdown.technicalServices)}
              </p>
            </div>

            {/* Abonos Plan Separe */}
            <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">💵</span>
                  <span className="text-sm font-medium text-gray-700">Plan Separe</span>
                </div>
                <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                  {todayStats.breakdown.percentages.layawayPayments.toFixed(0)}%
                </span>
              </div>
              <p className="text-2xl font-bold text-amber-700">
                {formatCurrency(todayStats.breakdown.layawayPayments)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ventas por método de pago */}
      {Object.keys(todayStats.paymentMethods).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Ventas por Método de Pago</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(todayStats.paymentMethods).map(([method, amount]) => {
                const paymentInfo = getPaymentMethodInfo(method);
                const PaymentIcon = paymentInfo.icon;
                return (
                  <div key={method} className="flex items-center p-4 rounded-lg border border-gray-200">
                    <div className={`p-2 rounded-full ${paymentInfo.bgColor}`}>
                      <PaymentIcon className={`h-5 w-5 ${paymentInfo.color}`} />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-600">{paymentInfo.name}</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(amount)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lista de ventas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <h2 className="text-lg font-semibold text-gray-900">Detalle de Ventas</h2>
              {hasActiveFilters && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                  {filteredSales.length} de {myTodaySales.length}
                </span>
              )}
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Limpiar Filtros</span>
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Búsqueda por cliente */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filtro por método de pago */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Todos los métodos</option>
                {availablePaymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method === 'efectivo' ? 'Efectivo' :
                     method === 'transferencia' ? 'Transferencia' :
                     method === 'tarjeta' ? 'Tarjeta' :
                     method === 'crédito' ? 'Crédito' : method}
                  </option>
                ))}
              </select>
            </div>

            {/* Monto mínimo */}
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="number"
                placeholder="Monto mínimo"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Monto máximo */}
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="number"
                placeholder="Monto máximo"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {myTodaySales.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay ventas registradas</h3>
              <p className="text-gray-600">Aún no tienes ventas registradas para el día de hoy.</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="p-8 text-center">
              <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron ventas</h3>
              <p className="text-gray-600">No hay ventas que coincidan con los filtros aplicados.</p>
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Limpiar Filtros
              </button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID Venta
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Método de Pago
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSales.map((sale: any) => {
                  const saleType = getSaleType(sale);
                  return (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                      {sale.id.substring(0, 8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(sale.createdAt).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${saleType.bgColor} ${saleType.textColor} ${saleType.borderColor}`}>
                        <span className="mr-1">{saleType.icon}</span>
                        {saleType.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.customerName || 'Cliente General'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} productos
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(sale.finalTotal || sale.total || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(sale.paymentMethods) ? (
                          sale.paymentMethods.map((payment: any, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {payment.method === 'efectivo' ? 'Efectivo' : 
                               payment.method === 'transferencia' ? 'Transferencia' : 
                               payment.method === 'tarjeta' ? 'Tarjeta' : 
                               payment.method === 'crédito' ? 'Crédito' : payment.method}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {sale.paymentMethod === 'efectivo' ? 'Efectivo' : 
                             sale.paymentMethod === 'transferencia' ? 'Transferencia' : 
                             sale.paymentMethod === 'tarjeta' ? 'Tarjeta' : 
                             sale.paymentMethod === 'crédito' ? 'Crédito' : sale.paymentMethod}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewInvoice(sale)}
                        className="text-blue-600 hover:text-blue-900 flex items-center space-x-1"
                      >
                        <Receipt className="h-4 w-4" />
                        <span>Ver Factura</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de factura */}
      {showInvoice && selectedSale && (
        <InvoiceModal sale={selectedSale} onClose={handleCloseInvoice} />
      )}
    </div>
  );
}