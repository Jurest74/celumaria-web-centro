import { useState, useEffect, useMemo } from 'react';
import { Gift, Calendar, User, Package, DollarSign, Search, Filter, TrendingDown } from 'lucide-react';
import { courtesiesService } from '../services/firebase/firestore';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';

export function Courtesies() {
  const { permissionHelpers } = useAuth();
  const [courtesies, setCourtesies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSalesperson, setFilterSalesperson] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Verificar permisos
  if (!permissionHelpers?.hasPermission('courtesies')) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Gift className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sin acceso</h2>
          <p className="text-gray-600">No tienes permisos para ver el historial de cortesías</p>
        </div>
      </div>
    );
  }

  // Cargar cortesías
  useEffect(() => {
    loadCourtesies();
  }, []);

  const loadCourtesies = async () => {
    try {
      setLoading(true);
      const data = await courtesiesService.getAll();
      setCourtesies(data);
    } catch (error) {
      console.error('Error loading courtesies:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obtener vendedores únicos
  const salespeople = useMemo(() => {
    const unique = new Set(courtesies.map(c => c.salesPersonName).filter(Boolean));
    return Array.from(unique);
  }, [courtesies]);

  // Obtener productos únicos
  const products = useMemo(() => {
    const unique = new Set(courtesies.map(c => c.item?.productName).filter(Boolean));
    return Array.from(unique);
  }, [courtesies]);

  // Filtrar cortesías
  const filteredCourtesies = useMemo(() => {
    return courtesies.filter(courtesy => {
      // Filtro por búsqueda de cliente
      if (searchQuery) {
        const customerName = (courtesy.customerName || '').toLowerCase();
        if (!customerName.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }

      // Filtro por vendedor
      if (filterSalesperson !== 'all' && courtesy.salesPersonName !== filterSalesperson) {
        return false;
      }

      // Filtro por producto
      if (filterProduct !== 'all' && courtesy.item?.productName !== filterProduct) {
        return false;
      }

      // Filtro por rango de fechas
      if (startDate || endDate) {
        const courtesyDate = new Date(courtesy.createdAt).toISOString().split('T')[0];
        if (startDate && courtesyDate < startDate) return false;
        if (endDate && courtesyDate > endDate) return false;
      }

      return true;
    });
  }, [courtesies, searchQuery, filterSalesperson, filterProduct, startDate, endDate]);

  // Estadísticas
  const stats = useMemo(() => {
    const totalCourtesies = filteredCourtesies.length;
    const totalValue = filteredCourtesies.reduce((sum, c) => sum + (c.item?.totalValue || 0), 0);
    const totalCost = filteredCourtesies.reduce((sum, c) => sum + (c.item?.totalCost || 0), 0);
    const totalQuantity = filteredCourtesies.reduce((sum, c) => sum + (c.item?.quantity || 0), 0);

    return { totalCourtesies, totalValue, totalCost, totalQuantity };
  }, [filteredCourtesies]);

  const hasActiveFilters = searchQuery || filterSalesperson !== 'all' || filterProduct !== 'all' || startDate || endDate;

  const clearFilters = () => {
    setSearchQuery('');
    setFilterSalesperson('all');
    setFilterProduct('all');
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-3">
              <Gift className="h-8 w-8 text-cyan-600" />
              <span>Historial de Cortesías</span>
            </h1>
            <p className="text-gray-600 mt-1">
              Registro completo de productos regalados a clientes
            </p>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-cyan-100 rounded-full">
              <Gift className="h-6 w-6 text-cyan-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Cortesías</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCourtesies}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Productos Regalados</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalQuantity}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Valor Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 bg-red-100 rounded-full">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Costo Real</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalCost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros</span>
          </h2>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Búsqueda por cliente */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          {/* Filtro por vendedor */}
          <select
            value={filterSalesperson}
            onChange={(e) => setFilterSalesperson(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="all">Todos los vendedores</option>
            {salespeople.map(person => (
              <option key={person} value={person}>{person}</option>
            ))}
          </select>

          {/* Filtro por producto */}
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="all">Todos los productos</option>
            {products.map(product => (
              <option key={product} value={product}>{product}</option>
            ))}
          </select>

          {/* Fecha inicio */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />

          {/* Fecha fin */}
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista de cortesías */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Cortesías Registradas ({filteredCourtesies.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          {filteredCourtesies.length === 0 ? (
            <div className="p-8 text-center">
              <Gift className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay cortesías registradas</h3>
              <p className="text-gray-600">
                {hasActiveFilters
                  ? 'No se encontraron cortesías con los filtros aplicados'
                  : 'Aún no se han registrado cortesías'}
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cantidad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Costo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCourtesies.map((courtesy) => (
                  <tr key={courtesy.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(courtesy.createdAt).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {courtesy.customerName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {courtesy.item?.productName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {courtesy.item?.quantity || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-cyan-600">
                      {formatCurrency(courtesy.item?.totalValue || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">
                      {formatCurrency(courtesy.item?.totalCost || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {courtesy.salesPersonName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {courtesy.item?.reason || courtesy.reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
