import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Calendar, 
  Search, 
  Filter,
  CreditCard,
  Banknote,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  Eye,
  Download,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectTechnicalServices, selectCustomers } from '../store/selectors';
import { TechnicalService, TechnicalServicePayment, Customer } from '../types';
import { formatCurrency } from '../utils/currency';
import { useSectionRealtime } from '../hooks/useOnDemandData';

// Utilidad para convertir cualquier valor de fecha Firestore/JS a Date válido
function getValidDate(date: any): Date | null {
  if (!date) return null;
  if (typeof date.toDate === 'function') return date.toDate();
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

// Interfaz para pagos expandidos con información del servicio
interface ExpandedPayment extends TechnicalServicePayment {
  serviceId: string;
  serviceTotalAmount: number;
  customerName: string;
  customerPhone?: string;
  techniquePersonName?: string;
}

export function TechnicalServicePayments() {
  useSectionRealtime('technicalServices');
  
  // Estados para filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<ExpandedPayment | null>(null);
  
  const itemsPerPage = 20;
  
  // Datos desde Redux store
  const technicalServices = useAppSelector(selectTechnicalServices);
  const customers = useAppSelector(selectCustomers);
  
  // Convertir servicios técnicos en lista de pagos expandidos
  const allPayments = useMemo(() => {
    const payments: ExpandedPayment[] = [];
    
    technicalServices.forEach(service => {
      const customer = customers.find(c => c.id === service.customerId);
      
      service.payments.forEach(payment => {
        payments.push({
          ...payment,
          serviceId: service.id,
          serviceTotalAmount: service.totalAmount,
          customerName: customer?.name || service.customerName,
          customerPhone: customer?.phone || service.customerPhone,
          techniquePersonName: service.salesPersonName
        });
      });
    });
    
    return payments;
  }, [technicalServices, customers]);
  
  // Filtrar pagos
  const filteredPayments = useMemo(() => {
    let filtered = allPayments;
    
    // Filtro por texto
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(payment => 
        payment.customerName.toLowerCase().includes(term) ||
        payment.notes?.toLowerCase().includes(term) ||
        payment.techniquePersonName?.toLowerCase().includes(term)
      );
    }
    
    // Filtro por fecha de pago
    if (dateFilter !== 'all') {
      const today = new Date();
      const todayStr = today.toDateString();
      
      filtered = filtered.filter(payment => {
        const paymentDate = getValidDate(payment.paymentDate);
        if (!paymentDate) return false;
        
        switch (dateFilter) {
          case 'today':
            return paymentDate.toDateString() === todayStr;
          case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return paymentDate.toDateString() === yesterday.toDateString();
          case 'thisWeek':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            return paymentDate >= weekStart;
          case 'thisMonth':
            return paymentDate.getMonth() === today.getMonth() && 
                   paymentDate.getFullYear() === today.getFullYear();
          case 'custom':
            if (customDateRange.startDate && customDateRange.endDate) {
              const start = new Date(customDateRange.startDate);
              const end = new Date(customDateRange.endDate);
              return paymentDate >= start && paymentDate <= end;
            }
            return true;
          default:
            return true;
        }
      });
    }
    
    // Filtro por método de pago
    if (paymentMethodFilter !== 'all') {
      filtered = filtered.filter(payment => payment.paymentMethod === paymentMethodFilter);
    }
    
    return filtered;
  }, [allPayments, searchTerm, dateFilter, customDateRange, paymentMethodFilter]);
  
  // Ordenar pagos
  const sortedPayments = useMemo(() => {
    const sorted = [...filteredPayments].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'date':
          aValue = getValidDate(a.paymentDate)?.getTime() || 0;
          bValue = getValidDate(b.paymentDate)?.getTime() || 0;
          break;
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'customer':
          aValue = a.customerName.toLowerCase();
          bValue = b.customerName.toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return sorted;
  }, [filteredPayments, sortBy, sortOrder]);
  
  // Paginación
  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage);
  const paginatedPayments = sortedPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  // Estadísticas de los pagos filtrados
  const stats = useMemo(() => {
    const totalAmount = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const paymentsByMethod = filteredPayments.reduce((acc, payment) => {
      acc[payment.paymentMethod] = (acc[payment.paymentMethod] || 0) + payment.amount;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalPayments: filteredPayments.length,
      totalAmount,
      averagePayment: filteredPayments.length > 0 ? totalAmount / filteredPayments.length : 0,
      paymentsByMethod
    };
  }, [filteredPayments]);
  
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
  
  // Función para obtener icono del método de pago
  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'efectivo':
        return <Banknote className="h-4 w-4" />;
      case 'transferencia':
        return <ArrowUpRight className="h-4 w-4" />;
      case 'tarjeta':
        return <CreditCard className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };
  
  // Función para obtener color del método de pago
  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'efectivo':
        return 'text-green-600 bg-green-50';
      case 'transferencia':
        return 'text-blue-600 bg-blue-50';
      case 'tarjeta':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-600" />
            Reporte de Pagos - Servicios Técnicos
          </h1>
          <p className="text-gray-600 mt-1">
            Flujo de caja real por fecha de pagos
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>
      </div>
      
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Pagos</p>
              <p className="text-xl font-semibold text-gray-900">{stats.totalPayments}</p>
            </div>
            <Receipt className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Ingresos</p>
              <p className="text-xl font-semibold text-green-600">{formatCurrency(stats.totalAmount)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pago Promedio</p>
              <p className="text-xl font-semibold text-blue-600">{formatCurrency(stats.averagePayment)}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Efectivo</p>
              <p className="text-xl font-semibold text-green-600">
                {formatCurrency(stats.paymentsByMethod.efectivo || 0)}
              </p>
            </div>
            <Banknote className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>
      
      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cliente, técnico, notas..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Filtro por fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Período
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="thisWeek">Esta semana</option>
              <option value="thisMonth">Este mes</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          
          {/* Método de pago */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Método de Pago
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="crédito">Crédito</option>
            </select>
          </div>
          
          {/* Ordenar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ordenar por
            </label>
            <div className="flex gap-2">
              <select
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="date">Fecha</option>
                <option value="amount">Monto</option>
                <option value="customer">Cliente</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Rango de fechas personalizado */}
        {dateFilter === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha inicial
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={customDateRange.startDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha final
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={customDateRange.endDate}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Tabla de pagos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha del Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Método
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Técnico
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notas
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">
                        {formatDate(payment.paymentDate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {payment.customerName}
                      </div>
                      {payment.customerPhone && (
                        <div className="text-sm text-gray-500">
                          {payment.customerPhone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(payment.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodColor(payment.paymentMethod)}`}>
                      {getPaymentMethodIcon(payment.paymentMethod)}
                      {payment.paymentMethod}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">
                      {payment.techniquePersonName || 'No asignado'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {payment.notes || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => setSelectedPayment(payment)}
                      className="text-blue-600 hover:text-blue-900 transition-colors"
                      title="Ver detalles"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {paginatedPayments.length === 0 && (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay pagos registrados
            </h3>
            <p className="text-gray-600">
              Ajusta los filtros para ver más resultados
            </p>
          </div>
        )}
        
        {/* Paginación */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, sortedPayments.length)} de {sortedPayments.length} pagos
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Anterior
                </button>
                <span className="px-3 py-2 text-sm text-gray-700">
                  {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Modal de detalles del pago */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Detalles del Pago
              </h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Cliente</label>
                <p className="text-sm text-gray-900">{selectedPayment.customerName}</p>
                {selectedPayment.customerPhone && (
                  <p className="text-sm text-gray-500">{selectedPayment.customerPhone}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha del Pago</label>
                <p className="text-sm text-gray-900">{formatDate(selectedPayment.paymentDate)}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Monto</label>
                <p className="text-lg font-semibold text-green-600">{formatCurrency(selectedPayment.amount)}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Método de Pago</label>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getPaymentMethodColor(selectedPayment.paymentMethod)}`}>
                  {getPaymentMethodIcon(selectedPayment.paymentMethod)}
                  {selectedPayment.paymentMethod}
                </div>
              </div>
              
              {selectedPayment.techniquePersonName && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Técnico</label>
                  <p className="text-sm text-gray-900">{selectedPayment.techniquePersonName}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Total del Servicio</label>
                <p className="text-sm text-gray-900">{formatCurrency(selectedPayment.serviceTotalAmount)}</p>
              </div>
              
              {selectedPayment.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notas</label>
                  <p className="text-sm text-gray-900">{selectedPayment.notes}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}