import React, { useState, useMemo } from 'react';
// Utilidad para convertir cualquier valor de fecha Firestore/JS a Date válido
function getValidDate(date: any): Date | null {
  if (!date) return null;
  if (typeof date.toDate === 'function') return date.toDate();
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}
import { usePaginatedSales } from '../hooks/usePaginatedSales';
import { useSalesStats } from '../hooks/useSalesStats';
import { useCellphoneSalesStats } from '../hooks/useCellphoneSalesStats';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { processProductReturn, deleteSale } from '../store/thunks/salesThunks';
import { fetchCustomers } from '../store/thunks/customersThunks';
import { customersService } from '../services/firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirebase } from '../contexts/FirebaseContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppUser } from '../types';
import {
  History,
  Search,
  Calendar,
  DollarSign,
  TrendingUp,
  Eye,
  Download,
  Package,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  CalendarRange,
  X,
  Percent,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Banknote,
  Smartphone,
  CreditCard,
  Gift
} from 'lucide-react';
// ...existing code...
import { Sale, Customer } from '../types';
import { formatCurrency, formatCurrencyForExport } from '../utils/currency';
import { Receipt } from 'lucide-react';
import { InvoiceModal } from './Sales'; // Importar el modal de factura correctamente

export function SalesHistory() {
  // Filtros y estado UI
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [timeRange, setTimeRange] = useState({ startTime: '', endTime: '' });
  const [enableTimeFilter, setEnableTimeFilter] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'general' | 'cellphones'>('general');
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'profit'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [returnModal, setReturnModal] = useState<{
    show: boolean;
    saleId: string;
    productId: string;
    productName: string;
    productSalePrice: number;
    maxQuantity: number;
    quantity: number;
    selectedCustomerId: string;
    customerSearch: string;
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean;
    saleId: string;
    saleData: Sale;
  } | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AppUser[]>([]);
  const itemsPerPage = 10;

  // Stabilize timeRange object to avoid unnecessary re-renders
  const stabilizedTimeRange = useMemo(() => {
    return enableTimeFilter ? timeRange : { startTime: '', endTime: '' };
  }, [enableTimeFilter, timeRange.startTime, timeRange.endTime]);

  // Redux and Auth
  const dispatch = useAppDispatch();
  const customers = useAppSelector(state => state.firebase.customers.items);
  const customersLoading = useAppSelector(state => state.firebase.customers.loading);
  const { appUser } = useAuth();
  const firebase = useFirebase();

  // Load customers if not already loaded
  React.useEffect(() => {
    if (customers.length === 0 && !customersLoading) {
      dispatch(fetchCustomers());
    }
  }, [dispatch, customers.length, customersLoading]);

  // Load available users
  React.useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const usersData = snapshot.docs.map(doc => ({
          ...doc.data(),
          uid: doc.data().uid || doc.id
        })) as AppUser[];
        setAvailableUsers(usersData);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };

    loadUsers();
  }, []);

  // Función para mostrar notificaciones
  const showNotification = (type: 'success' | 'error', title: string, message: string) => {
    setNotification({ show: true, type, title, message });
    // Auto-ocultar después de 4 segundos
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Hook paginado (ventas de la página actual)
  const {
    sales: paginatedSales,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage,
    refetch
  } = usePaginatedSales({
    searchTerm,
    dateFilter,
    customDateRange,
    timeRange: stabilizedTimeRange,
    paymentMethodFilter,
    salesPersonFilter,
    sortBy,
    sortOrder,
    itemsPerPage,
    useFreshData: firebase.needsFreshSalesData // Usar datos frescos si se invalidó el caché
  });

  // Override sales data if custom filter is selected but dates are incomplete
  const finalPaginatedSales = (dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate))
    ? []
    : paginatedSales;

  // Marcar datos como leídos después de cargar
  React.useEffect(() => {
    if (!loading && firebase.needsFreshSalesData) {
      firebase.markSalesDataAsRead();
    }
  }, [loading, firebase]);

  // Hook de totales globales según filtros (sin paginación)
  const {
    refetch: refetchStats,
    filteredSales,
    ...stats
  } = useSalesStats({
    searchTerm,
    dateFilter,
    customDateRange,
    timeRange: stabilizedTimeRange,
    paymentMethodFilter,
    salesPersonFilter
  });

  // Hook de estadísticas específicas de celulares
  const cellphoneStats = useCellphoneSalesStats({
    searchTerm,
    dateFilter,
    customDateRange,
    timeRange: stabilizedTimeRange,
    paymentMethodFilter,
    salesPersonFilter
  });

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

  // Calcular ventas por método de pago usando todas las ventas filtradas (no paginadas)
  const paymentMethodTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    
    if (!filteredSales || !Array.isArray(filteredSales)) return totals;
    
    filteredSales.forEach((sale: any) => {
      const saleTotal = sale.finalTotal || sale.total || 0;
      
      if (Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0) {
        // Ventas con múltiples métodos de pago
        sale.paymentMethods.forEach((payment: any) => {
          const method = payment.method || 'efectivo';
          totals[method] = (totals[method] || 0) + payment.amount;
        });
      } else {
        // Ventas con método de pago único (compatibilidad)
        const method = sale.paymentMethod || 'efectivo';
        totals[method] = (totals[method] || 0) + saleTotal;
      }
    });
    
    return totals;
  }, [filteredSales]);

  const handleSort = (field: 'date' | 'total' | 'profit') => {
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
    
    // Clear time filter if switching to a date filter that doesn't support it
    if (value !== 'today' && value !== 'custom') {
      setEnableTimeFilter(false);
      setTimeRange({ startTime: '', endTime: '' });
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
    setTimeRange({ startTime: '', endTime: '' });
    setEnableTimeFilter(false);
    setDateFilter('today');
    setPage(1);
  };

  const handleProductReturn = (saleId: string, productId: string, productName: string, maxQuantity: number, productSalePrice: number = 0) => {
    setReturnModal({
      show: true,
      saleId,
      productId,
      productName,
      productSalePrice,
      maxQuantity,
      quantity: 1,
      selectedCustomerId: '',
      customerSearch: ''
    });
  };

  const handleDeleteSale = (sale: Sale) => {
    setDeleteModal({
      show: true,
      saleId: sale.id,
      saleData: sale
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;

    setIsProcessing(true);
    try {
      // Si es abono a plan separe, eliminar también el pago en el plan separe
      if (deleteModal?.saleData?.isLayaway && deleteModal?.saleData?.layawayId) {
        try {
          // Buscar el plan separe y el pago correspondiente
          const { layawaysService } = await import('../services/firebase/firestore');
          const allLayaways = await layawaysService.getAll();
          const layaway = allLayaways.find(l => l.id === deleteModal.saleData.layawayId);
          if (layaway) {
            // Buscar el pago por monto y fecha aproximada
            const abonoPayment = layaway.payments.find(p => p.amount === deleteModal.saleData.total);
            if (abonoPayment) {
              // Eliminar el pago usando la lógica del plan separe
              // Si tienes una función pública para cancelar pago, úsala aquí
              // Si no, elimina el pago y actualiza el plan separe
              const updatedPayments = layaway.payments.filter(p => p.id !== abonoPayment.id);
              const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
              const newRemainingBalance = layaway.totalAmount - totalPaid;
              let newStatus = layaway.status;
              let updatedItems = layaway.items;
              if (layaway.status === 'completed' && newRemainingBalance > 0) {
                newStatus = 'active';
                updatedItems = layaway.items.map(item => {
                  const manualPickupHistory = item.pickedUpHistory?.filter(
                    pickup => pickup.notes !== 'Marcado automáticamente como recogido al completar el pago'
                  ) || [];
                  const manualPickedUpQuantity = manualPickupHistory.reduce(
                    (sum, pickup) => sum + pickup.quantity, 0
                  );
                  return {
                    ...item,
                    pickedUpQuantity: manualPickedUpQuantity,
                    pickedUpHistory: manualPickupHistory
                  };
                });
              }
              const updateData: any = {
                payments: updatedPayments,
                remainingBalance: newRemainingBalance,
                status: newStatus
              };
              if (newStatus === 'active' && layaway.status === 'completed') {
                updateData.items = updatedItems;
              }
              await layawaysService.update(layaway.id, updateData);
            }
          }
        } catch (err) {
          // Si falla, solo mostrar error en consola
          console.error('Error eliminando abono en plan separe:', err);
        }
      }
      await dispatch(deleteSale(deleteModal.saleId)).unwrap();
      // Cerrar modal de detalles si está abierto
      if (selectedSale && selectedSale.id === deleteModal.saleId) {
        setSelectedSale(null);
      }
      // Refrescar la lista de ventas y las estadísticas
      refetch();
      refetchStats();
      // Cerrar modal de eliminación
      setDeleteModal(null);
      showNotification(
        'success',
        'Venta eliminada',
        deleteModal?.saleData?.isLayaway
          ? 'El abono ha sido eliminado exitosamente del plan separe y del historial de ventas.'
          : 'La venta ha sido eliminada exitosamente. El inventario ha sido restaurado.'
      );
    } catch (error: any) {
      showNotification('error', 'Error al eliminar', error.message || 'Error desconocido al eliminar la venta');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmReturn = async () => {
    if (!returnModal) return;

    setIsProcessing(true);
    try {
      // Calculate refund amount
      const refundAmount = returnModal.productSalePrice * returnModal.quantity;
      
      // Process the product return first
      await dispatch(processProductReturn({
        saleId: returnModal.saleId,
        productId: returnModal.productId,
        returnQuantity: returnModal.quantity
      })).unwrap();

      // If a customer is selected, add the refund amount to their credit balance
      if (returnModal.selectedCustomerId) {
        const selectedCustomer = customers.find(c => c.id === returnModal.selectedCustomerId);
        if (selectedCustomer) {
          const newCreditBalance = (selectedCustomer.credit || 0) + refundAmount;
          await customersService.update(returnModal.selectedCustomerId, {
            credit: newCreditBalance
          });
          
          // Refresh customers data
          dispatch(fetchCustomers());
          
          showNotification('success', 'Producto devuelto', 
            `El producto ha sido devuelto exitosamente. Se han agregado ${formatCurrency(refundAmount)} al saldo a favor de ${selectedCustomer.name}. El inventario ha sido actualizado.`);
        } else {
          showNotification('success', 'Producto devuelto', 'El producto ha sido devuelto exitosamente. El inventario ha sido actualizado.');
        }
      } else {
        showNotification('success', 'Producto devuelto', 'El producto ha sido devuelto exitosamente. El inventario ha sido actualizado.');
      }

      // Actualizar la venta seleccionada si está abierta
      if (selectedSale && selectedSale.id === returnModal.saleId) {
        // Cerrar el modal de detalles para que se actualice cuando se vuelva a abrir
        setSelectedSale(null);
      }

      // Refrescar la lista de ventas y las estadísticas
      refetch();
      refetchStats();
      
      // Cerrar modal de devolución
      setReturnModal(null);
      
    } catch (error: any) {
      showNotification('error', 'Error en devolución', error.message || 'Error desconocido al procesar la devolución');
    } finally {
      setIsProcessing(false);
    }
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
      
      let dateText = `${start} - ${end}`;
      
      // Add time information if enabled and both times are selected
      if (enableTimeFilter && timeRange.startTime && timeRange.endTime) {
        dateText += ` (${timeRange.startTime} - ${timeRange.endTime})`;
      }
      
      return dateText;
    }
    return '';
  };

  const getPaymentMethodText = (sale: Sale) => {
    // Si tiene métodos de pago múltiples, mostrar "Pagos múltiples: saldo a favor + [otros]"
    if (sale.paymentMethods && sale.paymentMethods.length > 1) {
      if (sale.paymentMethods.some(p => String(p.method) === 'credit')) {
        // Listar todos los métodos
        const names = sale.paymentMethods.map(p => getPaymentMethodName(p.method));
        // Separar saldo a favor y otros
        const creditNames = names.filter(n => n === 'Saldo a favor');
        const otherNames = names.filter(n => n !== 'Saldo a favor');
        return `Pagos múltiples: ${creditNames.join(' + ')}${otherNames.length > 0 ? ' + ' + otherNames.join(' + ') : ''}`;
      }
      // Si no hay saldo a favor pero hay varios métodos
      const names = sale.paymentMethods.map(p => getPaymentMethodName(p.method));
      return `Múltiples métodos: ${names.join(' + ')}`;
    }
    // Si tiene un solo método en paymentMethods, usar ese
    if (sale.paymentMethods && sale.paymentMethods.length === 1) {
      return getPaymentMethodName(sale.paymentMethods[0].method);
    }
    // Fallback al método tradicional
    return getPaymentMethodName(sale.paymentMethod);
  };

  const getPaymentMethodName = (method: string) => {
    switch (method) {
      case 'efectivo': return 'Efectivo';
      case 'transferencia': return 'Transferencia';
      case 'tarjeta': return 'Tarjeta';
      case 'crédito': return 'Crédito';
      case 'credit': return 'Saldo a favor';
      default: return method;
    }
  };

  const getPaymentMethodColor = (sale: Sale) => {
    // Si tiene métodos múltiples, usar un color especial
    if (sale.paymentMethods && sale.paymentMethods.length > 1) {
      return 'bg-purple-100 text-purple-800';
    }
    
    // Si tiene un solo método en paymentMethods, usar ese
    const method = sale.paymentMethods && sale.paymentMethods.length === 1 
      ? sale.paymentMethods[0].method 
      : sale.paymentMethod;
    
    switch (method) {
      case 'efectivo': return 'bg-green-100 text-green-800';
      case 'transferencia': return 'bg-purple-100 text-purple-800';
      case 'tarjeta': return 'bg-blue-100 text-blue-800';
      case 'crédito': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const exportToCSV = () => {
    const headers = ['Fecha', 'ID Venta', 'Productos', 'Subtotal', 'Descuento', 'Total', 'Costo', 'Ganancia', 'Margen %', 'Método de Pago', 'Vendedor'];
    const csvData = finalPaginatedSales.map(sale => {
      // Si es abono a plan separe, mostrar "Abono a plan separe" y calcular ganancia/rentabilidad como en el modal
      if (sale.isLayaway) {
        const abono = sale.total ?? 0;
        const costo = sale.totalCost ?? 0;
        const ganancia = abono - costo;
        const rentabilidad = costo > 0 ? (ganancia / costo) * 100 : 0;
        return [
          new Date(sale.createdAt).toLocaleDateString(),
          sale.id,
          sale.type === 'layaway_payment' ? 'Abono a plan separe' : 
          sale.type === 'technical_service_payment' ? 'Pago servicio técnico' : 'Entrega de plan separe',
          formatCurrencyForExport(sale.subtotal ?? 0),
          formatCurrencyForExport(sale.discount ?? 0),
          formatCurrencyForExport(sale.total ?? 0),
          formatCurrencyForExport(sale.totalCost ?? 0),
          formatCurrencyForExport(ganancia),
          rentabilidad.toFixed(1),
          getPaymentMethodText(sale),
          sale.salesPersonName || 'N/A'
        ];
      }
      // Venta normal
      return [
        new Date(sale.createdAt).toLocaleDateString(),
        sale.id,
        sale.items.map(item => `${item.quantity}x ${item.productName}`).join('; '),
        formatCurrencyForExport(sale.subtotal ?? 0),
        formatCurrencyForExport(sale.discount ?? 0),
        formatCurrencyForExport(sale.total ?? 0),
        formatCurrencyForExport(sale.totalCost ?? 0),
        formatCurrencyForExport(sale.totalProfit ?? 0),
        (sale.profitMargin ?? 0).toFixed(1),
        getPaymentMethodText(sale),
        sale.salesPersonName || 'N/A'
      ];
    });
    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historial-ventas-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="space-y-1">
      {/* Encabezado */}
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Ventas</h1>
            <p className="text-gray-600 mt-1">Consulta y analiza todas las transacciones realizadas</p>
          </div>
          <button
            onClick={exportToCSV}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <Download className="h-5 w-5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>


      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-6 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📊 Estadísticas Generales
          </button>
          <button
            onClick={() => setActiveTab('cellphones')}
            className={`px-6 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'cellphones'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            📱 Ventas de Celulares
          </button>
        </nav>
      </div>

      {activeTab === 'general' && (
        <>
          {/* Estadísticas Generales */}
          <div className="rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                📊 Estadísticas Generales
              </h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                Mismo período
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                    <BarChart3 className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Transacciones</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">{stats.transactionCount}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                    <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Ventas Totales</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">{formatCurrency(stats.totalSales)}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
                    <Percent className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Descuentos</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-orange-900 transition-colors duration-300">{formatCurrency(stats.totalDiscounts)}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
                    <TrendingUp className="w-3 h-3 text-green-600 group-hover:text-green-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Ganancia Total</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">{formatCurrency(stats.totalProfit)}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-red-500/10 hover:-translate-y-0.5 hover:border-red-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-red-50 rounded flex items-center justify-center group-hover:bg-red-100 group-hover:scale-110 transition-all duration-300">
                    <Package className="w-3 h-3 text-red-600 group-hover:text-red-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Costo Total</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-red-900 transition-colors duration-300">{formatCurrency(stats.totalCost)}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                    <User className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Promedio/Venta</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">{formatCurrency(stats.averageTransaction)}</p>
                </div>
              </div>
              
              <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5 hover:border-indigo-300 transition-all duration-300 ease-out">
                <div className="text-center">
                  <div className="w-5 h-5 mx-auto mb-1 bg-indigo-50 rounded flex items-center justify-center group-hover:bg-indigo-100 group-hover:scale-110 transition-all duration-300">
                    <BarChart3 className="w-3 h-3 text-indigo-600 group-hover:text-indigo-700" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Margen Promedio</p>
                  <p className="text-base font-bold text-slate-900 group-hover:text-indigo-900 transition-colors duration-300">{stats.profitMargin.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

      {/* Desglose por Método de Pago */}
      {Object.keys(paymentMethodTotals).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              💳 Ingresos por Método de Pago
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                Período filtrado
              </span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Desglose exacto de ingresos reales por cada método de pago
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(paymentMethodTotals)
                .sort(([,a], [,b]) => b - a) // Ordenar por monto descendente
                .map(([method, amount]) => {
                  const paymentInfo = getPaymentMethodInfo(method);
                  const PaymentIcon = paymentInfo.icon;
                  return (
                    <div key={method} className="flex items-center p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
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

      {/* Filtros */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por producto, cliente o ID de venta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={dateFilter}
                onChange={(e) => handleDateFilterChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-sm"
              >
                <option value="today">Hoy</option>
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
                <option value="3months">Últimos 3 meses</option>
                <option value="6months">Últimos 6 meses</option>
                <option value="year">Últimos 12 meses</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </div>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="crédito">Crédito</option>
            </select>
            <select
              value={salesPersonFilter}
              onChange={(e) => setSalesPersonFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Vendedores</option>
              {availableUsers.map(user => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName || user.email}
                </option>
              ))}
            </select>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field as 'date' | 'total' | 'profit');
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="date-desc">Más recientes</option>
              <option value="date-asc">Más antiguos</option>
              <option value="total-desc">Mayor monto</option>
              <option value="total-asc">Menor monto</option>
              <option value="profit-desc">Mayor ganancia</option>
              <option value="profit-asc">Menor ganancia</option>
            </select>
          </div>
          {/* Time filter section - Only available for 'today' and 'custom' date filters */}
          {(dateFilter === 'today' || dateFilter === 'custom') && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="enable-time-filter"
                  checked={enableTimeFilter}
                  onChange={(e) => {
                    setEnableTimeFilter(e.target.checked);
                    if (!e.target.checked) {
                      setTimeRange({ startTime: '', endTime: '' });
                    }
                  }}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                />
                <label htmlFor="enable-time-filter" className="text-sm font-medium text-gray-700">
                  Filtrar por horas específicas
                </label>
              </div>
              
              {enableTimeFilter && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 text-sm font-medium text-blue-800">
                      Hora de Inicio:
                    </label>
                    <div className="flex">
                      <select 
                        value={timeRange.startTime ? timeRange.startTime.split(':')[0] : ''}
                        onChange={(e) => {
                          const hour = e.target.value;
                          const minute = timeRange.startTime ? timeRange.startTime.split(':')[1] : '00';
                          const newTime = hour ? `${hour}:${minute}` : '';
                          
                          if (timeRange.endTime && newTime > timeRange.endTime) {
                            setTimeRange(prev => ({ ...prev, startTime: newTime, endTime: newTime }));
                          } else {
                            setTimeRange(prev => ({ ...prev, startTime: newTime }));
                          }
                        }}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                      >
                        <option value="">Hora</option>
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i.toString().padStart(2, '0')}>
                            {i.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center px-3 bg-gray-50 border-t border-b border-gray-300">
                        <span className="text-gray-500">:</span>
                      </div>
                      <select 
                        value={timeRange.startTime ? timeRange.startTime.split(':')[1] : ''}
                        onChange={(e) => {
                          const minute = e.target.value;
                          const hour = timeRange.startTime ? timeRange.startTime.split(':')[0] : '00';
                          const newTime = minute !== '' ? `${hour}:${minute}` : '';
                          
                          if (timeRange.endTime && newTime > timeRange.endTime) {
                            setTimeRange(prev => ({ ...prev, startTime: newTime, endTime: newTime }));
                          } else {
                            setTimeRange(prev => ({ ...prev, startTime: newTime }));
                          }
                        }}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                      >
                        <option value="">Min</option>
                        {['00', '15', '30', '45'].map(minute => (
                          <option key={minute} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block mb-2 text-sm font-medium text-blue-800">
                      Hora de Fin:
                    </label>
                    <div className="flex">
                      <select 
                        value={timeRange.endTime ? timeRange.endTime.split(':')[0] : ''}
                        onChange={(e) => {
                          const hour = e.target.value;
                          const minute = timeRange.endTime ? timeRange.endTime.split(':')[1] : '00';
                          const newTime = hour ? `${hour}:${minute}` : '';
                          setTimeRange(prev => ({ ...prev, endTime: newTime }));
                        }}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                      >
                        <option value="">Hora</option>
                        {Array.from({ length: 24 }, (_, i) => {
                          const hourValue = i.toString().padStart(2, '0');
                          const isDisabled = timeRange.startTime ? hourValue < timeRange.startTime.split(':')[0] : false;
                          return (
                            <option key={i} value={hourValue} disabled={isDisabled}>
                              {hourValue}
                            </option>
                          );
                        })}
                      </select>
                      <div className="flex items-center px-3 bg-gray-50 border-t border-b border-gray-300">
                        <span className="text-gray-500">:</span>
                      </div>
                      <select 
                        value={timeRange.endTime ? timeRange.endTime.split(':')[1] : ''}
                        onChange={(e) => {
                          const minute = e.target.value;
                          const hour = timeRange.endTime ? timeRange.endTime.split(':')[0] : '00';
                          const newTime = minute !== '' ? `${hour}:${minute}` : '';
                          setTimeRange(prev => ({ ...prev, endTime: newTime }));
                        }}
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                      >
                        <option value="">Min</option>
                        {['00', '15', '30', '45'].map(minute => (
                          <option key={minute} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {dateFilter === 'custom' && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <CalendarRange className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-900">Seleccionar Rango de Fechas</span>
                </div>
                {(customDateRange.startDate || customDateRange.endDate) && (
                  <button
                    onClick={clearCustomDateRange}
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpiar
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-800 mb-1">
                      Fecha de Inicio
                    </label>
                    <input
                      type="date"
                      value={customDateRange.startDate}
                      onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                      max={customDateRange.endDate || new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      title="Fecha de inicio (máximo 1 año de rango)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-800 mb-1">
                      Fecha de Fin
                    </label>
                    <input
                      type="date"
                      value={customDateRange.endDate}
                      onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                      min={customDateRange.startDate}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      title="Fecha de fin (máximo 1 año de rango)"
                    />
                  </div>
                </div>
              </div>
              {getDateRangeText() && (
                <div className="mt-3 p-2 bg-blue-100 rounded text-sm text-blue-800">
                  <strong>Rango seleccionado:</strong> {getDateRangeText()}
                </div>
              )}
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>📅 Nota:</strong> Por rendimiento, el rango personalizado está limitado a un máximo de 1 año.
                </p>
              </div>
            </div>
          )}
          {(searchTerm || dateFilter !== 'month' || paymentMethodFilter !== 'all' || salesPersonFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">Filtros activos:</span>
              {searchTerm && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Búsqueda: "{searchTerm}"
                  <button
                    onClick={() => setSearchTerm('')}
                    className="ml-1 text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {dateFilter !== 'month' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {dateFilter === 'custom' ? `Rango: ${getDateRangeText()}` : 
                   dateFilter === 'today' ? 'Hoy' :
                   dateFilter === 'week' ? 'Última semana' :
                   dateFilter === '3months' ? 'Últimos 3 meses' :
                   dateFilter === '6months' ? 'Últimos 6 meses' :
                   dateFilter === 'year' ? 'Últimos 12 meses' : 'Personalizado'}
                  <button
                    onClick={() => handleDateFilterChange('month')}
                    className="ml-1 text-green-600 hover:text-green-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {paymentMethodFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {getPaymentMethodName(paymentMethodFilter)}
                  <button
                    onClick={() => setPaymentMethodFilter('all')}
                    className="ml-1 text-purple-600 hover:text-purple-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {salesPersonFilter !== 'all' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  Vendedor: {availableUsers.find(u => u.uid === salesPersonFilter)?.displayName || availableUsers.find(u => u.uid === salesPersonFilter)?.email || 'Desconocido'}
                  <button
                    onClick={() => setSalesPersonFilter('all')}
                    className="ml-1 text-indigo-600 hover:text-indigo-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ...el resto del código permanece igual... */}

      {/* Sales Table - Cards para móviles */}
      {loading ? (
        <div className="flex justify-center items-center py-12"><span className="text-gray-500">Cargando ventas...</span></div>
      ) : error ? (
        <div className="flex justify-center items-center py-12 text-red-600">{error}</div>
      ) : (
        <div className="grid gap-3 sm:hidden">
          {finalPaginatedSales.map((sale) => (
            <div key={sale.id} className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                  <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Venta #{sale.id.substring(0, 8)}
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
                  {formatCurrency(sale.finalTotal ?? sale.total ?? 0)}
                </p>
                
                {/* Información adicional compacta */}
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-slate-500">
                    {(() => {
                      const dateObj = getValidDate(sale.createdAt);
                      return dateObj ? dateObj.toLocaleDateString() : '-';
                    })()} • {sale.salesPersonName || 'Sin vendedor'}
                  </div>
                  
                  <div className="text-xs text-slate-600">
                    {sale.isLayaway
                      ? (sale.type === 'layaway_payment' ? 'Abono plan separe' : 'Entrega plan separe')
                      : `${sale.items.length} producto${sale.items.length !== 1 ? 's' : ''}`
                    }
                    {sale.courtesyItems && sale.courtesyItems.length > 0 && (
                      <span className="ml-1 text-cyan-600">+ {sale.courtesyItems.length} 🎁</span>
                    )}
                  </div>

                  {(() => {
                    const hasCourtesies = sale.courtesyItems && sale.courtesyItems.length > 0;
                    const realProfit = hasCourtesies ? (sale.realProfit ?? 0) : (sale.totalProfit ?? 0);
                    const realMargin = hasCourtesies
                      ? ((sale.realProfit ?? 0) / (sale.realTotalCost ?? 1) * 100)
                      : (sale.profitMargin ?? 0);
                    const isLoss = realProfit < 0;

                    return (
                      <div className="flex justify-center items-center space-x-3 text-xs">
                        <span className={`font-medium ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
                          {isLoss ? '' : '+'}{formatCurrency(realProfit)}
                        </span>
                        <span className="text-orange-600 font-medium">
                          {realMargin.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })()}
                  
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(sale)}`}>
                    {sale.paymentMethods && sale.paymentMethods.length > 1
                      ? 'Múltiples'
                      : getPaymentMethodText(sale)
                    }
                  </span>
                  
                  {/* Botones compactos */}
                  <div className="flex gap-1 justify-center mt-2">
                    <button
                      onClick={() => setSelectedSale(sale)}
                      disabled={isProcessing}
                      className="group/btn bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 px-2 py-1 rounded transition-all duration-300 ease-out text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                      title="Ver detalles"
                    >
                      <Eye className="h-3 w-3 group-hover/btn:scale-110 transition-transform duration-300" />
                      Ver
                    </button>
                    <button  
                      onClick={() => handleDeleteSale(sale)}
                      disabled={isProcessing}
                      className="group/btn bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 px-2 py-1 rounded transition-all duration-300 ease-out text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                      title="Eliminar venta"
                    >
                      <Trash2 className="h-3 w-3 group-hover/btn:scale-110 transition-transform duration-300" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sales Table - Tabla tradicional para sm+ */}
      {loading ? (
        <div className="hidden sm:flex justify-center items-center py-12"><span className="text-gray-500">Cargando ventas...</span></div>
      ) : error ? (
        <div className="hidden sm:flex justify-center items-center py-12 text-red-600">{error}</div>
      ) : (
        <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="min-w-full w-full table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('date')}
                      className="flex items-center space-x-1 hover:text-gray-700"
                    >
                      <span>Fecha</span>
                      {sortBy === 'date' && (
                        sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  {/* Eliminado ID Venta */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Productos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descuento</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('total')}
                      className="flex items-center space-x-1 hover:text-gray-700"
                    >
                      <span>Total</span>
                      {sortBy === 'total' && (
                        sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('profit')}
                      className="flex items-center space-x-1 hover:text-gray-700"
                    >
                      <span>Ganancia</span>
                      {sortBy === 'profit' && (
                        sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método de Pago</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {finalPaginatedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          {(() => {
                            const dateObj = getValidDate(sale.createdAt);
                            return (
                              <>
                                <div className="text-sm font-medium text-gray-900">{dateObj ? dateObj.toLocaleDateString() : '-'}</div>
                                <div className="text-sm text-gray-500">{dateObj ? dateObj.toLocaleTimeString() : '-'}</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    {/* Eliminado ID Venta - columna removida para alinear las columnas */}
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {sale.isLayaway
                          ? (sale.type === 'layaway_payment'
                              ? <span className="text-purple-700 font-semibold">Abono a plan separe</span>
                              : sale.type === 'technical_service_payment'
                                ? <span className="text-green-700 font-semibold">Pago servicio técnico</span>
                                : <span className="text-blue-700 font-semibold">Entrega de plan separe</span>)
                          : sale.items.slice(0, 2).map((item, index) => (
                              <div key={index}>{item.quantity}× {item.productName}</div>
                            ))}
                        {!sale.isLayaway && sale.items.length > 2 && (
                          <div className="text-xs text-gray-500">+{sale.items.length - 2} productos más...</div>
                        )}
                        {/* Indicador de cortesías */}
                        {sale.courtesyItems && sale.courtesyItems.length > 0 && (
                          <div className="flex items-center mt-1 text-xs text-cyan-600 font-medium">
                            <Gift className="h-3 w-3 mr-1" />
                            <span>{sale.courtesyItems.length} cortesía{sale.courtesyItems.length > 1 ? 's' : ''}</span>
                            <span className="ml-1 text-gray-500">(-{formatCurrency(sale.courtesyTotalValue || 0)})</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(sale.subtotal ?? 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(sale.discount ?? 0) > 0 ? (
                        <div className="text-sm font-medium text-orange-600">-{formatCurrency(sale.discount ?? 0)}</div>
                      ) : (
                        <div className="text-sm text-gray-400">-</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(sale.finalTotal ?? sale.total ?? 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sale.courtesyItems && sale.courtesyItems.length > 0 ? (
                        <>
                          {(() => {
                            const realProfit = sale.realProfit ?? 0;
                            const isLoss = realProfit < 0;
                            const realMargin = ((sale.realProfit ?? 0) / (sale.realTotalCost ?? 1) * 100);
                            return (
                              <>
                                <div className={`text-sm font-medium ${isLoss ? 'text-red-600' : 'text-amber-600'}`}>
                                  {isLoss ? '' : '+'}{formatCurrency(realProfit)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {realMargin.toFixed(1)}% margen real
                                </div>
                                <div className="text-xs text-red-500 flex items-center mt-0.5">
                                  <Gift className="h-3 w-3 mr-1" />
                                  -{formatCurrency(sale.courtesyTotalCost || 0)} en cortesías
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-green-600">+{formatCurrency(sale.totalProfit ?? 0)}</div>
                          <div className="text-xs text-gray-500">{(sale.profitMargin ?? 0).toFixed(1)}% margen</div>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(sale)}`}>
                        {/* Mostrar solo "Pagos múltiples" si hay más de un método */}
                        {sale.paymentMethods && sale.paymentMethods.length > 1
                          ? 'Pagos múltiples'
                          : getPaymentMethodText(sale)
                        }
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {sale.salesPersonName || 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedSale(sale)}
                          disabled={isProcessing}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSale(sale)}
                          disabled={isProcessing}
                          className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Eliminar venta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Paginación */}
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            {/* Paginación móvil */}
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Primera
              </button>
              <button
                onClick={prevPage}
                disabled={!hasPrevPage}
                className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="px-2 py-2 text-sm text-gray-600">{currentPage}</span>
              <button
                onClick={nextPage}
                disabled={!hasNextPage}
                className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
            {/* Paginación escritorio */}
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">Página <span className="font-medium">{currentPage}</span></p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Primera
                  </button>
                  <button
                    onClick={prevPage}
                    disabled={!hasPrevPage}
                    className="relative inline-flex items-center px-2 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm text-gray-700">{currentPage}</span>
                  <button
                    onClick={nextPage}
                    disabled={!hasNextPage}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sale Details Modal */}
      {selectedSale && (
        <>
          {/* Overlay oscuro con margen superior blanco, debajo del modal de detalles */}
          {!showInvoice && (
            <>
              <div className="fixed inset-0 z-[99] pointer-events-none">
                <div className="absolute left-0 right-0 top-[5vh] bottom-0 bg-black bg-opacity-50" />
              </div>
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Detalles de la Venta</h3>
                        <p className="text-gray-500">ID: {selectedSale.id}</p>
                        {/* Mostrar cliente si existe (soporta customer plano o dentro de objeto) */}
                        {selectedSale.customerName && (
                          <p className="text-gray-700 text-sm mt-1">Cliente: {selectedSale.customerName}</p>
                        )}
                        {selectedSale.customerId && (
                          <p className="text-gray-500 text-xs">ID Cliente: {selectedSale.customerId}</p>
                        )}
                        {/* Mostrar si se usó saldo a favor en la venta y si fue pago múltiple */}
                        {selectedSale.paymentMethods && selectedSale.paymentMethods.some(pm => String(pm.method) === 'credit') && (
                          <>
                            <p className="text-green-700 text-xs mt-1 font-semibold">Saldo a favor aplicado en el pago</p>
                            {/* Mostrar monto de saldo a favor aplicado si existe */}
                            {(() => {
                              const creditPayment = selectedSale.paymentMethods.find(pm => String(pm.method) === 'credit');
                              return creditPayment && creditPayment.amount > 0 ? (
                                <p className="text-green-700 text-xs font-medium">Monto aplicado: {formatCurrency(creditPayment.amount)}</p>
                              ) : null;
                            })()}
                            {/* Marcar como pago múltiple si hay más de un método de pago */}
                            {selectedSale.paymentMethods.length > 1 && (
                              <p className="text-purple-700 text-xs mt-1 font-semibold">Pago múltiple: saldo a favor + otro método</p>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedSale(null)}
                        disabled={isProcessing}
                        className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ×
                      </button>
                    </div>
                    {/* Sale Info */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Fecha:</span>
                          <p className="font-medium">{
                            (() => {
                              const dateObj = getValidDate(selectedSale.createdAt);
                              return dateObj ? dateObj.toLocaleString() : '-';
                            })()
                          }</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Método(s) de Pago:</span>
                          {/* Mostrar "Pagos múltiples" si corresponde */}
                          <div className="font-medium text-purple-700">
                            {/* Mostrar "Pagos múltiples" con métodos usados si corresponde */}
                            {selectedSale?.paymentMethods && selectedSale.paymentMethods.length > 1
                              ? (() => {
                                  const names = selectedSale.paymentMethods.map(p => getPaymentMethodName(p.method));
                                  if (selectedSale.paymentMethods.some(p => String(p.method) === 'credit')) {
                                    const creditNames = names.filter(n => n === 'Saldo a favor');
                                    const otherNames = names.filter(n => n !== 'Saldo a favor');
                                    return `Pagos múltiples: ${creditNames.join(' + ')}${otherNames.length > 0 ? ' + ' + otherNames.join(' + ') : ''}`;
                                  }
                                  return `Múltiples métodos: ${names.join(' + ')}`;
                                })()
                              : getPaymentMethodText(selectedSale)
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Items */}
                    <div className="mb-6">
                      {selectedSale.isLayaway ? (
                        <>
                          <h4 className={`font-medium mb-3 ${
                            selectedSale.type === 'layaway_payment' ? 'text-purple-700' : 
                            selectedSale.type === 'technical_service_payment' ? 'text-green-700' : 'text-blue-700'
                          }`}>
                            {selectedSale.type === 'layaway_payment' ? 'Abono a plan separe' : 
                             selectedSale.type === 'technical_service_payment' ? 'Pago servicio técnico' : 'Entrega de plan separe'}
                          </h4>

                          {/* Información adicional para servicios técnicos */}
                          {selectedSale.type === 'technical_service_payment' && selectedSale.technicalServiceDetails && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                              <h5 className="font-medium text-green-800 mb-3">Detalles del Servicio Técnico</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                {selectedSale.technicalServiceDetails.deviceBrandModel && (
                                  <div>
                                    <span className="font-medium text-gray-700">Dispositivo:</span>
                                    <div className="text-gray-900">{selectedSale.technicalServiceDetails.deviceBrandModel}</div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.deviceImei && (
                                  <div>
                                    <span className="font-medium text-gray-700">IMEI:</span>
                                    <div className="text-gray-900 font-mono">{selectedSale.technicalServiceDetails.deviceImei}</div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.reportedIssue && (
                                  <div className="md:col-span-2">
                                    <span className="font-medium text-gray-700">Problema reportado:</span>
                                    <div className="text-gray-900">{selectedSale.technicalServiceDetails.reportedIssue}</div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.technicianName && (
                                  <div>
                                    <span className="font-medium text-gray-700">Técnico asignado:</span>
                                    <div className="text-gray-900">{selectedSale.technicalServiceDetails.technicianName}</div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.status && (
                                  <div>
                                    <span className="font-medium text-gray-700">Estado:</span>
                                    <div className={`font-medium ${
                                      selectedSale.technicalServiceDetails.status === 'completed' ? 'text-green-600' :
                                      selectedSale.technicalServiceDetails.status === 'active' ? 'text-blue-600' :
                                      'text-gray-600'
                                    }`}>
                                      {selectedSale.technicalServiceDetails.status === 'completed' ? 'Completado' :
                                       selectedSale.technicalServiceDetails.status === 'active' ? 'En proceso' :
                                       selectedSale.technicalServiceDetails.status}
                                    </div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.total !== undefined && (
                                  <div>
                                    <span className="font-medium text-gray-700">Costo total del servicio:</span>
                                    <div className="text-gray-900 font-semibold">{formatCurrency(selectedSale.technicalServiceDetails.total)}</div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.remainingBalance !== undefined && (
                                  <div>
                                    <span className="font-medium text-gray-700">Saldo restante tras este pago:</span>
                                    <div className={`font-semibold ${
                                      selectedSale.technicalServiceDetails.remainingBalance <= 0 ? 'text-green-600' : 'text-orange-600'
                                    }`}>
                                      {formatCurrency(selectedSale.technicalServiceDetails.remainingBalance)}
                                    </div>
                                  </div>
                                )}
                                {selectedSale.technicalServiceDetails.estimatedCompletionDate && (
                                  <div>
                                    <span className="font-medium text-gray-700">Fecha estimada de entrega:</span>
                                    <div className="text-gray-900">{new Date(selectedSale.technicalServiceDetails.estimatedCompletionDate).toLocaleDateString()}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <h4 className="font-medium text-gray-900 mb-3">Productos Vendidos</h4>
                          <div className="space-y-3">
                            {selectedSale.items.map((item, index) => (
                              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{item.productName}</div>
                                  <div className="text-sm text-gray-600">{item.quantity} × {formatCurrency(item.salePrice ?? 0)} = {formatCurrency(item.totalRevenue ?? 0)}</div>
                                  <div className="text-xs text-green-600">Ganancia: +{formatCurrency(item.profit ?? 0)} (Costo: {formatCurrency(item.totalCost ?? 0)})</div>
                                </div>
                                <button
                                  onClick={() => handleProductReturn(selectedSale.id, item.productId, item.productName, item.quantity, item.salePrice)}
                                  disabled={isProcessing}
                                  className="ml-3 px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Procesar devolución"
                                >
                                  Devolver
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Cortesías */}
                          {selectedSale.courtesyItems && selectedSale.courtesyItems.length > 0 && (
                            <>
                              <h4 className="font-medium text-gray-900 mb-3 mt-6 flex items-center">
                                <Gift className="h-5 w-5 text-cyan-600 mr-2" />
                                Cortesías
                              </h4>
                              <div className="space-y-3">
                                {selectedSale.courtesyItems.map((item, index) => (
                                  <div key={index} className="flex justify-between items-center p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900">{item.productName}</div>
                                      <div className="text-sm text-gray-600">
                                        {item.quantity} × {formatCurrency(item.normalPrice ?? 0)} = {formatCurrency(item.totalValue ?? 0)}
                                      </div>
                                      <div className="text-xs text-red-600">
                                        Costo real: -{formatCurrency(item.totalCost ?? 0)}
                                      </div>
                                      {item.reason && (
                                        <div className="text-xs text-gray-500 mt-1 italic">
                                          Motivo: {item.reason}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {/* Totals */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span>{formatCurrency(selectedSale.subtotal ?? 0)}</span>
                        </div>
                        {(selectedSale.discount ?? 0) > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Descuento:</span>
                            <span>-{formatCurrency(selectedSale.discount ?? 0)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Costo Total:</span>
                          <span className="text-red-600">{formatCurrency(selectedSale.totalCost ?? 0)}</span>
                        </div>
                        {/* Cortesías en totales */}
                        {selectedSale.courtesyItems && selectedSale.courtesyItems.length > 0 && (
                          <>
                            <div className="flex justify-between text-cyan-600">
                              <span className="flex items-center">
                                <Gift className="h-3 w-3 mr-1" />
                                Valor cortesías regaladas:
                              </span>
                              <span>{formatCurrency(selectedSale.courtesyTotalValue ?? 0)}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                              <span className="flex items-center">
                                <Gift className="h-3 w-3 mr-1" />
                                Costo cortesías:
                              </span>
                              <span>-{formatCurrency(selectedSale.courtesyTotalCost ?? 0)}</span>
                            </div>
                            <div className="flex justify-between font-medium text-red-700 bg-red-50 px-2 py-1 rounded">
                              <span>Costo Total Real (incluye cortesías):</span>
                              <span>{formatCurrency(selectedSale.realTotalCost ?? 0)}</span>
                            </div>
                          </>
                        )}
                        {(selectedSale.customerSurcharge ?? 0) > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Recargo por método de pago:</span>
                            <span>+{formatCurrency(selectedSale.customerSurcharge ?? 0)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                          <span>Total Pagado por Cliente:</span>
                          <span className="text-blue-600">{formatCurrency(selectedSale.finalTotal ?? selectedSale.total ?? 0)}</span>
                        </div>
                        {(() => {
                          // Determinar si hay cortesías y calcular ganancia real
                          const hasCourtesies = selectedSale.courtesyItems && selectedSale.courtesyItems.length > 0;
                          const realProfit = hasCourtesies ? (selectedSale.realProfit ?? 0) : (selectedSale.totalProfit ?? 0);
                          const isLoss = realProfit < 0;

                          return (
                            <div className={`flex justify-between font-bold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
                              <span>{hasCourtesies ? (isLoss ? 'Pérdida Real:' : 'Ganancia Real:') : 'Ganancia Total:'}</span>
                              {selectedSale.isLayaway
                                ? (() => {
                                    // Cálculo para abonos: ganancia = abono - costo proporcional
                                    const abono = selectedSale.total ?? 0;
                                    const costo = selectedSale.totalCost ?? 0;
                                    const ganancia = abono - costo;
                                    const rentabilidad = costo > 0 ? (ganancia / costo) * 100 : 0;
                                    return (
                                      <span className="text-purple-700">+{formatCurrency(ganancia)} ({rentabilidad.toFixed(1)}%)</span>
                                    );
                                  })()
                                : hasCourtesies
                                  ? (() => {
                                      const realProfit = selectedSale.realProfit ?? 0;
                                      const realCost = selectedSale.realTotalCost ?? 1;
                                      const realMargin = (realProfit / realCost) * 100;
                                      const isLoss = realProfit < 0;
                                      return (
                                        <span className={isLoss ? 'text-red-600' : 'text-amber-600'}>
                                          {isLoss ? '' : '+'}{formatCurrency(realProfit)} ({realMargin.toFixed(1)}%)
                                        </span>
                                      );
                                    })()
                                  : <span>+{formatCurrency(selectedSale.totalProfit ?? 0)} ({(selectedSale.profitMargin ?? 0).toFixed(1)}%)</span>
                              }
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-6">
                      <button
                        onClick={() => handleDeleteSale(selectedSale)}
                        disabled={isProcessing}
                        className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg shadow hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-5 w-5" />
                        Eliminar Venta
                      </button>
                      <button
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setShowInvoice(true)}
                        disabled={isProcessing}
                      >
                        <Receipt className="h-5 w-5" />
                        Imprimir factura
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {/* Modal de impresión de factura */}
          {showInvoice && (
            <InvoiceModal sale={selectedSale} onClose={() => setShowInvoice(false)} />
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && finalPaginatedSales.length === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <div className="text-gray-400 mb-4">
            <History className="h-12 w-12 mx-auto" />
          </div>
          {dateFilter === 'custom' && (!customDateRange.startDate || !customDateRange.endDate) ? (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona el rango de fechas</h3>
              <p className="text-gray-500">
                Para ver las ventas en un rango personalizado, debes seleccionar tanto la fecha de inicio como la fecha de fin.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron ventas</h3>
              <p className="text-gray-500">
                {searchTerm || dateFilter !== 'week' || paymentMethodFilter !== 'all' || salesPersonFilter !== 'all'
                  ? 'Intenta ajustar tus filtros de búsqueda.'
                  : 'Aún no se han registrado ventas en el sistema.'
                }
              </p>
            </>
          )}
        </div>
      )}

      {/* Return Product Modal */}
      {returnModal && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="bg-white rounded-xl max-w-md w-full p-6 relative z-10">
            {/* Overlay de carga */}
            {isProcessing && (
              <div className="absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center z-10">
                <div className="flex flex-col items-center">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-sm text-gray-600">Procesando devolución...</p>
                </div>
              </div>
            )}
            
            <h3 className="text-lg font-bold text-gray-900 mb-4">Procesar Devolución</h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Producto:</p>
              <p className="font-medium text-gray-900">{returnModal.productName}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cantidad a devolver (máx: {returnModal.maxQuantity})
              </label>
              <input
                type="number"
                min="1"
                max={returnModal.maxQuantity}
                value={returnModal.quantity}
                onChange={(e) => setReturnModal({
                  ...returnModal,
                  quantity: Math.min(parseInt(e.target.value) || 1, returnModal.maxQuantity)
                })}
                disabled={isProcessing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Asignar saldo a favor a cliente (opcional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre, teléfono..."
                  value={returnModal.customerSearch}
                  onChange={(e) => setReturnModal({
                    ...returnModal,
                    customerSearch: e.target.value,
                    selectedCustomerId: ''
                  })}
                  disabled={isProcessing || customersLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {returnModal.customerSearch && !returnModal.selectedCustomerId && (
                  <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto mt-1">
                    {customers.filter(c => 
                      c.name.toLowerCase().includes(returnModal.customerSearch.toLowerCase()) ||
                      (c.phone && c.phone.includes(returnModal.customerSearch))
                    ).length === 0 ? (
                      <div className="p-3 text-gray-500 text-sm">No hay clientes</div>
                    ) : (
                      customers
                        .filter(c => 
                          c.name.toLowerCase().includes(returnModal.customerSearch.toLowerCase()) ||
                          (c.phone && c.phone.includes(returnModal.customerSearch))
                        )
                        .map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={() => {
                              setReturnModal({
                                ...returnModal,
                                selectedCustomerId: customer.id,
                                customerSearch: customer.name + (customer.phone ? ` - ${customer.phone}` : '')
                              });
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                            disabled={isProcessing}
                          >
                            <div className="font-medium">{customer.name}</div>
                            {customer.phone && (
                              <div className="text-xs text-gray-500">{customer.phone}</div>
                            )}
                            <div className="text-xs text-green-600">
                              Saldo actual: {formatCurrency(customer.credit || 0)}
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
              {returnModal.selectedCustomerId && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-800">
                  <strong>Cliente seleccionado:</strong> {customers.find(c => c.id === returnModal.selectedCustomerId)?.name}
                  <br />
                  <strong>Monto a agregar:</strong> {formatCurrency(returnModal.productSalePrice * returnModal.quantity)}
                </div>
              )}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Importante:</strong> Esta acción recalculará los totales de la venta y devolverá {returnModal.quantity} unidad(es) al inventario.
                {returnModal.selectedCustomerId && (
                  <span>
                    {' '}Se agregarán {formatCurrency(returnModal.productSalePrice * returnModal.quantity)} al saldo a favor del cliente seleccionado.
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setReturnModal(null)}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={confirmReturn}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  'Confirmar Devolución'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Sale Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[102] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="bg-white rounded-xl max-w-md w-full p-6 relative z-10">
            {/* Overlay de carga */}
            {isProcessing && (
              <div className="absolute inset-0 bg-white bg-opacity-75 rounded-xl flex items-center justify-center z-10">
                <div className="flex flex-col items-center">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-sm text-gray-600">Eliminando venta...</p>
                </div>
              </div>
            )}
            
            <div className="flex items-center mb-4">
              <div className="bg-red-100 p-2 rounded-full mr-3">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Eliminar Venta</h3>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">¿Estás seguro de que deseas eliminar esta venta?</p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-900">ID: {deleteModal.saleId.substring(0, 8)}...</p>
                <p className="text-sm text-gray-600">Total: {formatCurrency(deleteModal.saleData.total ?? 0)}</p>
                {!deleteModal.saleData.isLayaway && (
                  <p className="text-sm text-gray-600">
                    Productos: {deleteModal.saleData.items.length} artículo{deleteModal.saleData.items.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">
                <strong>⚠️ Atención:</strong> {deleteModal?.saleData?.isLayaway
                  ? 'Esta acción no se puede deshacer. Se eliminará el abono del plan separe y del historial de ventas.'
                  : 'Esta acción no se puede deshacer. Se restaurará el stock de todos los productos vendidos.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  'Eliminar Venta'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

      {activeTab === 'cellphones' && (
        <div className="space-y-1">
          {/* Estadísticas de Celulares */}
          <div className="rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                📱 Estadísticas de Celulares
              </h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                Mismo período
              </span>
            </div>
            
            {cellphoneStats.loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-700">Calculando estadísticas de celulares...</span>
              </div>
            ) : cellphoneStats.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{cellphoneStats.error}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                      <Smartphone className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Transacciones</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">{cellphoneStats.transactionCount}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                      <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Ventas Totales</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">{formatCurrency(cellphoneStats.totalSales)}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
                      <Percent className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Descuentos</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-orange-900 transition-colors duration-300">{formatCurrency(cellphoneStats.totalDiscounts)}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
                      <TrendingUp className="w-3 h-3 text-green-600 group-hover:text-green-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Ganancia Total</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">{formatCurrency(cellphoneStats.totalProfit)}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-red-500/10 hover:-translate-y-0.5 hover:border-red-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-red-50 rounded flex items-center justify-center group-hover:bg-red-100 group-hover:scale-110 transition-all duration-300">
                      <Package className="w-3 h-3 text-red-600 group-hover:text-red-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Costo Total</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-red-900 transition-colors duration-300">{formatCurrency(cellphoneStats.totalCost)}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                      <User className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Promedio/Venta</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">{formatCurrency(cellphoneStats.averageTransaction)}</p>
                  </div>
                </div>
                
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5 hover:border-indigo-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-indigo-50 rounded flex items-center justify-center group-hover:bg-indigo-100 group-hover:scale-110 transition-all duration-300">
                      <BarChart3 className="w-3 h-3 text-indigo-600 group-hover:text-indigo-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">Margen Promedio</p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-indigo-900 transition-colors duration-300">{cellphoneStats.profitMargin.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            )}
            
            {!cellphoneStats.loading && !cellphoneStats.error && cellphoneStats.transactionCount === 0 && (
              <div className="text-center py-4">
                <p className="text-gray-600 text-sm">No hay ventas de celulares en este período</p>
              </div>
            )}
          </div>

          {/* Filtros para Celulares */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar celulares por modelo, cliente o ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={dateFilter}
                    onChange={(e) => handleDateFilterChange(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-sm"
                  >
                    <option value="today">Hoy</option>
                    <option value="week">Última semana</option>
                    <option value="month">Último mes</option>
                    <option value="3months">Últimos 3 meses</option>
                    <option value="6months">Últimos 6 meses</option>
                    <option value="year">Últimos 12 meses</option>
                    <option value="custom">Rango personalizado</option>
                  </select>
                </div>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="crédito">Crédito</option>
                </select>
                <select
                  value={salesPersonFilter}
                  onChange={(e) => setSalesPersonFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="all">Vendedores</option>
                  {availableUsers.map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName || user.email}
                    </option>
                  ))}
                </select>
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field as 'date' | 'total' | 'profit');
                    setSortOrder(order as 'asc' | 'desc');
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="date-desc">Más recientes</option>
                  <option value="date-asc">Más antiguos</option>
                  <option value="total-desc">Mayor monto</option>
                  <option value="total-asc">Menor monto</option>
                  <option value="profit-desc">Mayor ganancia</option>
                  <option value="profit-asc">Menor ganancia</option>
                </select>
              </div>

              {/* Time filter section - Only available for 'today' and 'custom' date filters */}
              {(dateFilter === 'today' || dateFilter === 'custom') && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      id="enable-time-filter-cellphones"
                      checked={enableTimeFilter}
                      onChange={(e) => {
                        setEnableTimeFilter(e.target.checked);
                        if (!e.target.checked) {
                          setTimeRange({ startTime: '', endTime: '' });
                        }
                      }}
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-blue-300 rounded"
                    />
                    <label htmlFor="enable-time-filter-cellphones" className="text-sm font-medium text-gray-700">
                      Filtrar por horas específicas
                    </label>
                  </div>
                  
                  {enableTimeFilter && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block mb-2 text-sm font-medium text-blue-800">
                          Hora de Inicio:
                        </label>
                        <div className="flex">
                          <select 
                            value={timeRange.startTime ? timeRange.startTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = timeRange.startTime ? timeRange.startTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : '';
                              
                              if (timeRange.endTime && newTime > timeRange.endTime) {
                                setTimeRange(prev => ({ ...prev, startTime: newTime, endTime: newTime }));
                              } else {
                                setTimeRange(prev => ({ ...prev, startTime: newTime }));
                              }
                            }}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                          >
                            <option value="">Hora</option>
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i.toString().padStart(2, '0')}>
                                {i.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center px-3 bg-gray-50 border-t border-b border-gray-300">
                            <span className="text-gray-500">:</span>
                          </div>
                          <select 
                            value={timeRange.startTime ? timeRange.startTime.split(':')[1] : ''}
                            onChange={(e) => {
                              const minute = e.target.value;
                              const hour = timeRange.startTime ? timeRange.startTime.split(':')[0] : '00';
                              const newTime = minute !== '' ? `${hour}:${minute}` : '';
                              
                              if (timeRange.endTime && newTime > timeRange.endTime) {
                                setTimeRange(prev => ({ ...prev, startTime: newTime, endTime: newTime }));
                              } else {
                                setTimeRange(prev => ({ ...prev, startTime: newTime }));
                              }
                            }}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                          >
                            <option value="">Min</option>
                            {['00', '15', '30', '45'].map(minute => (
                              <option key={minute} value={minute}>
                                {minute}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block mb-2 text-sm font-medium text-blue-800">
                          Hora de Fin:
                        </label>
                        <div className="flex">
                          <select 
                            value={timeRange.endTime ? timeRange.endTime.split(':')[0] : ''}
                            onChange={(e) => {
                              const hour = e.target.value;
                              const minute = timeRange.endTime ? timeRange.endTime.split(':')[1] : '00';
                              const newTime = hour ? `${hour}:${minute}` : '';
                              setTimeRange(prev => ({ ...prev, endTime: newTime }));
                            }}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-l-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                          >
                            <option value="">Hora</option>
                            {Array.from({ length: 24 }, (_, i) => {
                              const hourValue = i.toString().padStart(2, '0');
                              const isDisabled = timeRange.startTime ? hourValue < timeRange.startTime.split(':')[0] : false;
                              return (
                                <option key={i} value={hourValue} disabled={isDisabled}>
                                  {hourValue}
                                </option>
                              );
                            })}
                          </select>
                          <div className="flex items-center px-3 bg-gray-50 border-t border-b border-gray-300">
                            <span className="text-gray-500">:</span>
                          </div>
                          <select 
                            value={timeRange.endTime ? timeRange.endTime.split(':')[1] : ''}
                            onChange={(e) => {
                              const minute = e.target.value;
                              const hour = timeRange.endTime ? timeRange.endTime.split(':')[0] : '00';
                              const newTime = minute !== '' ? `${hour}:${minute}` : '';
                              setTimeRange(prev => ({ ...prev, endTime: newTime }));
                            }}
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-r-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                          >
                            <option value="">Min</option>
                            {['00', '15', '30', '45'].map(minute => (
                              <option key={minute} value={minute}>
                                {minute}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {dateFilter === 'custom' && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <CalendarRange className="h-5 w-5 text-blue-600 mr-2" />
                      <span className="text-sm font-medium text-blue-900">Seleccionar Rango de Fechas</span>
                    </div>
                    {(customDateRange.startDate || customDateRange.endDate) && (
                      <button
                        onClick={clearCustomDateRange}
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-blue-800 mb-1">
                          Fecha de Inicio
                        </label>
                        <input
                          type="date"
                          value={customDateRange.startDate}
                          onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                          max={customDateRange.endDate || new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          title="Fecha de inicio (máximo 1 año de rango)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-blue-800 mb-1">
                          Fecha de Fin
                        </label>
                        <input
                          type="date"
                          value={customDateRange.endDate}
                          onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                          min={customDateRange.startDate}
                          max={new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          title="Fecha de fin (máximo 1 año de rango)"
                        />
                      </div>
                    </div>
                  </div>
                  {getDateRangeText() && (
                    <div className="mt-3 p-2 bg-blue-100 rounded text-sm text-blue-800">
                      <strong>Rango seleccionado:</strong> {getDateRangeText()}
                    </div>
                  )}
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>📅 Nota:</strong> Por rendimiento, el rango personalizado está limitado a un máximo de 1 año.
                    </p>
                  </div>
                </div>
              )}

              {(searchTerm || dateFilter !== 'month' || paymentMethodFilter !== 'all' || salesPersonFilter !== 'all') && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Filtros activos:</span>
                  {searchTerm && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Búsqueda: "{searchTerm}"
                      <button
                        onClick={() => setSearchTerm('')}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {dateFilter !== 'month' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {dateFilter === 'custom' ? `Rango: ${getDateRangeText()}` : 
                       dateFilter === 'today' ? 'Hoy' :
                       dateFilter === 'week' ? 'Última semana' :
                       dateFilter === '3months' ? 'Últimos 3 meses' :
                       dateFilter === '6months' ? 'Últimos 6 meses' :
                       dateFilter === 'year' ? 'Últimos 12 meses' : 'Personalizado'}
                      <button
                        onClick={() => handleDateFilterChange('month')}
                        className="ml-1 text-green-600 hover:text-green-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {paymentMethodFilter !== 'all' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {getPaymentMethodName(paymentMethodFilter)}
                      <button
                        onClick={() => setPaymentMethodFilter('all')}
                        className="ml-1 text-purple-600 hover:text-purple-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {salesPersonFilter !== 'all' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      Vendedor: {availableUsers.find(u => u.uid === salesPersonFilter)?.displayName || availableUsers.find(u => u.uid === salesPersonFilter)?.email || 'Desconocido'}
                      <button
                        onClick={() => setSalesPersonFilter('all')}
                        className="ml-1 text-indigo-600 hover:text-indigo-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>


          {/* Tabla de Ventas de Celulares - Cards para móviles */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <span className="text-gray-500">Cargando ventas de celulares...</span>
            </div>
          ) : error ? (
            <div className="flex justify-center items-center py-12 text-red-600">{error}</div>
          ) : (
            <div className="grid gap-3 sm:hidden">
              {finalPaginatedSales
                .filter(sale => {
                  // Excluir abonos a plan separe
                  if (sale.isLayaway || sale.type === 'layaway_payment') return false;
                  // Filtrar por celulares
                  return sale.items?.some(item =>
                    item.category?.toLowerCase().includes('celular') ||
                    item.productName?.toLowerCase().includes('celular') ||
                    item.productName?.toLowerCase().includes('móvil') ||
                    item.productName?.toLowerCase().includes('smartphone') ||
                    item.productName?.toLowerCase().includes('iphone') ||
                    item.productName?.toLowerCase().includes('samsung') ||
                    item.productName?.toLowerCase().includes('xiaomi') ||
                    item.productName?.toLowerCase().includes('huawei')
                  );
                })
                .map((sale) => (
                <div key={sale.id} className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                      <Smartphone className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                    </div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                      Celulares #{sale.id.substring(0, 8)}
                    </p>
                    <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                      {formatCurrency(sale.finalTotal ?? sale.total ?? 0)}
                    </p>
                    
                    {/* Información adicional compacta */}
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-slate-500">
                        {(() => {
                          const dateObj = getValidDate(sale.createdAt);
                          return dateObj ? dateObj.toLocaleDateString() : '-';
                        })()} • {sale.salesPersonName || 'Sin vendedor'}
                      </div>
                      
                      <div className="text-xs text-blue-600 font-medium">
                        {sale.items.filter(item => 
                          item.category?.toLowerCase().includes('celular') || 
                          item.productName?.toLowerCase().includes('celular') ||
                          item.productName?.toLowerCase().includes('móvil') ||
                          item.productName?.toLowerCase().includes('smartphone') ||
                          item.productName?.toLowerCase().includes('iphone') ||
                          item.productName?.toLowerCase().includes('samsung') ||
                          item.productName?.toLowerCase().includes('xiaomi') ||
                          item.productName?.toLowerCase().includes('huawei')
                        ).length} celular{sale.items.filter(item => 
                          item.category?.toLowerCase().includes('celular') || 
                          item.productName?.toLowerCase().includes('celular') ||
                          item.productName?.toLowerCase().includes('móvil') ||
                          item.productName?.toLowerCase().includes('smartphone') ||
                          item.productName?.toLowerCase().includes('iphone') ||
                          item.productName?.toLowerCase().includes('samsung') ||
                          item.productName?.toLowerCase().includes('xiaomi') ||
                          item.productName?.toLowerCase().includes('huawei')
                        ).length !== 1 ? 'es' : ''} en venta
                      </div>
                      
                      <div className="flex justify-center items-center space-x-3 text-xs">
                        <span className="text-green-600 font-medium">
                          +{formatCurrency(sale.totalProfit ?? 0)}
                        </span>
                        <span className="text-orange-600 font-medium">
                          {(sale.profitMargin ?? 0).toFixed(1)}%
                        </span>
                      </div>
                      
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(sale)}`}>
                        {sale.paymentMethods && sale.paymentMethods.length > 1
                          ? 'Múltiples'
                          : getPaymentMethodText(sale)
                        }
                      </span>
                      
                      {/* Botones compactos */}
                      <div className="flex gap-1 justify-center mt-2">
                        <button
                          onClick={() => setSelectedSale(sale)}
                          disabled={isProcessing}
                          className="group/btn bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 px-2 py-1 rounded transition-all duration-300 ease-out text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                          title="Ver detalles"
                        >
                          <Eye className="h-3 w-3 group-hover/btn:scale-110 transition-transform duration-300" />
                          Ver
                        </button>
                        <button
                          onClick={() => handleDeleteSale(sale)}
                          disabled={isProcessing}
                          className="group/btn bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 px-2 py-1 rounded transition-all duration-300 ease-out text-xs font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                          title="Eliminar venta"
                        >
                          <Trash2 className="h-3 w-3 group-hover/btn:scale-110 transition-transform duration-300" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabla de Ventas de Celulares - Tabla tradicional para sm+ */}
          {loading ? (
            <div className="hidden sm:flex justify-center items-center py-12">
              <span className="text-gray-500">Cargando ventas de celulares...</span>
            </div>
          ) : error ? (
            <div className="hidden sm:flex justify-center items-center py-12 text-red-600">{error}</div>
          ) : (
            <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto w-full">
                <table className="min-w-full w-full table-fixed">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('date')}
                          className="flex items-center space-x-1 hover:text-gray-700"
                        >
                          <span>Fecha</span>
                          {sortBy === 'date' && (
                            sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <Smartphone className="h-4 w-4 text-blue-500" />
                          Celulares
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descuento</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('total')}
                          className="flex items-center space-x-1 hover:text-gray-700"
                        >
                          <span>Total</span>
                          {sortBy === 'total' && (
                            sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('profit')}
                          className="flex items-center space-x-1 hover:text-gray-700"
                        >
                          <span>Ganancia</span>
                          {sortBy === 'profit' && (
                            sortOrder === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método de Pago</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {finalPaginatedSales
                      .filter(sale => {
                        // Excluir abonos a plan separe
                        if (sale.isLayaway || sale.type === 'layaway_payment') return false;
                        // Filtrar por celulares
                        return sale.items?.some(item =>
                          item.category?.toLowerCase().includes('celular') ||
                          item.productName?.toLowerCase().includes('celular') ||
                          item.productName?.toLowerCase().includes('móvil') ||
                          item.productName?.toLowerCase().includes('smartphone') ||
                          item.productName?.toLowerCase().includes('iphone') ||
                          item.productName?.toLowerCase().includes('samsung') ||
                          item.productName?.toLowerCase().includes('xiaomi') ||
                          item.productName?.toLowerCase().includes('huawei')
                        );
                      })
                      .map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 text-gray-400 mr-2" />
                            <div>
                              {(() => {
                                const dateObj = getValidDate(sale.createdAt);
                                return (
                                  <>
                                    <div className="text-sm font-medium text-gray-900">{dateObj ? dateObj.toLocaleDateString() : '-'}</div>
                                    <div className="text-sm text-gray-500">{dateObj ? dateObj.toLocaleTimeString() : '-'}</div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {sale.items
                              .filter(item => 
                                item.category?.toLowerCase().includes('celular') || 
                                item.productName?.toLowerCase().includes('celular') ||
                                item.productName?.toLowerCase().includes('móvil') ||
                                item.productName?.toLowerCase().includes('smartphone') ||
                                item.productName?.toLowerCase().includes('iphone') ||
                                item.productName?.toLowerCase().includes('samsung') ||
                                item.productName?.toLowerCase().includes('xiaomi') ||
                                item.productName?.toLowerCase().includes('huawei')
                              )
                              .slice(0, 2)
                              .map((item, index) => (
                                <div key={index} className="flex items-center gap-1">
                                  <Smartphone className="h-3 w-3 text-blue-500" />
                                  {item.quantity}× {item.productName}
                                </div>
                              ))}
                            {sale.items.filter(item => 
                              item.category?.toLowerCase().includes('celular') || 
                              item.productName?.toLowerCase().includes('celular') ||
                              item.productName?.toLowerCase().includes('móvil') ||
                              item.productName?.toLowerCase().includes('smartphone') ||
                              item.productName?.toLowerCase().includes('iphone') ||
                              item.productName?.toLowerCase().includes('samsung') ||
                              item.productName?.toLowerCase().includes('xiaomi') ||
                              item.productName?.toLowerCase().includes('huawei')
                            ).length > 2 && (
                              <div className="text-xs text-gray-500">
                                +{sale.items.filter(item => 
                                  item.category?.toLowerCase().includes('celular') || 
                                  item.productName?.toLowerCase().includes('celular') ||
                                  item.productName?.toLowerCase().includes('móvil') ||
                                  item.productName?.toLowerCase().includes('smartphone') ||
                                  item.productName?.toLowerCase().includes('iphone') ||
                                  item.productName?.toLowerCase().includes('samsung') ||
                                  item.productName?.toLowerCase().includes('xiaomi') ||
                                  item.productName?.toLowerCase().includes('huawei')
                                ).length - 2} celulares más...
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{formatCurrency(sale.subtotal ?? 0)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(sale.discount ?? 0) > 0 ? (
                            <div className="text-sm font-medium text-orange-600">-{formatCurrency(sale.discount ?? 0)}</div>
                          ) : (
                            <div className="text-sm text-gray-400">-</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{formatCurrency(sale.finalTotal ?? sale.total ?? 0)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-green-600">+{formatCurrency(sale.totalProfit ?? 0)}</div>
                          <div className="text-xs text-gray-500">{(sale.profitMargin ?? 0).toFixed(1)}% margen</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentMethodColor(sale)}`}>
                            {sale.paymentMethods && sale.paymentMethods.length > 1
                              ? 'Pagos múltiples'
                              : getPaymentMethodText(sale)
                            }
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-900">
                              {sale.salesPersonName || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedSale(sale)}
                              disabled={isProcessing}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Ver detalles"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSale(sale)}
                              disabled={isProcessing}
                              className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Eliminar venta"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Paginación para celulares */}
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Primera
                  </button>
                  <button
                    onClick={prevPage}
                    disabled={!hasPrevPage}
                    className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="px-2 py-2 text-sm text-gray-600">{currentPage}</span>
                  <button
                    onClick={nextPage}
                    disabled={!hasNextPage}
                    className="relative inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Página <span className="font-medium">{currentPage}</span> - 
                      <span className="text-blue-600 font-medium"> Solo ventas con celulares</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => setPage(1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Primera
                      </button>
                      <button
                        onClick={prevPage}
                        disabled={!hasPrevPage}
                        className="relative inline-flex items-center px-2 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span className="px-3 py-2 border-t border-b border-gray-300 bg-white text-sm text-gray-700">{currentPage}</span>
                      <button
                        onClick={nextPage}
                        disabled={!hasNextPage}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State para celulares */}
          {!loading && finalPaginatedSales.filter(sale => {
            // Excluir abonos a plan separe
            if (sale.isLayaway || sale.type === 'layaway_payment') return false;
            // Filtrar por celulares
            return sale.items?.some(item =>
              item.category?.toLowerCase().includes('celular') ||
              item.productName?.toLowerCase().includes('celular') ||
              item.productName?.toLowerCase().includes('móvil') ||
              item.productName?.toLowerCase().includes('smartphone') ||
              item.productName?.toLowerCase().includes('iphone') ||
              item.productName?.toLowerCase().includes('samsung') ||
              item.productName?.toLowerCase().includes('xiaomi') ||
              item.productName?.toLowerCase().includes('huawei')
            );
          }).length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <div className="text-gray-400 mb-4">
                <Smartphone className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay ventas de celulares</h3>
              <p className="text-gray-500">
                {searchTerm || dateFilter !== 'week' || paymentMethodFilter !== 'all' || salesPersonFilter !== 'all'
                  ? 'No se encontraron ventas con celulares en los filtros seleccionados.'
                  : 'Aún no se han registrado ventas con celulares en el sistema.'
                }
              </p>
            </div>
          )}
        </div>
      )}

      {/* Custom Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-[103] max-w-sm w-full">
          <div className={`rounded-lg shadow-lg border-l-4 p-4 ${
            notification.type === 'success' 
              ? 'bg-green-50 border-green-400' 
              : 'bg-red-50 border-red-400'
          }`}>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {notification.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div className="ml-3 w-0 flex-1">
                <p className={`text-sm font-medium ${
                  notification.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {notification.title}
                </p>
                <p className={`mt-1 text-sm ${
                  notification.type === 'success' ? 'text-green-700' : 'text-red-700'
                }`}>
                  {notification.message}
                </p>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  onClick={() => setNotification(null)}
                  className={`rounded-md inline-flex ${
                    notification.type === 'success' 
                      ? 'text-green-400 hover:text-green-600' 
                      : 'text-red-400 hover:text-red-600'
                  } focus:outline-none`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}