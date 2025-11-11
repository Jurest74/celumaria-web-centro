import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar,
  Users,
  Gift,
  X,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  ArrowUpRight
} from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { selectCustomers, selectLayaways, selectSales } from '../store/selectors';
import { customersService } from '../services/firebase/firestore';
import { usePaginatedCustomers } from '../hooks/usePaginatedCustomers';
import { useNotification } from '../contexts/NotificationContext';
import { useSectionRealtime } from '../hooks/useOnDemandData';
import { Customer } from '../types';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';
import { useCustomerSalesStats } from '../hooks/useCustomerSalesStats';
import { 
  isBirthdayToday, 
  isUpcomingBirthday, 
  calculateAge, 
  formatDisplayDate, 
  formatInputDate 
} from '../utils/dateUtils';
import { 
  validateCustomerData, 
  sanitizeText, 
  formatPhoneNumber, 
  formatEmail,
  ValidationError 
} from '../utils/validation';

export function Customers() {
  // ⚡ OPTIMIZADO: NO usar listeners - datos se cargan al navegar
  const allCustomers = useAppSelector(selectCustomers);
  const layaways = useAppSelector(selectLayaways);
  const sales = useAppSelector(selectSales);
  const { showSuccess, showError, showWarning, showConfirm } = useNotification();
  const { user } = useAuth();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<ValidationError[]>([]);
  const [operationLoading, setOperationLoading] = useState<{ [key: string]: boolean }>({});
  const [birthdayFilter, setBirthdayFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [salesFilter, setSalesFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'none'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedCustomerForStats, setSelectedCustomerForStats] = useState<Customer | null>(null);
  const itemsPerPage = 10;

  const formRef = useRef<HTMLFormElement>(null);

  // Helper function to calculate sales count for last 30 days per customer
  const getSalesCountForCustomer = useCallback((customerId: string) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return sales.filter(sale => {
      if (sale.customerId !== customerId) return false;
      const saleDate = new Date(sale.createdAt);
      return saleDate >= thirtyDaysAgo;
    }).length;
  }, [sales]);

  // Hook paginado (clientes de la página actual)
  const {
    customers: rawPaginatedCustomers,
    loading,
    error,
    currentPage,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    setPage,
    refetch
  } = usePaginatedCustomers({
    searchTerm,
    birthdayFilter,
    sortBy,
    sortOrder,
    itemsPerPage
  });

  // Apply sales filter to paginated results
  const paginatedCustomers = useMemo(() => {
    if (salesFilter === 'all') return rawPaginatedCustomers;
    
    return rawPaginatedCustomers.filter(customer => {
      const salesCount = getSalesCountForCustomer(customer.id);
      switch (salesFilter) {
        case 'high': return salesCount >= 5;
        case 'medium': return salesCount >= 2 && salesCount < 5;
        case 'low': return salesCount === 1;
        case 'none': return salesCount === 0;
        default: return true;
      }
    });
  }, [rawPaginatedCustomers, getSalesCountForCustomer, salesFilter]);

  const handleSort = useCallback((field: 'name' | 'createdAt') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder]);

  // Memoized statistics calculations
  const customerStats = useMemo(() => ({
    total: allCustomers.length,
    birthdaysToday: allCustomers.filter(c => isBirthdayToday(c.birthDate || '')).length,
    withEmail: allCustomers.filter(c => c.email).length,
    withPhone: allCustomers.filter(c => c.phone).length
  }), [allCustomers]);

  // Helper for operation loading states
  const setOperationLoadingState = useCallback((id: string, loading: boolean) => {
    setOperationLoading(prev => ({ ...prev, [id]: loading }));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setFormErrors([]);
    
    try {
      const formData = new FormData(e.currentTarget);
      
      // Extraer y sanitizar datos
      const rawData = {
        name: sanitizeText(formData.get('name') as string || ''),
        phone: formData.get('phone') as string || '',
        email: formData.get('email') as string || '',
        address: sanitizeText(formData.get('address') as string || ''),
        birthDate: formData.get('birthDate') as string || '',
        notes: sanitizeText(formData.get('notes') as string || '')
      };

      // Formatear datos
      const customerData: any = {
        name: rawData.name
      };

      if (rawData.phone.trim()) {
        customerData.phone = formatPhoneNumber(rawData.phone.trim());
      }

      if (rawData.email.trim()) {
        customerData.email = formatEmail(rawData.email.trim());
      }

      if (rawData.address.trim()) {
        customerData.address = rawData.address.trim();
      }

      if (rawData.birthDate.trim()) {
        customerData.birthDate = rawData.birthDate.trim();
      }

      if (rawData.notes.trim()) {
        customerData.notes = rawData.notes.trim();
      }

      // Validar datos
      const validation = validateCustomerData(customerData);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        setIsLoading(false);
        showError('Error de validación', 'Por favor corrige los errores en el formulario');
        return;
      }
      if (editingCustomer) {
        await customersService.update(editingCustomer.id, customerData);
        formRef.current?.reset();
        setEditingCustomer(null);
        setShowAddForm(false);
        refetch(); // Actualizar la lista paginada
        showSuccess(
          'Cliente actualizado',
          `El cliente "${customerData.name}" se actualizó correctamente`
        );
      } else {
        await customersService.add(customerData);
        formRef.current?.reset();
        setShowAddForm(false);
        refetch(); // Actualizar la lista paginada
        showSuccess(
          'Cliente creado',
          `El cliente "${customerData.name}" se creó correctamente`
        );
      }
    } catch (error) {
      let errorMessage = 'Error desconocido al guardar el cliente';
      if (error instanceof Error) {
        if (error.message.includes('permission-denied')) {
          errorMessage = 'No tienes permisos para guardar clientes. Verifica que estés logueado como administrador.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
        } else if (error.message.includes('quota-exceeded')) {
          errorMessage = 'Se ha excedido la cuota de Firebase. Intenta más tarde.';
        } else {
          errorMessage = error.message;
        }
      }
      showError('Error al guardar cliente', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = useCallback(async (customer: Customer) => {
    // Verifica si el cliente tiene layaways activos
    const customerLayaways = layaways.filter(layaway => 
      layaway.customerId === customer.id && layaway.status === 'active'
    );
    
    if (customerLayaways.length > 0) {
      showWarning(
        'No se puede eliminar',
        `No se puede eliminar este cliente porque tiene ${customerLayaways.length} plan(es) separe activo(s).`
      );
      return;
    }
    
    showConfirm(
      'Confirmar eliminación',
      `¿Estás seguro de que quieres eliminar al cliente "${customer.name}"? Esta acción no se puede deshacer.`,
      async () => {
        const deleteId = `delete-${customer.id}`;
        setOperationLoadingState(deleteId, true);
        try {
          await customersService.delete(customer.id);
          refetch(); // Actualizar la lista paginada
          showSuccess(
            'Cliente eliminado',
            `El cliente "${customer.name}" se eliminó correctamente`
          );
        } catch (error) {
          console.error('Error deleting customer:', error);
          showError(
            'Error al eliminar',
            'No se pudo eliminar el cliente. Inténtalo de nuevo.'
          );
        } finally {
          setOperationLoadingState(deleteId, false);
        }
      }
    );
  }, [layaways, refetch, showWarning, showConfirm, showSuccess, showError, setOperationLoadingState]);


  const formatCreatedAt = (createdAt: string | undefined) => {
    if (!createdAt) return 'Sin fecha';
    
    try {
      const date = new Date(createdAt);
      if (isNaN(date.getTime())) {
        return 'Sin fecha';
      }
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Sin fecha';
    }
  };

  const startEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowAddForm(true);
  };

  const cancelEdit = () => {
    setEditingCustomer(null);
    setShowAddForm(false);
  };

  useEffect(() => {
    // Notificación de cumpleaños movida a Dashboard
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h1>
            <p className="text-gray-600 mt-1">Administra la base de datos de clientes y su información</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <UserPlus className="h-5 w-5" />
              <span>Agregar Cliente</span>
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas - Hidden when creating/editing */}
      {!showAddForm && !editingCustomer && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-1">
              <div className="w-5 h-5 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                <Users className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
              </div>
              <ArrowUpRight className="w-2 h-2 text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Total Clientes
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                {customerStats.total}
              </p>
            </div>
          </div>
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-1">
              <div className="w-5 h-5 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
                <Gift className="w-3 h-3 text-green-600 group-hover:text-green-700" />
              </div>
              <ArrowUpRight className="w-2 h-2 text-green-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Cumpleaños Hoy
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">
                {customerStats.birthdaysToday}
              </p>
            </div>
          </div>
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-1">
              <div className="w-5 h-5 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
                <Mail className="w-3 h-3 text-purple-600 group-hover:text-purple-700" />
              </div>
              <ArrowUpRight className="w-2 h-2 text-purple-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Con Email
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">
                {customerStats.withEmail}
              </p>
            </div>
          </div>
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-1">
              <div className="w-5 h-5 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
                <Phone className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
              </div>
              <ArrowUpRight className="w-2 h-2 text-orange-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Con Teléfono
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-orange-900 transition-colors duration-300">
                {customerStats.withPhone}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search y filtro de cumpleaños - Hidden when creating/editing */}
      {!showAddForm && !editingCustomer && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:space-x-4 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar clientes por nombre, teléfono o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="birthday-filter" className="text-sm text-gray-700 font-medium">Cumpleaños:</label>
              <select
                id="birthday-filter"
                value={birthdayFilter}
                onChange={e => setBirthdayFilter(e.target.value as any)}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">Todos</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="sales-filter" className="text-sm text-gray-700 font-medium">Ventas (30 días):</label>
              <select
                id="sales-filter"
                value={salesFilter}
                onChange={e => setSalesFilter(e.target.value as any)}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="all">Todos</option>
                <option value="high">Altas (5+)</option>
                <option value="medium">Medias (2-4)</option>
                <option value="low">Bajas (1)</option>
                <option value="none">Sin ventas (0)</option>
              </select>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Add/Edit Customer Form */}
      {(showAddForm || editingCustomer) && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingCustomer ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}
            </h3>
            <button
              onClick={cancelEdit}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          {/* Error display */}
          {formErrors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-600">
                <p className="font-medium mb-1">Por favor corrige los siguientes errores:</p>
                <ul className="list-disc list-inside space-y-1">
                  {formErrors.map((error, index) => (
                    <li key={index}>{error.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                name="name"
                defaultValue={editingCustomer?.name || ''}
                required
                maxLength={100}
                disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                  formErrors.some(e => e.field === 'name') 
                    ? 'border-red-300 bg-red-50' 
                    : 'border-gray-300'
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                name="phone"
                defaultValue={editingCustomer?.phone || ''}
                maxLength={10}
                disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                  formErrors.some(e => e.field === 'phone') 
                    ? 'border-red-300 bg-red-50' 
                    : 'border-gray-300'
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                defaultValue={editingCustomer?.email || ''}
                placeholder="cliente@ejemplo.com"
                maxLength={254}
                disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 ${
                  formErrors.some(e => e.field === 'email') 
                    ? 'border-red-300 bg-red-50' 
                    : 'border-gray-300'
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Nacimiento
              </label>
              <input
                type="date"
                name="birthDate"
                defaultValue={editingCustomer?.birthDate ? formatInputDate(editingCustomer.birthDate) : ''}
                max={new Date().toISOString().split('T')[0]}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <input
                type="text"
                name="address"
                defaultValue={editingCustomer?.address || ''}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notas
              </label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={editingCustomer?.notes || ''}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            
            <div className="md:col-span-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                <span>
                  {isLoading ? 'Guardando...' : editingCustomer ? 'Actualizar Cliente' : 'Agregar Cliente'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cards para móviles - Hidden when creating/editing */}
      {!showAddForm && !editingCustomer && (
        <div className="grid gap-3 sm:hidden">
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando clientes...</p>
          </div>
        )}
        {!loading && paginatedCustomers.map((customer) => {
          const age = customer.birthDate ? calculateAge(customer.birthDate) : null;
          const hasUpcomingBirthday = customer.birthDate ? isUpcomingBirthday(customer.birthDate) : false;
          
          return (
            <div key={customer.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-base font-semibold text-gray-900">{customer.name}</h3>
                    {age && customer.birthDate && (
                      <div className="text-sm text-gray-500 flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {age} años
                        {hasUpcomingBirthday && (
                          <Gift className="h-3 w-3 ml-2 text-orange-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => {
                      setSelectedCustomerForStats(customer);
                      setShowStatsModal(true);
                    }}
                    className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 transition-colors"
                    title="Ver información del cliente"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => startEdit(customer)}
                    className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                    title="Editar cliente"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(customer)}
                    className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Eliminar cliente"
                    disabled={operationLoading[`delete-${customer.id}`]}
                  >
                    {operationLoading[`delete-${customer.id}`] ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              
              <div className="space-y-1 text-sm">
                {customer.phone && (
                  <div className="flex items-center text-gray-600">
                    <Phone className="h-3 w-3 mr-1" />
                    {customer.phone}
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center text-gray-600">
                    <Mail className="h-3 w-3 mr-1" />
                    {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-center text-gray-600">
                    <MapPin className="h-3 w-3 mr-1" />
                    {customer.address}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Tabla para pantallas mayores - Hidden when creating/editing */}
      {!showAddForm && !editingCustomer && (
        <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Cargando clientes...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cumpleaños</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventas (30 días)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo a favor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedCustomers.map((customer) => {
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                            {customer.notes && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">{customer.notes}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap ${isBirthdayToday(customer.birthDate || '') ? 'bg-yellow-100 font-bold' : ''}`}>
                        <div className={`text-sm flex items-center ${isBirthdayToday(customer.birthDate || '') ? 'text-orange-700' : 'text-gray-900'}`}>
                          {customer.birthDate ? (
                            <>
                              {(() => {
                                const birth = new Date(customer.birthDate);
                                const day = birth.getUTCDate();
                                const month = birth.toLocaleString('es-ES', { month: 'long', timeZone: 'UTC' });
                                return `${day} de ${month}`;
                              })()}
                              {isBirthdayToday(customer.birthDate || '') && (
                                <span className="ml-2 flex items-center" title="¡Hoy es su cumpleaños!">
                                  <Gift className="h-4 w-4 text-orange-500" />
                                </span>
                              )}
                              {!isBirthdayToday(customer.birthDate || '') && isUpcomingBirthday(customer.birthDate || '') && (
                                <span className="ml-2 flex items-center" title="Cumpleaños pronto">
                                  <Gift className="h-4 w-4 text-yellow-500" />
                                </span>
                              )}
                            </>
                          ) : <span className="text-gray-400">-</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-green-600">
                          {getSalesCountForCustomer(customer.id)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-blue-600">
                          {typeof customer.credit === 'number' ? formatCurrency(customer.credit) : formatCurrency(0)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedCustomerForStats(customer);
                              setShowStatsModal(true);
                            }}
                            className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 transition-colors"
                            title="Ver información del cliente"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => startEdit(customer)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                            title="Editar cliente"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer)}
                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Eliminar cliente"
                            disabled={operationLoading[`delete-${customer.id}`]}
                          >
                            {operationLoading[`delete-${customer.id}`] ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
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
                Página <span className="font-medium">{currentPage}</span>
                {paginatedCustomers.length > 0 && (
                  <span> - Mostrando {paginatedCustomers.length} cliente{paginatedCustomers.length !== 1 ? 's' : ''}</span>
                )}
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

      {/* Detalles del Cliente (Modal) */}
      {editingCustomer && !showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Detalles del Cliente</h3>
                <button
                  onClick={cancelEdit}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-gray-600">Nombre:</span>
                  <p className="font-medium">{editingCustomer.name}</p>
                </div>
                {editingCustomer.phone && (
                  <div>
                    <span className="text-gray-600">Teléfono:</span>
                    <p className="font-medium">{editingCustomer.phone}</p>
                  </div>
                )}
                {editingCustomer.email && (
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-medium">{editingCustomer.email}</p>
                  </div>
                )}
                {editingCustomer.address && (
                  <div>
                    <span className="text-gray-600">Dirección:</span>
                    <p className="font-medium">{editingCustomer.address}</p>
                  </div>
                )}
                {editingCustomer.birthDate && (
                  <div>
                    <span className="text-gray-600">Fecha de nacimiento:</span>
                    <p className="font-medium">
                      {formatDisplayDate(editingCustomer.birthDate)}
                      {calculateAge(editingCustomer.birthDate) && (
                        <span className="text-gray-500 ml-2">
                          ({calculateAge(editingCustomer.birthDate)} años)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Saldo a favor:</span>
                  <p className="font-medium text-blue-600">{formatCurrency(editingCustomer.credit || 0)}</p>
                </div>
                {editingCustomer.notes && (
                  <div>
                    <span className="text-gray-600">Notas:</span>
                    <p className="font-medium">{editingCustomer.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && paginatedCustomers.length === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <div className="text-gray-400 mb-4">
            <Users className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron clientes</h3>
          <p className="text-gray-500">
            {searchTerm || birthdayFilter !== 'all'
              ? 'Intenta ajustar tus filtros de búsqueda.'
              : 'Comienza agregando tu primer cliente.'
            }
          </p>
        </div>
      )}

      {/* Modal de Estadísticas del Cliente */}
      {showStatsModal && selectedCustomerForStats && (
        <CustomerStatsModal 
          customer={selectedCustomerForStats}
          onClose={() => {
            setShowStatsModal(false);
            setSelectedCustomerForStats(null);
          }}
          onCustomerUpdated={refetch}
        />
      )}
    </div>
  );
}

// Componente Modal Completo del Cliente
function CustomerStatsModal({ customer, onClose, onCustomerUpdated }: { 
  customer: Customer; 
  onClose: () => void;
  onCustomerUpdated?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'stats'>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);
  const [editingCustomer, setEditingCustomer] = useState<Customer>(customer);
  const [dateFilter, setDateFilter] = useState<'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear' | 'lastYear' | 'allTime'>('allTime');
  const [isLoading, setIsLoading] = useState(false);
  const { showSuccess, showError } = useNotification();

  // Actualizar el cliente cuando cambien las props
  React.useEffect(() => {
    setCurrentCustomer(customer);
    setEditingCustomer(customer);
  }, [customer]);
  
  const { 
    totalSales, 
    totalProfit, 
    transactionCount, 
    averageTransaction, 
    bestMonth, 
    bestDay, 
    monthlyData,
    yearlyData,
    allTimeRanking,
    loading: statsLoading, 
    error: statsError 
  } = useCustomerSalesStats({ 
    customerId: customer.id, 
    dateFilter 
  });

  // Función para guardar cambios del cliente
  const handleSaveCustomer = async () => {
    setIsLoading(true);
    try {
      // Validar datos
      const validation = validateCustomerData(editingCustomer);
      if (!validation.isValid) {
        showError(validation.errors[0].message);
        return;
      }

      // Sanitizar datos
      const sanitizedCustomer = {
        ...editingCustomer,
        name: sanitizeText(editingCustomer.name),
        phone: editingCustomer.phone ? formatPhoneNumber(editingCustomer.phone) : '',
        email: editingCustomer.email ? formatEmail(editingCustomer.email) : '',
        address: editingCustomer.address ? sanitizeText(editingCustomer.address) : '',
        notes: editingCustomer.notes ? sanitizeText(editingCustomer.notes) : '',
        updatedAt: new Date().toISOString()
      };

      await customersService.update(customer.id, sanitizedCustomer);
      
      // Actualizar el estado local del cliente
      setCurrentCustomer(sanitizedCustomer);
      
      showSuccess('Cliente actualizado correctamente');
      setIsEditing(false);
      
      // Notificar al componente padre para refrescar la lista
      if (onCustomerUpdated) {
        onCustomerUpdated();
      }
    } catch (error: any) {
      showError(error.message || 'Error al actualizar el cliente');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('es-CO', { 
      year: 'numeric', 
      month: 'long' 
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[90vh] overflow-y-auto">
          
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{currentCustomer.name}</h3>
                  <p className="text-sm text-gray-500">
                    Cliente desde {formatDisplayDate(currentCustomer.createdAt)}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'info'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span>Información del Cliente</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'stats'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Eye className="h-4 w-4" />
                    <span>Estadísticas de Ventas</span>
                  </div>
                </button>
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            {activeTab === 'info' ? (
              /* Pestaña de Información del Cliente */
              <div className="space-y-6">
                {/* Botón de editar */}
                <div className="flex justify-end">
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Editar Información
                    </button>
                  ) : (
                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditingCustomer(currentCustomer);
                        }}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveCustomer}
                        disabled={isLoading}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            Guardar Cambios
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Formulario de información */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Nombre */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Completo *
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingCustomer.name}
                        onChange={(e) => setEditingCustomer({...editingCustomer, name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Ingresa el nombre completo"
                      />
                    ) : (
                      <p className="text-gray-900 font-medium">{currentCustomer.name}</p>
                    )}
                  </div>

                  {/* Teléfono */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono
                    </label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={editingCustomer.phone || ''}
                        onChange={(e) => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                        maxLength={10}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 flex items-center">
                        {currentCustomer.phone ? (
                          <>
                            <Phone className="h-4 w-4 mr-2 text-gray-400" />
                            {currentCustomer.phone}
                          </>
                        ) : (
                          <span className="text-gray-500 italic">No registrado</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={editingCustomer.email || ''}
                        onChange={(e) => setEditingCustomer({...editingCustomer, email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="ejemplo@correo.com"
                      />
                    ) : (
                      <p className="text-gray-900 flex items-center">
                        {currentCustomer.email ? (
                          <>
                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                            {currentCustomer.email}
                          </>
                        ) : (
                          <span className="text-gray-500 italic">No registrado</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Fecha de nacimiento */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Nacimiento
                    </label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editingCustomer.birthDate ? formatInputDate(editingCustomer.birthDate) : ''}
                        onChange={(e) => setEditingCustomer({...editingCustomer, birthDate: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900 flex items-center">
                        {currentCustomer.birthDate ? (
                          <>
                            <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                            {formatDisplayDate(currentCustomer.birthDate)}
                            {calculateAge(currentCustomer.birthDate) && (
                              <span className="ml-2 text-sm text-gray-500">
                                ({calculateAge(currentCustomer.birthDate)} años)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-500 italic">No registrada</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dirección
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editingCustomer.address || ''}
                      onChange={(e) => setEditingCustomer({...editingCustomer, address: e.target.value})}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Dirección completa del cliente"
                    />
                  ) : (
                    <p className="text-gray-900 flex items-start">
                      {currentCustomer.address ? (
                        <>
                          <MapPin className="h-4 w-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                          {currentCustomer.address}
                        </>
                      ) : (
                        <span className="text-gray-500 italic">No registrada</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas
                  </label>
                  {isEditing ? (
                    <textarea
                      value={editingCustomer.notes || ''}
                      onChange={(e) => setEditingCustomer({...editingCustomer, notes: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Notas adicionales sobre el cliente"
                    />
                  ) : (
                    <p className="text-gray-900">
                      {currentCustomer.notes || (
                        <span className="text-gray-500 italic">Sin notas adicionales</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Saldo a favor */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-green-800">Saldo a Favor</h4>
                      <p className="text-sm text-green-600">Crédito disponible para compras</p>
                    </div>
                    <p className="text-2xl font-bold text-green-900">
                      {formatCurrency(currentCustomer.credit || 0)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Pestaña de Estadísticas */
              <div className="space-y-6">
                {/* Filtro de período */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-lg font-medium text-gray-900 mb-2 sm:mb-0">
                    Estadísticas de Ventas
                  </h4>
                  <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium text-gray-700">
                      Período:
                    </label>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="allTime">Todos los tiempos</option>
                      <option value="thisYear">Este año</option>
                      <option value="lastYear">El año pasado</option>
                      <option value="last6Months">Últimos 6 meses</option>
                      <option value="last3Months">Últimos 3 meses</option>
                      <option value="thisMonth">Este mes</option>
                      <option value="lastMonth">El mes pasado</option>
                    </select>
                  </div>
                </div>

                {statsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : statsError ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-red-800">{statsError}</p>
                  </div>
                ) : (
                  <>
                    {/* Estadísticas principales */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-xs font-medium text-blue-600 mb-1">Total Ventas</p>
                        <p className="text-lg font-bold text-blue-900">{formatCurrency(totalSales)}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 text-center">
                        <p className="text-xs font-medium text-green-600 mb-1">Ganancia</p>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(totalProfit)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <p className="text-xs font-medium text-purple-600 mb-1">Transacciones</p>
                        <p className="text-lg font-bold text-purple-900">{transactionCount}</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-4 text-center">
                        <p className="text-xs font-medium text-orange-600 mb-1">Promedio</p>
                        <p className="text-lg font-bold text-orange-900">{formatCurrency(averageTransaction)}</p>
                      </div>
                    </div>

                    {/* Ranking */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-sm font-medium text-yellow-600">Ranking General</p>
                          <p className="text-3xl font-bold text-yellow-900">#{allTimeRanking}</p>
                          <p className="text-xs text-yellow-700">Entre todos los clientes</p>
                        </div>
                      </div>
                    </div>

                    {/* Mejores récords */}
                    {(bestDay || bestMonth) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {bestDay && (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                            <h4 className="font-medium text-indigo-800 mb-2 flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              Mejor Día
                            </h4>
                            <p className="text-sm text-indigo-700">{formatDate(bestDay.date)}</p>
                            <p className="text-xl font-bold text-indigo-900">{formatCurrency(bestDay.amount)}</p>
                          </div>
                        )}
                        {bestMonth && (
                          <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                            <h4 className="font-medium text-pink-800 mb-2 flex items-center">
                              <Calendar className="h-4 w-4 mr-2" />
                              Mejor Mes
                            </h4>
                            <p className="text-sm text-pink-700">{formatMonth(bestMonth.month)}</p>
                            <p className="text-xl font-bold text-pink-900">{formatCurrency(bestMonth.amount)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sin datos */}
                    {transactionCount === 0 && (
                      <div className="text-center py-12">
                        <div className="text-gray-400 mb-4">
                          <User className="h-16 w-16 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ventas registradas</h3>
                        <p className="text-gray-500">
                          No hay ventas registradas para este cliente en el período seleccionado.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}