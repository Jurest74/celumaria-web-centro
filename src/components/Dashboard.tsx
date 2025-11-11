
import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, Package, AlertTriangle, DollarSign, ShoppingCart, Calendar, Target, Warehouse, Users, Tag, ArrowUpRight, ArrowDownRight, BarChart3, PieChart, Activity, Zap } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { useFirebase } from '../contexts/FirebaseContext';
import { selectProducts, selectSales, selectLayaways, selectCustomers, selectCategories } from '../store/selectors';
import { calculations, productCalculations, salesCalculations } from '../utils/calculations';
import { formatCurrency } from '../utils/currency';


export function Dashboard() {
  // ⚡ OPTIMIZADO: Los datos se cargan desde useNavigationData
  // No necesitamos cargar aquí para evitar doble carga
  const [loading, setLoading] = useState(false);
  
  // Selectores globales
  const products = useAppSelector(selectProducts);
  const sales = useAppSelector(selectSales);
  const layaways = useAppSelector(selectLayaways);
  const customers = useAppSelector(selectCustomers);
  const categories = useAppSelector(selectCategories);

  // Selector de período
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | '2months'>('month');
  
  // Calcular rango de fechas según período seleccionado
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    
    switch (period) {
      case 'today':
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case '2months':
        start.setMonth(now.getMonth() - 2);
        break;
    }
    
    return { startDate: start, endDate: end };
  }, [period]);

  // Filtrar datos por período
  const filteredSales = useMemo(() =>
    sales.filter(sale => {
      const date = new Date(sale.createdAt);
      return date >= startDate && date <= endDate;
    }),
    [sales, startDate, endDate]
  );
  
  const filteredLayaways = useMemo(() =>
    layaways.filter(layaway => {
      const date = new Date(layaway.createdAt);
      return date >= startDate && date <= endDate;
    }),
    [layaways, startDate, endDate]
  );

  // Calcular métricas
  const stats = useMemo(() => {
    return calculations.dashboard.calculateDashboardStats(
      products,
      filteredSales,
      filteredLayaways,
      customers,
      categories
    );
  }, [products, filteredSales, filteredLayaways, customers, categories]);

  const todaysSales = useMemo(() => 
    salesCalculations.getTodaysSales(sales).reduce((sum: number, sale: any) => sum + (sale.finalTotal || sale.total), 0), 
    [sales]
  );
  
  const lowStockCount = useMemo(() => productCalculations.getLowStockProducts(products).length, [products]);
  const outOfStockCount = useMemo(() => products.filter(p => p.stock === 0).length, [products]);
  const activeLayaways = useMemo(() => layaways.filter(l => l.status === 'active').length, [layaways]);

  if (loading || !stats) {
    return (
      <div className="bg-gray-50 flex items-center justify-center" style={{height: 'calc(100vh - 88px)'}}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#90c5e7] mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando panel de control...</p>
        </div>
      </div>
    );
  }

  const periodLabels = {
    today: 'del Día',
    week: 'de la Semana', 
    month: 'del Mes',
    '2months': 'de 2 Meses'
  };

  return (
    <div className="bg-gray-50 flex flex-col py-4" style={{height: 'calc(100vh - 88px)', overflow: 'hidden'}}>
        {/* Controles del dashboard */}
        <div className="flex justify-end items-center mb-4 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-slate-700">En vivo</span>
            </div>
            <div className="bg-white rounded-lg shadow border border-slate-200">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="bg-transparent border-0 rounded-lg px-3 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="today">Hoy</option>
                <option value="week">Semana</option>
                <option value="month">Mes</option>
                <option value="2months">2 Meses</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPIs Principales - Cards compactas */}
        <div className="mb-4 flex-shrink-0 bg-white rounded-lg p-3 border border-gray-100">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Rendimiento Financiero
            </h2>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            {/* Ventas del Periodo */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                  <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Ventas {periodLabels[period]}
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
                  {formatCurrency(stats.totalSales)}
                </p>
              </div>
            </div>

            {/* Ganancia del Periodo */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                  <TrendingUp className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Ganancia {periodLabels[period]}
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                  {formatCurrency(stats.totalProfit)}
                </p>
              </div>
            </div>

            {/* Margen Promedio */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                  <Target className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Margen
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">
                  {stats.averageProfitMargin.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Ingresos Plan Separe */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-0.5 hover:border-amber-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-amber-50 rounded flex items-center justify-center group-hover:bg-amber-100 group-hover:scale-110 transition-all duration-300">
                  <Calendar className="w-3 h-3 text-amber-600 group-hover:text-amber-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Plan Separe
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-amber-900 transition-colors duration-300">
                  {formatCurrency(stats.layawayRevenue)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Estado Operativo - Cards compactas */}
        <div className="mb-4 flex-shrink-0 rounded-lg p-3 border border-gray-100" style={{backgroundColor: '#fafbfc'}}>
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center">
              <Activity className="w-3 h-3 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Estado Operativo
            </h2>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            {/* Ventas de Hoy */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-0.5 hover:border-cyan-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-cyan-50 rounded flex items-center justify-center group-hover:bg-cyan-100 group-hover:scale-110 transition-all duration-300">
                  <ShoppingCart className="w-3 h-3 text-cyan-600 group-hover:text-cyan-700" />
                </div>
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse group-hover:scale-125 transition-transform duration-300 mx-auto mb-1"></div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Hoy
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-cyan-900 transition-colors duration-300">
                  {formatCurrency(todaysSales)}
                </p>
              </div>
            </div>

            {/* Total de Productos */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-violet-500/10 hover:-translate-y-0.5 hover:border-violet-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-violet-50 rounded flex items-center justify-center group-hover:bg-violet-100 group-hover:scale-110 transition-all duration-300">
                  <Package className="w-3 h-3 text-violet-600 group-hover:text-violet-700" />
                </div>
                <span className="text-xs px-1 py-0.5 rounded bg-slate-100 text-slate-600 group-hover:bg-violet-100 group-hover:text-violet-700 transition-all duration-300 mb-1 inline-block">
                  Items
                </span>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Productos
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-violet-900 transition-colors duration-300">
                  {products.length}
                </p>
              </div>
            </div>

            {/* Valor del Inventario */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                  <Warehouse className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                </div>
                <span className="text-xs px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 group-hover:text-emerald-800 transition-all duration-300 mb-1 inline-block">
                  Activo
                </span>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Inventario
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
                  {formatCurrency(stats.inventoryValue)}
                </p>
              </div>
            </div>

            {/* Productos con Poco Stock */}
            <div className={`group relative rounded-lg shadow-lg border p-2 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out ${
              lowStockCount > 0 
                ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200 hover:shadow-red-500/20 hover:border-red-300' 
                : 'bg-white border-gray-300 hover:shadow-xl hover:border-gray-400'
            }`}>
              <div className="text-center">
                <div className={`w-5 h-5 mx-auto mb-1 rounded flex items-center justify-center group-hover:scale-110 transition-all duration-300 ${
                  lowStockCount > 0 
                    ? 'bg-red-50 group-hover:bg-red-100' 
                    : 'bg-slate-100 group-hover:bg-slate-200'
                }`}>
                  <AlertTriangle className={`w-3 h-3 transition-colors duration-300 ${
                    lowStockCount > 0 ? 'text-red-600 group-hover:text-red-700' : 'text-slate-500 group-hover:text-slate-600'
                  }`} />
                </div>
                {lowStockCount > 0 ? (
                  <span className="text-xs px-1 py-0.5 rounded bg-red-100 text-red-600 animate-pulse group-hover:bg-red-200 group-hover:text-red-700 transition-all duration-300 mb-1 inline-block">
                    !
                  </span>
                ) : (
                  <span className="text-xs px-1 py-0.5 rounded bg-green-100 text-green-600 group-hover:bg-green-200 group-hover:text-green-700 transition-all duration-300 mb-1 inline-block">
                    OK
                  </span>
                )}
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Poco Stock
                </p>
                <p className={`text-base font-bold transition-colors duration-300 ${
                  lowStockCount > 0 ? 'text-red-600 group-hover:text-red-800' : 'text-slate-900 group-hover:text-slate-700'
                }`}>
                  {lowStockCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen Inventario - Cards compactas */}
        <div className="flex-1 min-h-0 bg-white rounded-lg p-3 border border-gray-100">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center">
              <PieChart className="w-3 h-3 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Resumen Inventario
            </h2>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            {/* Productos Sin Stock */}
            <div className={`group relative rounded-lg shadow-lg border p-2 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out ${
              outOfStockCount > 0 
                ? 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200 hover:shadow-red-500/20 hover:border-red-300' 
                : 'bg-white border-gray-300 hover:shadow-xl hover:border-gray-400'
            }`}>
              <div className="text-center">
                <div className={`w-5 h-5 mx-auto mb-1 rounded flex items-center justify-center group-hover:scale-110 transition-all duration-300 ${
                  outOfStockCount > 0 
                    ? 'bg-red-50 group-hover:bg-red-100' 
                    : 'bg-slate-100 group-hover:bg-slate-200'
                }`}>
                  <Package className={`w-3 h-3 transition-colors duration-300 ${
                    outOfStockCount > 0 ? 'text-red-600 group-hover:text-red-700' : 'text-slate-500 group-hover:text-slate-600'
                  }`} />
                </div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-0.5 group-hover:text-slate-600 transition-colors duration-300">
                  Sin Stock
                </p>
                <p className={`text-sm font-bold transition-colors duration-300 ${
                  outOfStockCount > 0 ? 'text-red-600 group-hover:text-red-800' : 'text-slate-900 group-hover:text-slate-700'
                }`}>
                  {outOfStockCount}
                </p>
              </div>
            </div>

            {/* Plan Separe Activos */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-0.5 hover:border-amber-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-amber-50 rounded flex items-center justify-center group-hover:bg-amber-100 group-hover:scale-110 transition-all duration-300">
                  <Calendar className="w-3 h-3 text-amber-600 group-hover:text-amber-700" />
                </div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-0.5 group-hover:text-slate-600 transition-colors duration-300">
                  Plan Separe
                </p>
                <p className="text-sm font-bold text-slate-900 group-hover:text-amber-900 transition-colors duration-300">
                  {activeLayaways}
                </p>
              </div>
            </div>

            {/* Total de Clientes */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                  <Users className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                </div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-0.5 group-hover:text-slate-600 transition-colors duration-300">
                  Clientes
                </p>
                <p className="text-sm font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                  {customers.length}
                </p>
              </div>
            </div>

            {/* Categorías Activas */}
            <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                  <Tag className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
                </div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-0.5 group-hover:text-slate-600 transition-colors duration-300">
                  Categorías
                </p>
                <p className="text-sm font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">
                  {categories.filter(c => c.isActive).length}
                </p>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}