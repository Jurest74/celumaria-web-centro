import React, { useState } from 'react';
import { TrendingUp, Package, AlertTriangle, DollarSign, RefreshCw } from 'lucide-react';
import { useOptimizedDashboardStats, useOnDemandData } from '../hooks/useOptimizedStats';
import { formatCurrency } from '../utils/currency';

interface OptimizedDashboardProps {
  onViewChange: (view: string) => void;
}

export function OptimizedDashboard({ onViewChange }: OptimizedDashboardProps) {
  // ✅ Datos básicos (siempre cargados, pocos datos)
  const basicStats = useOptimizedDashboardStats();
  
  // ✅ Datos completos (solo cuando se necesiten)
  const { fullStats, isLoadingFullData, loadFullStats } = useOnDemandData();
  
  const [showFullStats, setShowFullStats] = useState(false);

  const handleShowFullStats = async () => {
    if (!fullStats) {
      await loadFullStats();
    }
    setShowFullStats(true);
  };

  if (!basicStats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#90c5e7] mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando estadísticas básicas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de Control</h1>
          <p className="text-gray-500 mt-1">Estadísticas en tiempo real de Dulce Milagro Moda</p>
        </div>
        
        {/* Botón para cargar estadísticas completas */}
        <button
          onClick={handleShowFullStats}
          disabled={isLoadingFullData}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${isLoadingFullData ? 'animate-spin' : ''}`} />
          <span>
            {isLoadingFullData ? 'Cargando...' : 'Ver Estadísticas Completas'}
          </span>
        </button>
      </div>

      {/* Estadísticas básicas (siempre visibles) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ventas de Hoy</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(basicStats.todaysSales)}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Productos</p>
              <p className="text-2xl font-bold text-blue-600">{basicStats.totalProducts}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Poco Stock</p>
              <p className="text-2xl font-bold text-orange-600">{basicStats.lowStockCount}</p>
            </div>
            <div className="bg-orange-100 p-3 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Valor Inventario</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(basicStats.inventoryValue)}
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas completas (solo si se solicitan) */}
      {showFullStats && fullStats && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Estadísticas Completas (Todas las Ventas)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">Ventas Totales</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(fullStats.totalSales)}
              </p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">Ganancia Total</p>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(fullStats.totalProfit)}
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">Margen Promedio</p>
              <p className="text-xl font-bold text-purple-600">
                {fullStats.averageProfitMargin.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button 
            onClick={() => onViewChange('sales')}
            className="bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Nueva Venta
          </button>
          <button 
            onClick={() => onViewChange('inventory')}
            className="bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Agregar Producto
          </button>
          <button 
            onClick={() => onViewChange('customers')}
            className="bg-violet-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            Nuevo Cliente
          </button>
          <button 
            onClick={() => onViewChange('reports')}
            className="bg-orange-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-orange-700 transition-colors"
          >
            Ver Reportes
          </button>
        </div>
      </div>
    </div>
  );
}