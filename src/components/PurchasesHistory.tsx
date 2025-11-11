import { useState } from 'react';
// Utilidad para convertir cualquier valor de fecha Firestore/JS a Date válido
function getValidDate(date: any): Date | null {
  if (!date) return null;
  if (typeof date.toDate === 'function') return date.toDate();
  // Para fechas ISO string (como las de purchases)
  if (typeof date === 'string') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}
import { usePaginatedPurchases } from '../hooks/usePaginatedPurchases';
import { usePurchasesStats } from '../hooks/usePurchasesStats';
import { usePurchaseReturns } from '../hooks/usePurchaseReturns';
import { 
  History, 
  Search, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Eye, 
  Download,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  CalendarRange,
  X,
  ShoppingCart,
  FileText,
  Loader2,
  RotateCcw,
  AlertTriangle,
  Plus,
  Minus
} from 'lucide-react';
import { Purchase, PurchaseReturnItem } from '../types';
import { formatCurrency, formatNumber, formatCurrencyForExport } from '../utils/currency';

export function PurchasesHistory() {
  // Filtros y estado UI
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [sortBy, setSortBy] = useState<'date' | 'totalCost' | 'totalItems'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showReturnsOnly, setShowReturnsOnly] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItems, setReturnItems] = useState<PurchaseReturnItem[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const itemsPerPage = 10;

  // Hooks
  const {
    purchases: paginatedPurchases,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage,
    refetch
  } = usePaginatedPurchases({
    searchTerm,
    dateFilter,
    customDateRange,
    sortBy,
    sortOrder,
    itemsPerPage
  });

  // Override purchases data if custom filter is selected but dates are incomplete
  const finalPaginatedPurchases = (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate)) 
    ? [] 
    : paginatedPurchases;

  // Hook de totales globales según filtros (sin paginación)
  const stats = usePurchasesStats({
    searchTerm,
    dateFilter,
    customDateRange
  });

  // Hook de devoluciones
  const {
    createReturn,
    validateReturnItems,
    getReturnableQuantity,
    getTotalReturned,
    getNetCost,
    loading: returnsLoading,
    error: returnsError
  } = usePurchaseReturns();

  const handleSort = (field: 'date' | 'totalCost' | 'totalItems') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    refetch();
  };

  const handleDateFilterChange = (value: string) => {
    setDateFilter(value);
    // Clear custom date range si no es custom, o si es custom pero queremos empezar limpio
    if (value !== 'custom') {
      setCustomDateRange({ startDate: '', endDate: '' });
    } else {
      // When switching TO custom, also clear the date range to start fresh
      setCustomDateRange({ startDate: '', endDate: '' });
    }
    setPage(1);
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const newRange = { ...customDateRange, [field]: value };
    
    // Validar que el rango no sea mayor a 1 año
    if (newRange.startDate && newRange.endDate) {
      const startDate = parseLocalDate(newRange.startDate);
      const endDate = parseLocalDate(newRange.endDate);
      const diffInTime = endDate.getTime() - startDate.getTime();
      const diffInDays = diffInTime / (1000 * 3600 * 24);
      
      if (diffInDays > 365) {
        // Si el rango es mayor a 1 año, ajustar la fecha de inicio
        if (field === 'endDate') {
          const maxStartDate = new Date(endDate);
          maxStartDate.setFullYear(maxStartDate.getFullYear() - 1);
          newRange.startDate = maxStartDate.toISOString().split('T')[0];
        } else {
          const maxEndDate = new Date(startDate);
          maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
          newRange.endDate = maxEndDate.toISOString().split('T')[0];
        }
      }
    }
    
    setCustomDateRange(newRange);
    setPage(1);
  };

  const clearCustomDateRange = () => {
    setCustomDateRange({ startDate: '', endDate: '' });
    setDateFilter('today');
    setPage(1);
  };

  // Corrige fechas tipo 'YYYY-MM-DD' para zona local
  function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  
  const getDateRangeText = () => {
    if (dateFilter === 'custom' && (customDateRange.startDate || customDateRange.endDate)) {
      const start = customDateRange.startDate ? parseLocalDate(customDateRange.startDate).toLocaleDateString() : 'Inicio';
      const end = customDateRange.endDate ? parseLocalDate(customDateRange.endDate).toLocaleDateString() : 'Fin';
      return `${start} - ${end}`;
    }
    return '';
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'ID Compra', 'Productos', 'Costo Total', 'Total Items', 'Notas'];
    const csvData = finalPaginatedPurchases.map(purchase => [
      new Date(purchase.createdAt).toLocaleDateString(),
      purchase.id,
      purchase.items.map(item => `${formatNumber(item.quantity)}x ${item.productName}`).join('; '),
      formatCurrencyForExport(purchase.totalCost ?? 0),
      formatNumber(purchase.totalItems ?? 0),
      purchase.notes || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `historial-compras-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Funciones de devoluciones
  const openReturnModal = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setShowReturnModal(true);
    
    // Inicializar items de devolución con cantidades en 0
    const initialReturnItems: PurchaseReturnItem[] = purchase.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      returnedQuantity: 0,
      originalQuantity: item.quantity,
      purchasePrice: item.purchasePrice,
      totalRefund: 0,
      reason: ''
    }));
    
    setReturnItems(initialReturnItems);
    setReturnReason('');
    setReturnNotes('');
  };

  const closeReturnModal = () => {
    setShowReturnModal(false);
    setSelectedPurchase(null);
    setReturnItems([]);
    setReturnReason('');
    setReturnNotes('');
  };

  const updateReturnQuantity = (productId: string, quantity: number) => {
    if (!selectedPurchase) return;
    
    const maxReturnable = getReturnableQuantity(selectedPurchase, productId);
    const validQuantity = Math.max(0, Math.min(quantity, maxReturnable));
    
    setReturnItems(prev => prev.map(item => 
      item.productId === productId 
        ? {
            ...item,
            returnedQuantity: validQuantity,
            totalRefund: validQuantity * item.purchasePrice
          }
        : item
    ));
  };

  const updateReturnReason = (productId: string, reason: string) => {
    setReturnItems(prev => prev.map(item => 
      item.productId === productId 
        ? { ...item, reason }
        : item
    ));
  };

  const processReturn = async () => {
    if (!selectedPurchase) return;
    
    // Filtrar solo los items con cantidad > 0
    const itemsToReturn = returnItems.filter(item => item.returnedQuantity > 0);
    
    if (itemsToReturn.length === 0) {
      setNotification({
        show: true,
        type: 'error',
        title: 'Error',
        message: 'Debe seleccionar al menos un producto para devolver'
      });
      return;
    }

    // Validar items
    const validation = validateReturnItems(selectedPurchase, itemsToReturn);
    if (!validation.isValid) {
      setNotification({
        show: true,
        type: 'error',
        title: 'Error de validación',
        message: validation.errors.join(', ')
      });
      return;
    }

    // Procesar devolución
    const result = await createReturn(selectedPurchase, itemsToReturn, returnReason, returnNotes);
    
    if (result.success) {
      setNotification({
        show: true,
        type: 'success',
        title: 'Devolución procesada',
        message: `Se ha registrado la devolución correctamente. Total: ${formatCurrency(itemsToReturn.reduce((sum, item) => sum + item.totalRefund, 0))}`
      });
      
      closeReturnModal();
      refetch(); // Actualizar la lista de compras
      
      // Auto-hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } else {
      setNotification({
        show: true,
        type: 'error',
        title: 'Error al procesar devolución',
        message: result.error || 'Ocurrió un error inesperado'
      });
    }
  };

  const hasReturns = (purchase: Purchase): boolean => {
    return (purchase.returns && purchase.returns.length > 0) || false;
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="text-red-600 mb-4">
          <BarChart3 className="w-12 h-12 mx-auto mb-4" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error al cargar el historial</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notificaciones */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm w-full ${
          notification.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        } border rounded-lg shadow-lg p-4`}>
          <div className="flex items-start">
            <div className={`flex-shrink-0 ${
              notification.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
              {notification.type === 'success' ? (
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                </div>
              ) : (
                <X className="w-5 h-5" />
              )}
            </div>
            <div className="ml-3 flex-1">
              <h4 className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {notification.title}
              </h4>
              <p className={`text-sm mt-1 ${
                notification.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className={`ml-3 flex-shrink-0 ${
                notification.type === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 pt-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Compras</h1>
            <p className="text-gray-500 mt-1">Administra el historial y análisis de transacciones de compras</p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={finalPaginatedPurchases.length === 0}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
              <DollarSign className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
              Total Compras
            </p>
            <p className="text-base font-bold text-gray-900 group-hover:text-purple-900 transition-colors duration-300">
              {stats.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
              ) : (
                formatCurrency(stats.totalPurchases)
              )}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
              <Package className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
              Total Items
            </p>
            <p className="text-base font-bold text-gray-900 group-hover:text-blue-900 transition-colors duration-300">
              {stats.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
              ) : (
                formatNumber(stats.totalItems)
              )}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
              <TrendingUp className="w-3 h-3 text-green-600 group-hover:text-green-700" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
              Compra Promedio
            </p>
            <p className="text-base font-bold text-gray-900 group-hover:text-green-900 transition-colors duration-300">
              {stats.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
              ) : (
                formatCurrency(stats.averagePurchase)
              )}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
              <BarChart3 className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
            </div>
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
              Transacciones
            </p>
            <p className="text-base font-bold text-gray-900 group-hover:text-orange-900 transition-colors duration-300">
              {stats.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
              ) : (
                formatNumber(stats.purchaseCount)
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por ID, producto o notas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filtro de fecha */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={dateFilter}
              onChange={(e) => handleDateFilterChange(e.target.value)}
              className="pl-10 pr-8 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="today">Hoy</option>
              <option value="week">Última semana</option>
              <option value="month">Último mes</option>
              <option value="3months">Últimos 3 meses</option>
              <option value="6months">Últimos 6 meses</option>
              <option value="year">Últimos 12 meses</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {/* Fechas personalizadas */}
          {dateFilter === 'custom' && (
            <>
              <div className="relative">
                <CalendarRange className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                  max={customDateRange.endDate || new Date().toISOString().split('T')[0]}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  title="Fecha de inicio (máximo 1 año de rango)"
                />
              </div>
              <div className="relative">
                <CalendarRange className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                  min={customDateRange.startDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  title="Fecha de fin (máximo 1 año de rango)"
                />
              </div>
            </>
          )}
        </div>

        {/* Mostrar rango de fechas personalizado */}
        {dateFilter === 'custom' && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              {getDateRangeText() && (
                <span className="text-sm text-gray-600">
                  Rango seleccionado: {getDateRangeText()}
                </span>
              )}
              {getDateRangeText() && (
                <button
                  onClick={clearCustomDateRange}
                  className="text-sm text-red-600 hover:text-red-700 flex items-center space-x-1"
                >
                  <X className="w-4 h-4" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>📅 Nota:</strong> Por rendimiento, el rango personalizado está limitado a un máximo de 1 año.
              </p>
            </div>
          </div>
        )}

        {/* Filtro adicional para compras con devoluciones */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showReturnsOnly}
                  onChange={(e) => setShowReturnsOnly(e.target.checked)}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 focus:ring-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Solo mostrar compras con devoluciones
                </span>
              </label>
              {showReturnsOnly && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Filtro activo
                </span>
              )}
            </div>
            
            {/* Contador de compras con devoluciones */}
            <div className="text-sm text-gray-600">
              {finalPaginatedPurchases.filter(p => hasReturns(p)).length} de {finalPaginatedPurchases.length} compras tienen devoluciones
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de compras */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full w-full table-fixed divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>Fecha</span>
                    {sortBy === 'date' && (
                      sortOrder === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center space-x-1">
                    <FileText className="w-4 h-4" />
                    <span>ID</span>
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center space-x-1">
                    <Package className="w-4 h-4" />
                    <span>Productos</span>
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalCost')}
                >
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Costo Total</span>
                    {sortBy === 'totalCost' && (
                      sortOrder === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalItems')}
                >
                  <div className="flex items-center space-x-1">
                    <ShoppingCart className="w-4 h-4" />
                    <span>Items</span>
                    {sortBy === 'totalItems' && (
                      sortOrder === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span>Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span className="text-gray-600">Cargando compras...</span>
                    </div>
                  </td>
                </tr>
              ) : finalPaginatedPurchases.filter(purchase => !showReturnsOnly || hasReturns(purchase)).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      {showReturnsOnly ? (
                        <>
                          <RotateCcw className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                          <p className="text-lg font-medium mb-2">No hay compras con devoluciones</p>
                          <p className="text-sm">No se encontraron compras con devoluciones en el período seleccionado.</p>
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                          <p className="text-lg font-medium mb-2">No hay compras registradas</p>
                          <p className="text-sm">No se encontraron compras con los filtros aplicados.</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                finalPaginatedPurchases
                  .filter(purchase => !showReturnsOnly || hasReturns(purchase))
                  .map((purchase) => {
                  const purchaseDate = getValidDate(purchase.createdAt);
                  const purchaseHasReturns = hasReturns(purchase);
                  const totalReturned = purchaseHasReturns ? getTotalReturned(purchase) : 0;
                  const netCost = purchaseHasReturns ? getNetCost(purchase) : purchase.totalCost || 0;
                  
                  return (
                    <tr 
                      key={purchase.id} 
                      className={`${
                        purchaseHasReturns 
                          ? 'bg-red-50 border-l-4 border-red-400 hover:bg-red-100' 
                          : 'hover:bg-gray-50'
                      } transition-colors`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center space-x-2">
                          <span>{purchaseDate ? purchaseDate.toLocaleDateString() : 'Fecha inválida'}</span>
                          {purchaseHasReturns && (
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center space-x-2">
                          <span>{purchase.id.slice(0, 8)}...</span>
                          {purchaseHasReturns && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Devuelto
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs">
                          <div className="flex items-start space-x-2">
                            {purchaseHasReturns && (
                              <div className="flex-shrink-0 mt-0.5" title="Esta compra tiene devoluciones">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                              </div>
                            )}
                            <div className="flex-1">
                              {purchase.items.slice(0, 2).map((item, index) => (
                                <div key={index} className="flex justify-between">
                                  <span className="truncate">{formatNumber(item.quantity)}x {item.productName}</span>
                                </div>
                              ))}
                              {purchase.items.length > 2 && (
                                <div className="text-gray-500 text-xs">
                                  +{purchase.items.length - 2} más...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={purchaseHasReturns ? 'text-gray-500 line-through' : 'text-gray-900'}>
                              {formatCurrency(purchase.totalCost || 0)}
                            </span>
                            {purchaseHasReturns && (
                              <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                Original
                              </span>
                            )}
                          </div>
                          {purchaseHasReturns && (
                            <div className="flex items-center space-x-2">
                              <span className="text-red-600 font-medium">
                                -{formatCurrency(totalReturned)}
                              </span>
                              <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                Devuelto
                              </span>
                            </div>
                          )}
                          {purchaseHasReturns && (
                            <div className="flex items-center space-x-2">
                              <span className="text-green-600 font-bold">
                                {formatCurrency(netCost)}
                              </span>
                              <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                                Neto
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center space-x-2">
                          <span>{formatNumber(purchase.totalItems || 0)}</span>
                          {purchaseHasReturns && (
                            <div className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              Con devoluciones
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedPurchase(purchase)}
                            className="text-blue-600 hover:text-blue-900 font-medium flex items-center space-x-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Ver</span>
                          </button>
                          {!purchaseHasReturns && (
                            <button
                              onClick={() => openReturnModal(purchase)}
                              className="text-orange-600 hover:text-orange-900 font-medium flex items-center space-x-1"
                              title="Registrar devolución"
                            >
                              <RotateCcw className="w-4 h-4" />
                              <span>Devolver</span>
                            </button>
                          )}
                          {purchaseHasReturns && (
                            <div className="flex items-center space-x-1 text-red-600 bg-red-100 px-2 py-1 rounded-full">
                              <RotateCcw className="w-3 h-3" />
                              <span className="text-xs font-medium">Procesado</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!loading && finalPaginatedPurchases.filter(purchase => !showReturnsOnly || hasReturns(purchase)).length > 0 && (
          <div className="bg-white px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Página {currentPage} - Mostrando {finalPaginatedPurchases.filter(purchase => !showReturnsOnly || hasReturns(purchase)).length} compras
              {showReturnsOnly && (
                <span className="text-red-600 ml-2">(solo con devoluciones)</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={prevPage}
                disabled={!hasPrevPage}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-500">
                {currentPage}
              </span>
              <button
                onClick={nextPage}
                disabled={!hasNextPage}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalles de compra */}
      {selectedPurchase && !showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Detalles de Compra</h3>
                <div className="flex items-center space-x-2">
                  {!hasReturns(selectedPurchase) && (
                    <button
                      onClick={() => openReturnModal(selectedPurchase)}
                      className="flex items-center space-x-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Procesar Devolución</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedPurchase(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Información General</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">ID:</span>
                      <span className="font-medium">{selectedPurchase.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fecha:</span>
                      <span className="font-medium">
                        {getValidDate(selectedPurchase.createdAt)?.toLocaleString() || 'Fecha inválida'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Items:</span>
                      <span className="font-medium">{formatNumber(selectedPurchase.totalItems || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Costo Total:</span>
                      <span className="font-medium text-purple-600">
                        {formatCurrency(selectedPurchase.totalCost || 0)}
                      </span>
                    </div>
                    {hasReturns(selectedPurchase) && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total Devuelto:</span>
                          <span className="font-medium text-red-600">
                            -{formatCurrency(getTotalReturned(selectedPurchase))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Costo Neto:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(getNetCost(selectedPurchase))}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectedPurchase.notes && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Notas</h4>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      {selectedPurchase.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-4">Productos Comprados</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Producto
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Cantidad
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Precio Unitario
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Total
                        </th>
                        {hasReturns(selectedPurchase) && (
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Devuelto
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedPurchase.items.map((item, index) => {
                        const totalReturned = (selectedPurchase.returns || []).reduce((sum, ret) => {
                          const returnedItem = ret.items.find(rItem => rItem.productId === item.productId);
                          return sum + (returnedItem?.returnedQuantity || 0);
                        }, 0);
                        
                        return (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {item.productName}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatNumber(item.quantity)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatCurrency(item.purchasePrice)}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {formatCurrency(item.totalCost)}
                            </td>
                            {hasReturns(selectedPurchase) && (
                              <td className="px-4 py-2 text-sm text-red-600">
                                {totalReturned > 0 ? formatNumber(totalReturned) : '-'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historial de devoluciones */}
              {hasReturns(selectedPurchase) && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-4">Historial de Devoluciones</h4>
                  <div className="space-y-4">
                    {selectedPurchase.returns?.map((returnRecord, index) => (
                      <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-sm font-medium text-red-800">
                              Devolución #{index + 1}
                            </span>
                            <span className="text-xs text-red-600 ml-2">
                              {new Date(returnRecord.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-red-800">
                            {formatCurrency(returnRecord.totalRefund)}
                          </span>
                        </div>
                        
                        {returnRecord.reason && (
                          <p className="text-sm text-red-700 mb-2">
                            <strong>Motivo:</strong> {returnRecord.reason}
                          </p>
                        )}
                        
                        <div className="space-y-1">
                          {returnRecord.items.map((item, itemIndex) => (
                            <div key={itemIndex} className="text-sm text-red-700">
                              • {formatNumber(item.returnedQuantity)}x {item.productName} 
                              ({formatCurrency(item.totalRefund)})
                              {item.reason && <span className="text-red-600"> - {item.reason}</span>}
                            </div>
                          ))}
                        </div>
                        
                        {returnRecord.notes && (
                          <p className="text-xs text-red-600 mt-2 italic">
                            Notas: {returnRecord.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedPurchase(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de devolución */}
      {showReturnModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Procesar Devolución</h3>
                  <p className="text-sm text-gray-600">
                    Compra del {getValidDate(selectedPurchase.createdAt)?.toLocaleDateString()} - 
                    ID: {selectedPurchase.id.slice(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={closeReturnModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {returnsError && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
                    <span className="text-red-800">{returnsError}</span>
                  </div>
                </div>
              )}

              {/* Información de devolución */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Motivo General (Opcional)
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Ej: Producto defectuoso, cambio de proveedor..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas Adicionales (Opcional)
                  </label>
                  <input
                    type="text"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Notas adicionales..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Productos a devolver */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-4">Productos a Devolver</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Producto
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Comprado
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Disponible
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Cantidad a Devolver
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Precio Unit.
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Reembolso
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Motivo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {returnItems.map((item, index) => {
                        const maxReturnable = getReturnableQuantity(selectedPurchase, item.productId);
                        
                        return (
                          <tr key={index} className={item.returnedQuantity > 0 ? 'bg-orange-50' : ''}>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {item.productName}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatNumber(item.originalQuantity)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatNumber(maxReturnable)}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => updateReturnQuantity(item.productId, item.returnedQuantity - 1)}
                                  disabled={item.returnedQuantity <= 0}
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="min-w-[60px] text-center text-sm font-medium">
                                  {formatNumber(item.returnedQuantity)}
                                </span>
                                <button
                                  onClick={() => updateReturnQuantity(item.productId, item.returnedQuantity + 1)}
                                  disabled={item.returnedQuantity >= maxReturnable}
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 text-gray-600 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {formatCurrency(item.purchasePrice)}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-orange-600">
                              {formatCurrency(item.totalRefund)}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={item.reason || ''}
                                onChange={(e) => updateReturnReason(item.productId, e.target.value)}
                                placeholder="Motivo específico..."
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                                disabled={item.returnedQuantity === 0}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resumen de devolución */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm font-medium text-orange-800">
                      Total a Devolver:
                    </span>
                    <span className="ml-2 text-lg font-bold text-orange-600">
                      {formatCurrency(returnItems.reduce((sum, item) => sum + item.totalRefund, 0))}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-orange-800">
                      Items Seleccionados:
                    </span>
                    <span className="ml-2 text-lg font-bold text-orange-600">
                      {returnItems.filter(item => item.returnedQuantity > 0).length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={closeReturnModal}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={processReturn}
                  disabled={returnsLoading || returnItems.filter(item => item.returnedQuantity > 0).length === 0}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {returnsLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <RotateCcw className="w-4 h-4" />
                  <span>Procesar Devolución</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
