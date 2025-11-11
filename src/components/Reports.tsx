import React from 'react';
import { BarChart3, TrendingUp, PieChart, LineChart, DollarSign, Target } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectProducts } from '../store/selectors';
import { useSalesStats } from '../hooks/useSalesStats';
import { formatCurrency, formatNumber } from '../utils/currency';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  BarChart,
  Bar
} from 'recharts';
export function Reports() {
  const products = useAppSelector(selectProducts);
  // Usar el mismo hook que SalesHistory para totales
  const [dateFilter, setDateFilter] = React.useState('custom');
  const [customDateRange, setCustomDateRange] = React.useState(() => ({
    startDate: (() => {
      const d = new Date();
      d.setDate(1); // Primer día del mes actual
      return d.toISOString().slice(0, 10);
    })(),
    endDate: (() => {
      const d = new Date();
      return d.toISOString().slice(0, 10);
    })()
  }));
  const {
    totalSales,
    totalProfit,
    totalCost,
    totalDiscounts,
    averageTransaction,
    profitMargin,
    transactionCount,
    loading,
    error,
    refetch,
    filteredSales,
    periodComparison
  } = useSalesStats({
    dateFilter,
    customDateRange
  });
  
  // Modal para rango de fechas
  const [showDateModal, setShowDateModal] = React.useState(false);

  // Modal para rango de fechas
  // (Eliminado: declaración duplicada)

  // Validación de rango máximo 2 meses
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    let newRange = { ...customDateRange, [field]: value };
    // Validar que el rango no sea mayor a 2 meses
    if (newRange.startDate && newRange.endDate) {
      const start = new Date(newRange.startDate);
      const end = new Date(newRange.endDate);
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 62) {
        setShowDateModal(true);
        return;
      }
    }
    setCustomDateRange(newRange);
    // El useEffect en useSalesStats se encargará de refetch automáticamente
  };

  // Filtrar ventas por rango de fechas usando fecha local (sin desfase UTC)
  const getLocalDateString = (date: Date) => {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  };


  // Preparar datos para los gráficos y tablas usando solo products y useSalesStats
  // NOTA: No usar filteredSales ni cálculos legacy, solo products y stats

  // Productos con mayor inventario inmovilizado (mayor stock y baja rotación)
  const immobilizedProductsData = React.useMemo(() => {
    if (!filteredSales) {
      return products
        .map(product => ({
          name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
          fullName: product.name,
          reference: product.referencia || '',
          stock: product.stock,
          sold: 0
        }))
        .filter(product => product.stock > 0)
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 8);
    }
    
    // Calcular ventas por producto
    const productSalesMap: Record<string, number> = {};
    filteredSales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productName = item.productName || item.name || '';
          const quantity = item.quantity || 1;
          productSalesMap[productName] = (productSalesMap[productName] || 0) + quantity;
        });
      }
    });
    
    return products
      .map(product => ({
        name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
        fullName: product.name,
        reference: product.referencia || '',
        stock: product.stock,
        sold: productSalesMap[product.name] || 0
      }))
      .filter(product => product.stock > 0)
      // Ordenar por ratio de inmovilización: más stock y menos ventas = más inmovilizado
      .sort((a, b) => {
        const ratioA = a.stock / Math.max(a.sold, 1);
        const ratioB = b.stock / Math.max(b.sold, 1);
        return ratioB - ratioA;
      })
      .slice(0, 8);
  }, [products, filteredSales]);

  // Productos más vendidos por cantidad - usar ventas reales
  const mostSoldProductsData = React.useMemo(() => {
    if (!filteredSales || filteredSales.length === 0) return [];
    
    const productSales: Record<string, { name: string; fullName: string; sold: number }> = {};
    
    // Calcular ventas por producto
    filteredSales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productName = item.productName || item.name || 'Producto Desconocido';
          const quantity = item.quantity || 1;
          
          if (!productSales[productName]) {
            productSales[productName] = {
              name: productName.length > 15 ? productName.substring(0, 15) + '...' : productName,
              fullName: productName,
              sold: 0
            };
          }
          
          productSales[productName].sold += quantity;
        });
      }
    });
    
    return Object.values(productSales)
      .filter(product => product.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 8);
  }, [filteredSales]);

  // Rentabilidad por categoría del inventario actual
  const categoryChartData = React.useMemo(() => {
    const acc: Record<string, {
      name: string;
      products: number;
      inventoryValue: number;
      potentialRevenue: number;
      potentialProfit: number;
    }> = {};
    products.forEach(product => {
      const category = product.category;
      if (!acc[category]) {
        acc[category] = {
          name: category,
          products: 0,
          inventoryValue: 0,
          potentialRevenue: 0,
          potentialProfit: 0
        };
      }
      acc[category].products += 1;
      acc[category].inventoryValue += product.stock * product.purchasePrice;
      acc[category].potentialRevenue += product.stock * product.salePrice;
      acc[category].potentialProfit += product.stock * (product.salePrice - product.purchasePrice);
    });
    return Object.values(acc);
  }, [products]);
  // Colores para los gráficos
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316'];

  // Ventas por hora - agrupar ventas reales por hora del día
  const salesByHour = React.useMemo(() => {
    const hourCounts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    
    if (!filteredSales || filteredSales.length === 0) {
      return hourCounts;
    }
    
    filteredSales.forEach(sale => {
      if (sale.createdAt) {
        let dateObj;
        // Manejar Firestore Timestamp
        if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
          dateObj = new Date((sale.createdAt as any).seconds * 1000);
        } else {
          dateObj = new Date(sale.createdAt);
        }
        
        if (!isNaN(dateObj.getTime())) {
          const hour = dateObj.getHours();
          hourCounts[hour].count++;
        }
      }
    });
    
    return hourCounts;
  }, [filteredSales]);

  // Ganancia por método de pago - datos reales de las ventas filtradas
  const paymentChartData = React.useMemo(() => {
    if (!filteredSales || filteredSales.length === 0) return [];
    
    const paymentMethods: Record<string, { value: number; count: number; profit: number }> = {};
    
    filteredSales.forEach(sale => {
      // Manejar ventas con múltiples métodos de pago
      if (sale.paymentMethods && Array.isArray(sale.paymentMethods)) {
        sale.paymentMethods.forEach(payment => {
          const method = payment.method || 'Desconocido';
          if (!paymentMethods[method]) {
            paymentMethods[method] = { value: 0, count: 0, profit: 0 };
          }
          paymentMethods[method].value += payment.amount || 0;
          paymentMethods[method].count += 1;
          // Distribuir ganancia proporcionalmente
          const saleProfitPerPayment = (sale.totalProfit || 0) * ((payment.amount || 0) / (sale.total || 1));
          paymentMethods[method].profit += saleProfitPerPayment;
        });
      } else {
        // Ventas con método de pago único
        const method = sale.paymentMethod || 'Efectivo';
        if (!paymentMethods[method]) {
          paymentMethods[method] = { value: 0, count: 0, profit: 0 };
        }
        paymentMethods[method].value += sale.total || 0;
        paymentMethods[method].count += 1;
        paymentMethods[method].profit += sale.totalProfit || 0;
      }
    });
    
    return Object.entries(paymentMethods).map(([name, data]) => ({
      name,
      value: Math.round(data.value),
      count: data.count,
      profit: Math.round(data.profit)
    })).filter(method => method.value > 0);
  }, [filteredSales]);

  // Top 8 clientes que más compraron en el período seleccionado
  const topClientsData = React.useMemo(() => {
    if (!filteredSales || filteredSales.length === 0) return [];
    
    const clientSales: Record<string, { 
      name: string; 
      totalPurchases: number; 
      totalProfit: number; 
      transactionCount: number;
      customerId?: string;
    }> = {};
    
    filteredSales.forEach(sale => {
      // Solo incluir ventas que tienen cliente asociado
      if (sale.customerId && sale.customerName) {
        const clientKey = sale.customerId;
        
        if (!clientSales[clientKey]) {
          clientSales[clientKey] = {
            name: sale.customerName,
            totalPurchases: 0,
            totalProfit: 0,
            transactionCount: 0,
            customerId: sale.customerId
          };
        }
        
        clientSales[clientKey].totalPurchases += sale.total || 0;
        clientSales[clientKey].totalProfit += sale.totalProfit || 0;
        clientSales[clientKey].transactionCount += 1;
      }
    });
    
    return Object.values(clientSales)
      .filter(client => client.totalPurchases > 0)
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 8);
  }, [filteredSales]);

  // Datos diarios para el gráfico de área - agrupar ventas reales por día
  const dailySalesData = React.useMemo(() => {
    if (!filteredSales || filteredSales.length === 0) return [];
    
    const salesByDate: Record<string, { revenue: number; cost: number; profit: number; transactions: number }> = {};
    
    filteredSales.forEach(sale => {
      if (sale.createdAt) {
        let dateObj;
        // Manejar Firestore Timestamp
        if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
          dateObj = new Date((sale.createdAt as any).seconds * 1000);
        } else {
          dateObj = new Date(sale.createdAt);
        }
        
        if (!isNaN(dateObj.getTime())) {
          const dateKey = dateObj.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
          
          if (!salesByDate[dateKey]) {
            salesByDate[dateKey] = { revenue: 0, cost: 0, profit: 0, transactions: 0 };
          }
          
          salesByDate[dateKey].revenue += sale.total || 0;
          salesByDate[dateKey].cost += sale.totalCost || 0;
          salesByDate[dateKey].profit += sale.totalProfit || 0;
          salesByDate[dateKey].transactions += 1;
        }
      }
    });
    
    // Convertir a array y ordenar por fecha
    return Object.entries(salesByDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => {
        // Ordenar por fecha real, no por string
        const dateA = new Date(a.date + ', ' + new Date().getFullYear());
        const dateB = new Date(b.date + ', ' + new Date().getFullYear());
        return dateA.getTime() - dateB.getTime();
      });
  }, [filteredSales]);

  // Resumen de rentabilidad diaria - usar datos reales agrupados por día
  const salesByDay = React.useMemo(() => {
    if (!filteredSales || filteredSales.length === 0) return {};
    
    const salesByDate: Record<string, { revenue: number; cost: number; profit: number; transactions: number }> = {};
    
    filteredSales.forEach(sale => {
      if (sale.createdAt) {
        let dateObj;
        // Manejar Firestore Timestamp
        if (typeof sale.createdAt === 'object' && sale.createdAt !== null && 'seconds' in sale.createdAt) {
          dateObj = new Date((sale.createdAt as any).seconds * 1000);
        } else {
          dateObj = new Date(sale.createdAt);
        }
        
        if (!isNaN(dateObj.getTime())) {
          const dateKey = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
          
          if (!salesByDate[dateKey]) {
            salesByDate[dateKey] = { revenue: 0, cost: 0, profit: 0, transactions: 0 };
          }
          
          salesByDate[dateKey].revenue += sale.total || 0;
          salesByDate[dateKey].cost += sale.totalCost || 0;
          salesByDate[dateKey].profit += sale.totalProfit || 0;
          salesByDate[dateKey].transactions += 1;
        }
      }
    });
    
    return salesByDate;
  }, [filteredSales]);

  // Datos para la gráfica de comparativa de períodos - más simple
  const periodComparisonData = React.useMemo(() => {
    if (!periodComparison) return [];
    
    const salesGrowth = periodComparison.growth.salesGrowth;
    const profitGrowth = periodComparison.growth.profitGrowth;
    
    return [
      {
        metric: 'Ventas Totales',
        current: periodComparison.current.totalSales,
        previous: periodComparison.previous.totalSales,
        growth: salesGrowth,
        unit: '$',
        description: salesGrowth >= 0 ? 'Vendí más que antes' : 'Vendí menos que antes',
        icon: salesGrowth >= 0 ? '📈' : '📉'
      },
      {
        metric: 'Ganancias',
        current: periodComparison.current.totalProfit,
        previous: periodComparison.previous.totalProfit,
        growth: profitGrowth,
        unit: '$',
        description: profitGrowth >= 0 ? 'Gané más que antes' : 'Gané menos que antes',
        icon: profitGrowth >= 0 ? '💰' : '💸'
      }
    ];
  }, [periodComparison]);

  return (
    <>
      {/* Modal de rango de fechas */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm text-center border border-gray-200">
            <h2 className="text-lg font-semibold text-red-600 mb-2">Rango de fechas inválido</h2>
            <p className="text-gray-700 mb-4">El rango máximo permitido es de 2 meses (62 días).</p>
            <button
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
              onClick={() => setShowDateModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      <div className="space-y-6 overflow-visible">
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes y Análisis Financiero</h1>
            <p className="text-gray-600 mt-1">Análisis detallado de rentabilidad y rendimiento de tu tienda</p>
          </div>
        </div>
      </div>
      {/* Filtro de fechas */}
      <div className="flex flex-wrap gap-4 items-center mb-2">
        <label className="text-sm font-medium text-gray-700">Desde:
          <input
            type="date"
            className="ml-2 border rounded px-2 py-1"
            value={customDateRange.startDate}
            max={customDateRange.endDate}
            onChange={e => handleDateChange('startDate', e.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">Hasta:
          <input
            type="date"
            className="ml-2 border rounded px-2 py-1"
            value={customDateRange.endDate}
            min={customDateRange.startDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => handleDateChange('endDate', e.target.value)}
          />
        </label>
        <span className="text-xs text-gray-500">(Máximo 2 meses)</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
              <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Ingresos Totales
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
              {formatCurrency(totalSales)}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-red-500/10 hover:-translate-y-0.5 hover:border-red-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-red-50 rounded flex items-center justify-center group-hover:bg-red-100 group-hover:scale-110 transition-all duration-300">
              <BarChart3 className="w-3 h-3 text-red-600 group-hover:text-red-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Costos Totales
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-red-900 transition-colors duration-300">
              {formatCurrency(totalCost)}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
              <TrendingUp className="w-3 h-3 text-green-600 group-hover:text-green-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Ganancia Total
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">
              {formatCurrency(totalProfit)}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
              <Target className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Margen Promedio
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
              {profitMargin.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Daily Sales Chart - Full Width */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
      <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
        <LineChart className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" />
        <span className="break-words">Análisis de Ventas del Período</span>
      </h3>
      <p className="text-xs text-gray-500 mb-2 ml-7">Ventas reales agrupadas por día en el período seleccionado.</p>
          {dailySalesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    const formatValue = name === 'transactions' ? value : formatCurrency(value);
                    const label = name === 'revenue' ? 'Ingresos' : 
                                 name === 'cost' ? 'Costos' :
                                 name === 'profit' ? 'Ganancia' : 'Transacciones';
                    return [formatValue, label];
                  }}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stackId="1"
                  stroke="#3B82F6" 
                  fill="#3B82F6" 
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="cost" 
                  stackId="2"
                  stroke="#EF4444" 
                  fill="#EF4444" 
                  fillOpacity={0.6}
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stackId="3"
                  stroke="#10B981" 
                  fill="#10B981" 
                  fillOpacity={0.8}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <LineChart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay datos de ventas disponibles</p>
              </div>
            </div>
          )}
        </div>

      {/* Period Comparison Chart - Full Width */}
      {periodComparison && (
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
            <TrendingUp className="h-5 w-5 mr-2 text-green-500 flex-shrink-0" />
            <span className="break-words">¿Cómo voy este mes?</span>
          </h3>
          <p className="text-xs text-gray-500 mb-4 ml-7">
            Comparación del mes actual vs el mes anterior - ¿Estoy mejorando?
          </p>
          
          {periodComparisonData.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {periodComparisonData.map((item) => (
                  <div key={item.metric} className={`rounded-xl p-6 border-2 ${
                    item.growth >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center mb-4">
                      <span className="text-2xl mr-3">{item.icon}</span>
                      <div>
                        <h4 className="text-lg font-bold text-gray-800">{item.metric}</h4>
                        <p className={`text-sm font-medium ${
                          item.growth >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {item.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-white rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Este mes:</span>
                          <span className="text-lg font-bold text-blue-600">
                            {formatCurrency(item.current)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="bg-white rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Mes anterior:</span>
                          <span className="text-lg font-semibold text-gray-700">
                            {formatCurrency(item.previous)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-center pt-2">
                        <span className={`text-xl font-bold ${
                          item.growth >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {item.growth >= 0 ? '+' : ''}{item.growth.toFixed(1)}%
                        </span>
                        <div className="text-xs text-gray-600 mt-1">
                          {item.growth >= 0 ? 'de crecimiento' : 'de disminución'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-center text-lg font-semibold text-gray-700 mb-4">
                  Resumen Visual
                </h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={periodComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="metric" 
                      tick={{ fontSize: 14, fontWeight: 'bold' }}
                      stroke="#374151"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      stroke="#6b7280"
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      formatter={(value: any, name: string) => {
                        const displayName = name === 'current' ? 'Este mes' : 'Mes anterior';
                        return [formatCurrency(value), displayName];
                      }}
                      contentStyle={{ 
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Bar dataKey="current" fill="#10B981" name="current" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="previous" fill="#9CA3AF" name="previous" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay datos suficientes para comparar períodos</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Section */}
      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 md:gap-6 overflow-visible">
        {/* Top Products by Quantity Sold Pie Chart */}
        <div className="bg-white rounded-xl p-2 sm:p-4 md:p-6 shadow-sm border border-gray-100 w-full min-w-0 overflow-visible relative">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
            <PieChart className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" />
            <span className="break-words">Productos Más Vendidos (proporción)</span>
          </h3>
          {mostSoldProductsData.length > 0 ? (
            <div className="w-full h-64 sm:h-72 md:h-80 relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={mostSoldProductsData}
                  dataKey="sold"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={false}
                  labelLine={false}
                >
                  {mostSoldProductsData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: string) => [`${formatNumber(value)} unidades`, name]}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <PieChart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay datos de ventas disponibles</p>
              </div>
            </div>
          )}
        </div>

        {/* Category Profitability */}
        <div className="bg-white rounded-xl p-2 sm:p-4 md:p-6 shadow-sm border border-gray-100 w-full min-w-0 overflow-visible relative">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
            <PieChart className="h-5 w-5 mr-2 text-purple-500 flex-shrink-0" />
            <span className="break-words">Rentabilidad por Categoría del Inventario Actual</span>
          </h3>
          {categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="potentialProfit"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {categoryChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => [
                    formatCurrency(value),
                    'Ganancia Potencial'
                  ]}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <PieChart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay productos disponibles</p>
              </div>
            </div>
          )}
        </div>

        {/* Payment Methods Profitability */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100 w-full min-w-0">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
            <PieChart className="h-5 w-5 mr-2 text-orange-500 flex-shrink-0" />
            <span className="break-words">Ganancia por Método de Pago</span>
          </h3>
          {paymentChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={paymentChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="profit"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {paymentChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => [
                    formatCurrency(value),
                    'Ganancia'
                  ]}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <PieChart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay datos de pago disponibles</p>
              </div>
            </div>
          )}
        </div>

        {/* Productos con mayor inventario inmovilizado */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100 mt-6 w-full col-span-2">
          <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
            <BarChart3 className="h-5 w-5 mr-2 text-[#90c5e7] flex-shrink-0" />
            <span className="break-words">Productos con Mayor Inventario Inmovilizado</span>
          </h3>
          <p className="text-xs text-gray-500 mb-2 ml-7">Productos con mucho stock y pocas ventas en el periodo seleccionado. Solo se muestran los 8 principales.</p>
          {immobilizedProductsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={600}>
              <BarChart data={[...immobilizedProductsData].sort((a, b) => b.stock - a.stock)} layout="horizontal" reverseStackOrder={true}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  type="category" 
                  tick={({ x, y, payload }) => {
                    // Render full name and reference, wrap if too long, null safe
                    const product = immobilizedProductsData[payload.index];
                    const name = product?.fullName || '';
                    const reference = product?.reference || '';
                    if (!name) return <g />;
                    let lines = [];
                    if (name.length > 22) {
                      lines = name.match(/.{1,22}/g) || [name];
                    } else {
                      lines = [name];
                    }
                    // Add reference as last line if exists
                    if (reference) lines.push(`Ref: ${reference}`);
                    return (
                      <g>
                        {lines.map((line, i) => (
                          <text x={x} y={y + 10 + i * 15} fontSize={13} fill={i === lines.length - 1 && reference ? '#6366F1' : '#374151'} textAnchor="middle" key={i}>{line}</text>
                        ))}
                      </g>
                    );
                  }}
                  stroke="#6b7280"
                  interval={0}
                  angle={0}
                  height={110}
                  label={{ value: 'Producto', position: 'insideBottom', offset: -5 }}
                />
                <YAxis dataKey="stock" type="number" tick={{ fontSize: 12 }} stroke="#6b7280" label={{ value: 'Stock', angle: -90, position: 'insideLeft', offset: 0 }} allowDecimals={false} />
                <Tooltip formatter={(value, _name, props) => {
                  const product = immobilizedProductsData[props.payload.index];
                  const name = product?.fullName || '';
                  const reference = product?.reference || '';
                  return [`${value} unidades`, reference ? `${name} (Ref: ${reference})` : name];
                }} />
                <Bar dataKey="stock" fill="#EC4899" radius={[4, 4, 0, 0]}>
                  {immobilizedProductsData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-300 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No hay productos inmovilizados</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ventas por Intervalo Horario (Horizontal) */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100 mt-6">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
          <BarChart3 className="h-5 w-5 mr-2 text-indigo-500 flex-shrink-0" />
          <span className="break-words">Ventas por Intervalo Horario</span>
        </h3>
        <p className="text-xs text-gray-500 mb-2 ml-7">Distribución real de ventas por hora del día en el período seleccionado.</p>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={salesByHour} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" type="category" tick={{ fontSize: 12 }} stroke="#6b7280" interval={0} angle={0} height={40} label={{ value: 'Hora', position: 'insideBottom', offset: -5 }} />
            <YAxis dataKey="count" type="number" tick={{ fontSize: 12 }} stroke="#6b7280" label={{ value: 'Ventas', angle: -90, position: 'insideLeft', offset: 0 }} allowDecimals={false} />
            <Tooltip formatter={(value) => `${value} ventas`} labelFormatter={label => `${label}:00`} />
            <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 8 Clientes que Más Compraron */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
          <BarChart3 className="h-5 w-5 mr-2 text-emerald-500 flex-shrink-0" />
          <span className="break-words">Top 8 Clientes que Más Compraron</span>
        </h3>
        <p className="text-xs text-gray-500 mb-4 ml-7">Clientes con mayor monto total de compras en el período seleccionado</p>
        
        {topClientsData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topClientsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    if (name === 'totalPurchases') return [formatCurrency(value), 'Total Compras'];
                    if (name === 'totalProfit') return [formatCurrency(value), 'Ganancia Generada'];
                    return [value, name];
                  }}
                  labelStyle={{ color: '#374151' }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="totalPurchases" fill="#10B981" radius={[4, 4, 0, 0]}>
                  {topClientsData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            
            {/* Tabla detallada de clientes */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Posición</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Total Compras</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Ganancia Generada</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Transacciones</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Promedio por Compra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topClientsData.map((client, index) => (
                    <tr key={client.customerId || index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${
                            index === 0 ? 'bg-yellow-500' : 
                            index === 1 ? 'bg-gray-400' : 
                            index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{client.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-green-600">{formatCurrency(client.totalPurchases)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-emerald-600">{formatCurrency(client.totalProfit)}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {client.transactionCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-gray-600">
                          {formatCurrency(client.totalPurchases / client.transactionCount)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No hay datos de clientes disponibles</p>
              <p className="text-sm text-gray-400 mt-2">Las ventas sin cliente asociado no se incluyen en este reporte</p>
            </div>
          </div>
        )}
      </div>

      {/* Daily Profitability Summary */}
      <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-4 flex items-center flex-wrap">
          <BarChart3 className="h-5 w-5 mr-2 text-blue-500 flex-shrink-0" />
          <span className="break-words">Resumen de Rentabilidad del Período</span>
        </h3>
        {Object.keys(salesByDay).length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay datos de ventas para mostrar</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">Ventas reales agrupadas por día (máximo últimos 8 días con ventas).</p>
            <div className="space-y-3">
              {Object.entries(salesByDay)
                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                .slice(0, 8)
                .map(([date, data]) => {
                  const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
                  return (
                    <div key={date} className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">
                          {new Date(date).toLocaleDateString('es-ES', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm text-gray-500">
                          {data.transactions} transacciones • Margen: {margin.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-800">
                          {formatCurrency(data.revenue)}
                        </div>
                        <div className="text-sm text-green-600">
                          +{formatCurrency(data.profit)} ganancia
                        </div>
                        <div className="text-xs text-red-600">
                          {formatCurrency(data.cost)} costo
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

