import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Calendar,
  DollarSign,
  TrendingUp,
  Eye,
  Download,
  Settings,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart3,
  CalendarRange,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Package,
  Tool,
  Timer,
  Users,
  CreditCard,
  Banknote,
  Receipt,
  ArrowUpRight,
  Gift
} from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectTechnicalServices, selectCustomers } from '../store/selectors';
import { TechnicalService, Customer } from '../types';
import { formatCurrency } from '../utils/currency';
import { useSectionRealtime } from '../hooks/useOnDemandData';

// Utilidad para convertir cualquier valor de fecha Firestore/JS a Date válido
function getValidDate(date: any): Date | null {
  if (!date) return null;
  if (typeof date.toDate === 'function') return date.toDate();
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

// Función auxiliar para parsear fechas localmente sin conversión de zona horaria
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function TechnicalServiceHistory() {
  useSectionRealtime('technicalServices');
  
  // Estados para pestañas y filtros
  const [activeTab, setActiveTab] = useState<'services' | 'cashflow'>('services');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'profit'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedService, setSelectedService] = useState<TechnicalService | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [dateError, setDateError] = useState('');
  
  // Función para obtener el rango de fechas actual
  const getCurrentDateRange = () => {
    const today = new Date();
    let startDate: Date, endDate: Date;
    
    switch (dateFilter) {
      case 'today':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        break;
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          startDate = parseLocalDate(customDateRange.startDate);
          endDate = parseLocalDate(customDateRange.endDate);
          endDate.setHours(23, 59, 59);
        } else {
          return null; // No hay rango válido
        }
        break;
      default:
        return null;
    }
    
    return {
      startDate,
      endDate,
      startDateFormatted: startDate.toLocaleDateString('es-ES', { 
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' 
      }),
      endDateFormatted: endDate.toLocaleDateString('es-ES', { 
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' 
      })
    };
  };
  
  const itemsPerPage = 10;

  // Selectors
  const allTechnicalServices = useAppSelector(selectTechnicalServices);
  const customers = useAppSelector(selectCustomers);

  // Función para calcular totales reales basados en items actuales
  const calculateRealTotals = (service: TechnicalService) => {
    const totalPaid = service.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
    
    // Usar el nuevo sistema de costos si está disponible
    let laborCost = 0;
    let realTotal = 0;
    let realCost = 0;
    let realProfit = 0;
    
    if (service.serviceCost !== undefined) {
      // Nuevo sistema implementado:
      // - serviceCost = lo que paga el cliente (total)
      // - partsCost = costo de repuestos
      // - laborCost = serviceCost - partsCost (mano de obra)
      // - technicianShare = 50% de laborCost (para el técnico)
      // - businessShare = 50% de laborCost (ganancia del negocio)
      realTotal = service.serviceCost;
      laborCost = service.laborCost || Math.max(0, service.serviceCost - partsCost);
      realCost = partsCost; // Solo los repuestos son costo directo
      realProfit = service.businessShare || (laborCost * 0.5); // Solo la parte del negocio es ganancia
    } else {
      // Sistema anterior para compatibilidad
      laborCost = (service as any).laborCost || 0;
      realTotal = partsCost + laborCost;
      realCost = partsCost;
      realProfit = laborCost; // En el sistema anterior toda la mano de obra era ganancia
    }
    
    const remainingBalance = realTotal - totalPaid;
    
    return { 
      totalPaid, 
      realTotal, 
      realCost, 
      realProfit, 
      remainingBalance,
      partsCost,
      laborCost
    };
  };

  // Función para obtener nombre del cliente
  const getCustomerName = (customerId?: string) => {
    if (!customerId) return 'Cliente no especificado';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Cliente desconocido';
  };

  // Función para determinar estado de pago
  const getPaymentStatus = (service: TechnicalService) => {
    const { remainingBalance } = calculateRealTotals(service);
    if (remainingBalance <= 0.01) return 'paid';
    if (service.payments && service.payments.length > 0) return 'partial';
    return 'pending';
  };

  // Función para alternar expansión de servicio
  const toggleServiceExpansion = (serviceId: string) => {
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(serviceId)) {
      newExpanded.delete(serviceId);
    } else {
      newExpanded.add(serviceId);
    }
    setExpandedServices(newExpanded);
  };

  // Función para obtener pagos en el rango de fechas seleccionado
  const getPaymentsInDateRange = () => {
    const today = new Date();
    let startDate: Date, endDate: Date;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        break;
      case 'custom':
        if (customDateRange.startDate && customDateRange.endDate) {
          startDate = parseLocalDate(customDateRange.startDate);
          endDate = parseLocalDate(customDateRange.endDate);
          endDate.setHours(23, 59, 59);
        } else {
          return []; // No mostrar pagos hasta que ambas fechas estén seleccionadas
        }
        break;
      default:
        return [];
    }

    const paymentsInRange: Array<{
      id: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      serviceId: string;
      customerName: string;
      notes?: string;
    }> = [];

    allTechnicalServices.forEach(service => {
      if (service.payments) {
        service.payments.forEach(payment => {
          const paymentDate = getValidDate(payment.paymentDate);
          if (paymentDate && paymentDate >= startDate && paymentDate <= endDate) {
            paymentsInRange.push({
              ...payment,
              serviceId: service.id,
              customerName: getCustomerName(service.customerId)
            });
          }
        });
      }
    });

    return paymentsInRange.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  };

  // Estadísticas de flujo de caja del período
  const cashFlowStats = useMemo(() => {
    const paymentsInRange = getPaymentsInDateRange();
    
    const totalCashReceived = paymentsInRange.reduce((sum, payment) => sum + payment.amount, 0);
    const paymentsByMethod = paymentsInRange.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);
    
    const totalPayments = paymentsInRange.length;
    const averagePayment = totalPayments > 0 ? totalCashReceived / totalPayments : 0;

    return {
      totalCashReceived,
      paymentsByMethod,
      totalPayments,
      averagePayment,
      paymentsInRange
    };
  }, [dateFilter, customDateRange, allTechnicalServices, customers]);

  // Función para formatear fecha
  const formatDate = (date: any) => {
    const validDate = getValidDate(date);
    if (!validDate) return 'Fecha inválida';
    
    return validDate.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota'
    });
  };

  // Filtrado y ordenamiento de servicios técnicos
  const filteredAndSortedServices = useMemo(() => {
    let filtered = allTechnicalServices.filter(service => {
      // Filtro de búsqueda
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        service.deviceDetails?.toLowerCase().includes(searchLower) ||
        service.issue?.toLowerCase().includes(searchLower) ||
        getCustomerName(service.customerId).toLowerCase().includes(searchLower) ||
        service.id.toLowerCase().includes(searchLower) ||
        service.items?.some(item => 
          item.partName?.toLowerCase().includes(searchLower) ||
          item.partDescription?.toLowerCase().includes(searchLower)
        ) ||
        service.deviceBrandModel?.toLowerCase().includes(searchLower) ||
        service.notes?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Filtro de estado
      if (statusFilter !== 'all' && service.status !== statusFilter) return false;

      // Filtro de estado de pago
      if (paymentStatusFilter !== 'all') {
        const paymentStatus = getPaymentStatus(service);
        if (paymentStatusFilter !== paymentStatus) return false;
      }

      // Filtro de fecha - usar fecha apropiada según el estado filtrado
      let serviceDate: Date | null;
      if (statusFilter === 'completed') {
        serviceDate = getValidDate(service.completedAt) || getValidDate(service.createdAt);
      } else {
        serviceDate = getValidDate(service.createdAt);
      }
      
      if (!serviceDate) return false;

      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      switch (dateFilter) {
        case 'today':
          return serviceDate >= startOfToday && serviceDate <= endOfToday;
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const startOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
          const endOfYesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
          return serviceDate >= startOfYesterday && serviceDate <= endOfYesterday;
        case 'thisWeek':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          return serviceDate >= startOfWeek;
        case 'thisMonth':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          return serviceDate >= startOfMonth;
        case 'lastMonth':
          const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
          return serviceDate >= startOfLastMonth && serviceDate <= endOfLastMonth;
        case 'custom':
          if (customDateRange.startDate && customDateRange.endDate) {
            const startDate = parseLocalDate(customDateRange.startDate);
            const endDate = parseLocalDate(customDateRange.endDate);
            endDate.setHours(23, 59, 59);
            return serviceDate >= startDate && serviceDate <= endDate;
          }
          return false; // No mostrar resultados hasta que ambas fechas estén seleccionadas
        default:
          return true;
      }
    });

    // Ordenamiento
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          let dateA: Date | null, dateB: Date | null;
          
          if (statusFilter === 'completed') {
            dateA = getValidDate(a.completedAt) || getValidDate(a.createdAt);
            dateB = getValidDate(b.completedAt) || getValidDate(b.createdAt);
          } else {
            dateA = getValidDate(a.createdAt);
            dateB = getValidDate(b.createdAt);
          }
          
          comparison = dateA && dateB ? dateA.getTime() - dateB.getTime() : 0;
          break;
        case 'total':
          comparison = calculateRealTotals(a).realTotal - calculateRealTotals(b).realTotal;
          break;
        case 'profit':
          comparison = calculateRealTotals(a).realProfit - calculateRealTotals(b).realProfit;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [allTechnicalServices, searchTerm, dateFilter, customDateRange, statusFilter, paymentStatusFilter, sortBy, sortOrder, customers]);

  // Paginación
  const totalServices = filteredAndSortedServices.length;
  const totalPages = Math.ceil(totalServices / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedServices = filteredAndSortedServices.slice(startIndex, startIndex + itemsPerPage);

  // Estadísticas
  const stats = useMemo(() => {
    const completedServices = filteredAndSortedServices.filter(s => s.status === 'completed');
    const activeServices = filteredAndSortedServices.filter(s => s.status === 'active');
    
    // Calcular ingresos basados en pagos reales recibidos (no solo servicios completados)
    const totalRevenue = filteredAndSortedServices.reduce((sum, service) => {
      const { totalPaid } = calculateRealTotals(service);
      return sum + totalPaid;
    }, 0);
    
    // Para ganancia y costo, usar proporcional basado en pagos recibidos
    const totalCost = filteredAndSortedServices.reduce((sum, service) => {
      const { totalPaid, realTotal, realCost } = calculateRealTotals(service);
      // Calcular costo proporcional basado en lo pagado
      const proportionalCost = realTotal > 0 ? (totalPaid / realTotal) * realCost : 0;
      return sum + proportionalCost;
    }, 0);
    
    const totalProfit = totalRevenue - totalCost;
    
    const averageService = completedServices.length > 0 ? completedServices.reduce((sum, service) => sum + calculateRealTotals(service).realTotal, 0) / completedServices.length : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const servicesWithPendingPayments = filteredAndSortedServices.filter(s => getPaymentStatus(s) === 'pending').length;
    const servicesWithPartialPayments = filteredAndSortedServices.filter(s => getPaymentStatus(s) === 'partial').length;
    const servicesFullyPaid = filteredAndSortedServices.filter(s => getPaymentStatus(s) === 'paid').length;
    const totalPendingAmount = filteredAndSortedServices.reduce((sum, service) => {
      const { remainingBalance } = calculateRealTotals(service);
      return sum + Math.max(0, remainingBalance);
    }, 0);

    return {
      totalServices: filteredAndSortedServices.length,
      completedServices: completedServices.length,
      activeServices: activeServices.length,
      totalRevenue,
      totalProfit,
      totalCost,
      averageService,
      profitMargin,
      servicesWithPendingPayments,
      servicesWithPartialPayments,
      servicesFullyPaid,
      totalPendingAmount
    };
  }, [filteredAndSortedServices]);

  // Funciones para obtener colores y textos de estado
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Activo';
      case 'completed':
        return 'Finalizado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getDisplayDate = (service: TechnicalService) => {
    // Si el servicio está finalizado, mostrar fecha de finalización
    if (service.status === 'completed' && service.completedAt) {
      return service.completedAt;
    }
    // En todos los demás casos, mostrar fecha de creación
    return service.createdAt;
  };

  const getDateLabel = () => {
    return 'Fecha';
  };

  const getDateType = (service: TechnicalService) => {
    if (statusFilter === 'completed') {
      if (service.completedAt) return 'Finalizado';
      return 'Creado';
    }
    return 'Creado';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Centro de Servicios Técnicos</h1>
            <p className="text-gray-500 mt-1">Administra el control de caja diario, pagos recibidos y seguimiento de servicios</p>
          </div>
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-300">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('services')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'services'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Servicios</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('cashflow')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'cashflow'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>Flujo de Caja</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Contenido de las Pestañas */}
        <div className="p-6">
          {activeTab === 'services' && (
            <div className="space-y-6">
              {/* Estadísticas de Servicios */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                      <Settings className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                    </div>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
                      Total Servicios
                    </p>
                    <p className="text-base font-bold text-gray-900 group-hover:text-blue-900 transition-colors duration-300">
                      {stats.totalServices}
                    </p>
                  </div>
                </div>

                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
                      <DollarSign className="w-3 h-3 text-green-600 group-hover:text-green-700" />
                    </div>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
                      Ingresos
                    </p>
                    <p className="text-base font-bold text-gray-900 group-hover:text-green-900 transition-colors duration-300">
                      {formatCurrency(stats.totalRevenue)}
                    </p>
                  </div>
                </div>

                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                      <TrendingUp className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                    </div>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
                      Ganancia
                    </p>
                    <p className="text-base font-bold text-gray-900 group-hover:text-emerald-900 transition-colors duration-300">
                      {formatCurrency(stats.totalProfit)}
                    </p>
                  </div>
                </div>

                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                      <BarChart3 className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
                    </div>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
                      Margen
                    </p>
                    <p className="text-base font-bold text-gray-900 group-hover:text-purple-900 transition-colors duration-300">
                      {stats.profitMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
                  <div className="text-center">
                    <div className="w-5 h-5 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
                      <Receipt className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
                    </div>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-0.5 group-hover:text-gray-700 transition-colors duration-300">
                      Por Cobrar
                    </p>
                    <p className="text-base font-bold text-gray-900 group-hover:text-orange-900 transition-colors duration-300">
                      {formatCurrency(stats.totalPendingAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Búsqueda */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-300">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="ID, cliente, dispositivo, problema, repuestos..."
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Filtros */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                  {/* Filtro de fecha */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Período
                    </label>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="today">Hoy</option>
                      <option value="yesterday">Ayer</option>
                      <option value="thisWeek">Esta semana</option>
                      <option value="thisMonth">Este mes</option>
                      <option value="lastMonth">Mes pasado</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>

                  {/* Filtro de estado */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos</option>
                      <option value="active">Activos</option>
                      <option value="completed">Finalizados</option>
                      <option value="cancelled">Cancelados</option>
                    </select>
                  </div>

                  {/* Filtro de estado de pago */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estado de Pago
                    </label>
                    <select
                      value={paymentStatusFilter}
                      onChange={(e) => setPaymentStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Todos los pagos</option>
                      <option value="paid">Pagado completo</option>
                      <option value="partial">Pago parcial</option>
                      <option value="pending">Sin pagos</option>
                    </select>
                  </div>

                  {/* Ordenamiento */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ordenar por
                    </label>
                    <div className="flex space-x-2">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="date">Fecha</option>
                        <option value="total">Total</option>
                        <option value="profit">Ganancia</option>
                      </select>
                      <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Error de fechas */}
                {dateError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{dateError}</p>
                  </div>
                )}
                
                {/* Rango de fechas actual */}
                {(() => {
                  const dateRange = getCurrentDateRange();
                  return dateRange && (
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-900">
                          Mostrando servicios desde el <strong>{dateRange.startDateFormatted}</strong> hasta el <strong>{dateRange.endDateFormatted}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Rango de fechas personalizado */}
                {dateFilter === 'custom' && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha inicial
                      </label>
                      <input
                        type="date"
                        value={customDateRange.startDate}
                        onChange={(e) => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          const selectedDate = new Date(e.target.value);
                          
                          if (selectedDate < sixMonthsAgo) {
                            setDateError('La fecha inicial no puede ser mayor a 6 meses atrás');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          setDateError('');
                          setCustomDateRange({...customDateRange, startDate: e.target.value});
                        }}
                        min={(() => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          return sixMonthsAgo.toISOString().split('T')[0];
                        })()}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha final
                      </label>
                      <input
                        type="date"
                        value={customDateRange.endDate}
                        onChange={(e) => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          const selectedDate = new Date(e.target.value);
                          const startDate = customDateRange.startDate ? new Date(customDateRange.startDate) : null;
                          
                          if (selectedDate < sixMonthsAgo) {
                            setDateError('La fecha final no puede ser mayor a 6 meses atrás');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          if (startDate && selectedDate < startDate) {
                            setDateError('La fecha final no puede ser anterior a la fecha inicial');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          setDateError('');
                          setCustomDateRange({...customDateRange, endDate: e.target.value});
                        }}
                        min={customDateRange.startDate || (() => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          return sixMonthsAgo.toISOString().split('T')[0];
                        })()}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Indicador de tipo de fecha */}
              {(statusFilter !== 'all' || dateFilter !== 'all') && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm text-blue-700 font-medium">
                      {statusFilter === 'completed' ? (
                        <>Mostrando servicios por <strong>fecha de finalización</strong> (cuando se completaron)</>
                      ) : statusFilter !== 'all' ? (
                        <>Mostrando servicios por <strong>fecha de creación</strong> (cuando se registraron)</>
                      ) : (
                        <>Mostrando todos los servicios por <strong>fecha de creación</strong></>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Tabla de servicios expandible */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-300 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cliente
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Dispositivo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Estado de Pago
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ganancia
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedServices.map((service) => (
                        <React.Fragment key={service.id}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">
                                <div className="text-xs text-gray-400 mb-1">Creado:</div>
                                <div className="mb-2">{formatDate(service.createdAt)}</div>
                                {service.status === 'completed' && service.completedAt && (
                                  <>
                                    <div className="text-xs text-blue-500 mb-1">Finalizado:</div>
                                    <div className="text-blue-600">{formatDate(service.completedAt)}</div>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <User className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-sm text-gray-900">
                                  {getCustomerName(service.customerId)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">
                                {service.deviceDetails || 'No especificado'}
                              </div>
                              <div className="text-sm text-gray-500">
                                {service.issue ? service.issue.substring(0, 50) + (service.issue.length > 50 ? '...' : '') : ''}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(service.status)}`}>
                                {getStatusText(service.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {(() => {
                                const paymentStatus = getPaymentStatus(service);
                                const { remainingBalance } = calculateRealTotals(service);
                                return (
                                  <div>
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                                      paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {paymentStatus === 'paid' ? 'Pagado' :
                                       paymentStatus === 'partial' ? 'Parcial' :
                                       'Pendiente'}
                                    </span>
                                    {remainingBalance > 0 && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        Debe: {formatCurrency(remainingBalance)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-gray-900">
                                {formatCurrency(calculateRealTotals(service).realTotal)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-green-600">
                                {formatCurrency(calculateRealTotals(service).realProfit)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedService(service);
                                    setShowDetails(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                                  title="Ver detalles"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleServiceExpansion(service.id);
                                  }}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-50 transition-colors"
                                  title={expandedServices.has(service.id) ? "Ocultar pagos" : "Ver pagos"}
                                >
                                  {expandedServices.has(service.id) ? 
                                    <ChevronUp className="h-4 w-4" /> : 
                                    <ChevronDown className="h-4 w-4" />
                                  }
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Fila expandida con detalles de pagos */}
                          {expandedServices.has(service.id) && (
                            <tr>
                              <td colSpan={8} className="px-6 py-4 bg-gray-50 border-t">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-medium text-gray-900">Historial de Pagos</h4>
                                    <div className="text-sm text-gray-600">
                                      {service.payments?.length || 0} pago(s) registrado(s)
                                    </div>
                                  </div>
                                  
                                  {service.payments && service.payments.length > 0 ? (
                                    <div className="space-y-2">
                                      {service.payments.map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between bg-white p-3 rounded border">
                                          <div className="flex items-center space-x-3">
                                            <div className="flex items-center space-x-2">
                                              {payment.paymentMethod === 'efectivo' ? <Banknote className="h-4 w-4 text-green-600" /> :
                                               payment.paymentMethod === 'transferencia' || payment.paymentMethod === 'tarjeta' ? <CreditCard className="h-4 w-4 text-blue-600" /> :
                                               <DollarSign className="h-4 w-4 text-purple-600" />}
                                              <span className="text-sm font-medium capitalize">{payment.paymentMethod}</span>
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              {formatDate(payment.paymentDate)}
                                            </div>
                                            {payment.notes && (
                                              <div className="text-xs text-gray-500 italic">
                                                {payment.notes}
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-sm font-semibold text-green-600">
                                            {formatCurrency(payment.amount)}
                                          </div>
                                        </div>
                                      ))}
                                      
                                      {/* Resumen de pagos */}
                                      <div className="flex justify-between items-center bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                                        <div className="flex items-center space-x-4">
                                          <div>
                                            <span className="text-sm text-gray-600">Total Pagado:</span>
                                            <p className="font-semibold text-green-600">{formatCurrency(calculateRealTotals(service).totalPaid)}</p>
                                          </div>
                                          <div>
                                            <span className="text-sm text-gray-600">Pendiente:</span>
                                            <p className="font-semibold text-orange-600">{formatCurrency(Math.max(0, calculateRealTotals(service).remainingBalance))}</p>
                                          </div>
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          {((calculateRealTotals(service).totalPaid / calculateRealTotals(service).realTotal) * 100).toFixed(1)}% completado
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-gray-500">
                                      <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>No hay pagos registrados para este servicio</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Mostrando{' '}
                          <span className="font-medium">{startIndex + 1}</span>
                          {' '}a{' '}
                          <span className="font-medium">
                            {Math.min(startIndex + itemsPerPage, totalServices)}
                          </span>
                          {' '}de{' '}
                          <span className="font-medium">{totalServices}</span>
                          {' '}servicios
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                page === currentPage
                                  ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                  : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Estado vacío */}
              {paginatedServices.length === 0 && (
                <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-300">
                  <div className="text-gray-400 mb-4">
                    <Settings className="h-12 w-12 mx-auto" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron servicios</h3>
                  <p className="text-gray-500">
                    {searchTerm || dateFilter !== 'today' || statusFilter !== 'all'
                      ? 'Intenta ajustar tus filtros de búsqueda.'
                      : 'No hay servicios técnicos registrados.'
                    }
                  </p>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'cashflow' && (
            <div className="space-y-6">
              {/* Rango de fechas actual para Flujo de Caja */}
              {(() => {
                const dateRange = getCurrentDateRange();
                return dateRange && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium text-green-900">
                        Mostrando flujo de caja desde el <strong>{dateRange.startDateFormatted}</strong> hasta el <strong>{dateRange.endDateFormatted}</strong>
                      </span>
                    </div>
                  </div>
                );
              })()}
              
              {/* Filtros de Fecha para Flujo de Caja */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Período
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="today">Hoy</option>
                    <option value="yesterday">Ayer</option>
                    <option value="thisWeek">Esta semana</option>
                    <option value="thisMonth">Este mes</option>
                    <option value="lastMonth">Mes pasado</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                
                {/* Error de fechas en cashflow */}
                {dateError && (
                  <div className="col-span-full p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{dateError}</p>
                  </div>
                )}
                
                {dateFilter === 'custom' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha inicial
                      </label>
                      <input
                        type="date"
                        value={customDateRange.startDate}
                        onChange={(e) => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          const selectedDate = new Date(e.target.value);
                          
                          if (selectedDate < sixMonthsAgo) {
                            setDateError('La fecha inicial no puede ser mayor a 6 meses atrás');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          setDateError('');
                          setCustomDateRange({...customDateRange, startDate: e.target.value});
                        }}
                        min={(() => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          return sixMonthsAgo.toISOString().split('T')[0];
                        })()}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha final
                      </label>
                      <input
                        type="date"
                        value={customDateRange.endDate}
                        onChange={(e) => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          const selectedDate = new Date(e.target.value);
                          const startDate = customDateRange.startDate ? new Date(customDateRange.startDate) : null;
                          
                          if (selectedDate < sixMonthsAgo) {
                            setDateError('La fecha final no puede ser mayor a 6 meses atrás');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          if (startDate && selectedDate < startDate) {
                            setDateError('La fecha final no puede ser anterior a la fecha inicial');
                            setTimeout(() => setDateError(''), 3000);
                            return;
                          }
                          
                          setDateError('');
                          setCustomDateRange({...customDateRange, endDate: e.target.value});
                        }}
                        min={customDateRange.startDate || (() => {
                          const today = new Date();
                          const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
                          return sixMonthsAgo.toISOString().split('T')[0];
                        })()}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Flujo de Caja del Período */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                      <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
                      Flujo de Caja - {dateFilter === 'today' ? 'Hoy' : 
                                      dateFilter === 'yesterday' ? 'Ayer' : 
                                      dateFilter === 'thisWeek' ? 'Esta Semana' :
                                      dateFilter === 'thisMonth' ? 'Este Mes' :
                                      dateFilter === 'lastMonth' ? 'Mes Pasado' :
                                      dateFilter === 'custom' ? 'Período Personalizado' : 'Período Seleccionado'}
                    </h2>
                    <p className="text-sm text-gray-600">Dinero recibido en servicios técnicos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(cashFlowStats.totalCashReceived)}</p>
                    <p className="text-sm text-gray-600">{cashFlowStats.totalPayments} pago(s)</p>
                  </div>
                </div>

                {/* Desglose por método de pago */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {Object.entries(cashFlowStats.paymentsByMethod).map(([method, amount]) => (
                    <div key={method} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center space-x-2 mb-1">
                        {method === 'efectivo' ? <Banknote className="h-4 w-4 text-green-600" /> :
                         method === 'transferencia' || method === 'tarjeta' ? <CreditCard className="h-4 w-4 text-blue-600" /> :
                         <DollarSign className="h-4 w-4 text-purple-600" />}
                        <span className="text-sm font-medium text-gray-700 capitalize">{method}</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(amount)}</p>
                    </div>
                  ))}
                </div>

                {/* Lista de pagos del período */}
                {cashFlowStats.paymentsInRange.length > 0 ? (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="font-medium text-gray-900 mb-3">Detalle de Pagos Recibidos</h3>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {cashFlowStats.paymentsInRange.map((payment) => (
                        <div key={`${payment.serviceId}-${payment.id}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              {payment.paymentMethod === 'efectivo' ? <Banknote className="h-4 w-4 text-green-600" /> :
                               payment.paymentMethod === 'transferencia' || payment.paymentMethod === 'tarjeta' ? <CreditCard className="h-4 w-4 text-blue-600" /> :
                               <DollarSign className="h-4 w-4 text-purple-600" />}
                              <span className="text-sm font-medium capitalize">{payment.paymentMethod}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {payment.customerName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(payment.paymentDate)}
                            </div>
                            {payment.notes && (
                              <div className="text-xs text-gray-400 italic">
                                {payment.notes}
                              </div>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-green-600">
                            {formatCurrency(payment.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-8 border border-gray-200 text-center">
                    <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No hay pagos en este período</h3>
                    <p className="text-gray-500">No se registraron pagos para el período seleccionado</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalles */}
      {showDetails && selectedService && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowDetails(false)}></div>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Detalles del Servicio</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-sm font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        ID: {selectedService.id}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(selectedService.id)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                        title="Copiar ID"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"></path>
                          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Cliente</p>
                      <p className="text-sm text-gray-900">{getCustomerName(selectedService.customerId)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Estado</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedService.status)}`}>
                        {getStatusText(selectedService.status)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-600">Dispositivo</p>
                    <p className="text-sm text-gray-900">{selectedService.deviceDetails || 'No especificado'}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-600">Problema reportado</p>
                    <p className="text-sm text-gray-900">{selectedService.issue || 'No especificado'}</p>
                  </div>

                  {selectedService.diagnosis && (
                    <div>
                      <p className="text-sm font-medium text-gray-600">Diagnóstico</p>
                      <p className="text-sm text-gray-900">{selectedService.diagnosis}</p>
                    </div>
                  )}

                  {/* Repuestos del servicio */}
                  {selectedService.items && selectedService.items.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium text-gray-600 mb-3">Repuestos utilizados</p>
                      <div className="space-y-2">
                        {selectedService.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{item.partName}</p>
                              {item.partDescription && (
                                <p className="text-xs text-gray-600">{item.partDescription}</p>
                              )}
                              <p className="text-xs text-gray-500">
                                Cantidad: {item.quantity} | Costo unitario: {formatCurrency(item.partCost)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {formatCurrency(item.totalCost)}
                              </p>
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                item.status === 'instalado' ? 'bg-green-100 text-green-800' : 
                                item.status === 'en_tienda' ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.status === 'instalado' ? 'Instalado' : 
                                 item.status === 'en_tienda' ? 'En tienda' : 
                                 'Solicitado'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cortesías del servicio */}
                  {selectedService.courtesyItems && selectedService.courtesyItems.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium text-gray-600 mb-3 flex items-center">
                        <Gift className="h-4 w-4 text-cyan-600 mr-2" />
                        Cortesías
                      </p>
                      <div className="space-y-2">
                        {selectedService.courtesyItems.map((item, index) => (
                          <div key={index} className="flex justify-between items-center bg-cyan-50 p-3 rounded border border-cyan-200">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                              <p className="text-xs text-gray-500">
                                Cantidad: {item.quantity} | Valor: {formatCurrency(item.normalPrice)}
                              </p>
                              {item.reason && (
                                <p className="text-xs text-gray-600 italic mt-1">Motivo: {item.reason}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-cyan-600">
                                {formatCurrency(item.totalValue)}
                              </p>
                              <p className="text-xs text-red-600">
                                Costo: -{formatCurrency(item.totalCost)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Desglose financiero */}
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium text-gray-600 mb-3">Resumen Financiero</p>
                    {(() => {
                      const { realTotal, realCost, realProfit } = calculateRealTotals(selectedService);
                      const partsCost = selectedService.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
                      const laborCost = (selectedService as any).laborCost || 0;
                      const hasCourtesies = selectedService.courtesyItems && selectedService.courtesyItems.length > 0;
                      const courtesyTotalValue = selectedService.courtesyTotalValue || 0;
                      const courtesyTotalCost = selectedService.courtesyTotalCost || 0;

                      // Calcular ganancia real si hay cortesías
                      const finalProfit = hasCourtesies ? (realProfit - courtesyTotalCost) : realProfit;
                      const finalCost = hasCourtesies ? (realCost + courtesyTotalCost) : realCost;
                      const isLoss = finalProfit < 0;

                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded">
                            <div>
                              <span className="text-gray-600">Repuestos:</span>
                              <p className="font-medium">{formatCurrency(partsCost)}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Mano de Obra:</span>
                              <p className="font-medium">{formatCurrency(laborCost)}</p>
                            </div>
                          </div>

                          {/* Mostrar cortesías en el resumen si existen */}
                          {hasCourtesies && (
                            <div className="bg-cyan-50 p-3 rounded border border-cyan-200 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-cyan-700 flex items-center">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Valor cortesías regaladas:
                                </span>
                                <span className="font-medium text-cyan-700">{formatCurrency(courtesyTotalValue)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-red-600 flex items-center">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Costo cortesías:
                                </span>
                                <span className="font-medium text-red-600">-{formatCurrency(courtesyTotalCost)}</span>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                            <div>
                              <p className="text-sm font-medium text-gray-600">Total</p>
                              <p className="text-lg font-bold text-gray-900">{formatCurrency(realTotal)}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">{hasCourtesies ? 'Costo Real' : 'Costo'}</p>
                              <p className="text-lg font-semibold text-red-600">{formatCurrency(finalCost)}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-600">{hasCourtesies ? (isLoss ? 'Pérdida Real' : 'Ganancia Real') : 'Ganancia'}</p>
                              <p className={`text-lg font-bold ${isLoss ? 'text-red-600' : 'text-green-600'}`}>
                                {isLoss ? '' : '+'}{formatCurrency(finalProfit)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}