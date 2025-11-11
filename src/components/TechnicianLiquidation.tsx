import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Clock, CheckCircle, Filter, Search, User, Calendar, Eye, Check, FileText, Package, Wrench, TrendingUp, Banknote, Users } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../services/firebase/collections';
import { TechnicalService, TechnicianLiquidation, Technician } from '../types';
import { formatCurrency } from '../utils/currency';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';

export function TechnicianLiquidationComponent() {
  const { user, appUser } = useAuth();
  const { showNotification } = useNotification();
  
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [completedServices, setCompletedServices] = useState<TechnicalService[]>([]);
  const [liquidations, setLiquidations] = useState<TechnicianLiquidation[]>([]);
  const [selectedTechnicianFilter, setSelectedTechnicianFilter] = useState('');
  // Configurar fechas por defecto: día actual para ambos filtros
  const today = new Date().toISOString().split('T')[0];
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateFromFilter, setDateFromFilter] = useState(today);
  const [dateToFilter, setDateToFilter] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showLiquidationModal, setShowLiquidationModal] = useState(false);
  const [liquidationNotes, setLiquidationNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar técnicos
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.TECHNICIANS), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const techniciansData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Technician[];
      setTechnicians(techniciansData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar servicios técnicos completados
  useEffect(() => {
    // Consulta simplificada sin orderBy para evitar índice compuesto
    const q = query(
      collection(db, COLLECTIONS.TECHNICAL_SERVICES),
      where('status', '==', 'completed')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let servicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TechnicalService[];
      
      // Ordenar en memoria por completedAt desc
      servicesData.sort((a, b) => {
        const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bDate - aDate;
      });
      
      setCompletedServices(servicesData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar liquidaciones
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.TECHNICIAN_LIQUIDATIONS), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liquidationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TechnicianLiquidation[];
      setLiquidations(liquidationsData);
    });
    return () => unsubscribe();
  }, []);

  // Servicios pendientes de liquidar (completados pero sin liquidar)
  const pendingServices = useMemo(() => {
    return completedServices.filter(service => {
      if (!service.technicianId || service.liquidationId) {
        return false; // Solo servicios con técnico asignado y que no hayan sido liquidados
      }
      
      // Verificar que tiene mano de obra (nuevo sistema o sistema anterior)
      if (service.serviceCost !== undefined) {
        // Nuevo sistema: siempre liquidar si hay serviceCost > 0
        // Si no hay repuestos, toda la mano de obra es el serviceCost
        // Si hay repuestos, la mano de obra es serviceCost - partsCost
        return service.serviceCost > 0;
      } else {
        // Sistema anterior
        return service.laborCost && service.laborCost > 0;
      }
    });
  }, [completedServices]);

  // Limpiar servicios seleccionados que ya no están disponibles
  useEffect(() => {
    const availableServiceIds = new Set(pendingServices.map(s => s.id));
    const currentSelectedServices = new Set(selectedServices);
    
    // Remover servicios seleccionados que ya no están en la lista de pendientes
    for (const serviceId of currentSelectedServices) {
      if (!availableServiceIds.has(serviceId)) {
        currentSelectedServices.delete(serviceId);
      }
    }
    
    // Solo actualizar si hay cambios
    if (currentSelectedServices.size !== selectedServices.size) {
      setSelectedServices(currentSelectedServices);
    }
  }, [pendingServices, selectedServices]);

  // Filtrar servicios pendientes
  const filteredPendingServices = useMemo(() => {
    return pendingServices.filter(service => {
      const matchesTechnician = !selectedTechnicianFilter || service.technicianId === selectedTechnicianFilter;
      
      // Filtro de rango de fechas
      let matchesDateRange = true;
      if (dateFromFilter || dateToFilter) {
        const serviceDate = service.completedAt ? new Date(service.completedAt).toISOString().split('T')[0] : null;
        if (serviceDate) {
          if (dateFromFilter && serviceDate < dateFromFilter) matchesDateRange = false;
          if (dateToFilter && serviceDate > dateToFilter) matchesDateRange = false;
        } else {
          matchesDateRange = false;
        }
      }
      
      const matchesSearch = !searchTerm || 
        service.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.deviceBrandModel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.technicianName?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesTechnician && matchesDateRange && matchesSearch;
    });
  }, [pendingServices, selectedTechnicianFilter, dateFromFilter, dateToFilter, searchTerm]);

  // Filtrar liquidaciones
  const filteredLiquidations = useMemo(() => {
    return liquidations.filter(liquidation => {
      const matchesTechnician = !selectedTechnicianFilter || liquidation.technicianId === selectedTechnicianFilter;
      
      // Filtro de rango de fechas
      let matchesDateRange = true;
      if (dateFromFilter || dateToFilter) {
        const liquidationDate = new Date(liquidation.createdAt).toISOString().split('T')[0];
        if (dateFromFilter && liquidationDate < dateFromFilter) matchesDateRange = false;
        if (dateToFilter && liquidationDate > dateToFilter) matchesDateRange = false;
      }
      
      const matchesSearch = !searchTerm || 
        liquidation.technicianName.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesTechnician && matchesDateRange && matchesSearch;
    });
  }, [liquidations, selectedTechnicianFilter, dateFromFilter, dateToFilter, searchTerm]);

  // Agrupar servicios por técnico para liquidación
  const groupedServicesForLiquidation = useMemo(() => {
    const selectedServicesArray = Array.from(selectedServices)
      .map(id => pendingServices.find(s => s.id === id))
      .filter(Boolean) as TechnicalService[];

    const grouped = selectedServicesArray.reduce((acc, service) => {
      if (!service.technicianId) return acc;
      
      if (!acc[service.technicianId]) {
        acc[service.technicianId] = {
          technicianId: service.technicianId,
          technicianName: service.technicianName || 'Técnico Desconocido',
          services: [],
          totalLaborCost: 0,
          totalTechnicianShare: 0
        };
      }
      
      // Calcular valores usando el nuevo sistema
      const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
      const serviceCost = service.serviceCost || 0;
      // Si no hay repuestos, toda la mano de obra es el serviceCost
      // Si hay repuestos, la mano de obra es serviceCost - partsCost
      const laborCost = service.laborCost || (partsCost === 0 ? serviceCost : Math.max(0, serviceCost - partsCost));
      const technicianShare = service.technicianShare || (laborCost * 0.5);
      
      acc[service.technicianId].services.push(service);
      acc[service.technicianId].totalLaborCost += laborCost;
      acc[service.technicianId].totalTechnicianShare += technicianShare;
      
      return acc;
    }, {} as Record<string, {
      technicianId: string;
      technicianName: string;
      services: TechnicalService[];
      totalLaborCost: number;
      totalTechnicianShare: number;
    }>);

    return Object.values(grouped);
  }, [selectedServices, pendingServices]);

  // Cerrar modal automáticamente si no hay servicios seleccionados
  useEffect(() => {
    if (showLiquidationModal && groupedServicesForLiquidation.length === 0) {
      setShowLiquidationModal(false);
    }
  }, [showLiquidationModal, groupedServicesForLiquidation.length]);

  const handleSelectService = (serviceId: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceId)) {
      newSelected.delete(serviceId);
    } else {
      newSelected.add(serviceId);
    }
    setSelectedServices(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedServices.size === filteredPendingServices.length) {
      setSelectedServices(new Set());
    } else {
      setSelectedServices(new Set(filteredPendingServices.map(s => s.id)));
    }
  };

  const handleCreateLiquidations = async () => {
    if (groupedServicesForLiquidation.length === 0) {
      showNotification('Selecciona al menos un servicio para liquidar', 'warning');
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      
      // Crear liquidación para cada técnico
      for (const group of groupedServicesForLiquidation) {
        const liquidationData: Omit<TechnicianLiquidation, 'id'> = {
          technicianId: group.technicianId,
          technicianName: group.technicianName,
          services: group.services.map(service => {
            const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
            const serviceCost = service.serviceCost || 0;
            // Si no hay repuestos, toda la mano de obra es el serviceCost
            // Si hay repuestos, la mano de obra es serviceCost - partsCost
            const laborCost = service.laborCost || (partsCost === 0 ? serviceCost : Math.max(0, serviceCost - partsCost));
            const technicianShare = service.technicianShare || (laborCost * 0.5);
            
            return {
              serviceId: service.id,
              serviceCost: serviceCost,
              partsCost: partsCost,
              laborCost: laborCost,
              technicianShare: technicianShare,
              customerName: service.customerName,
              deviceBrandModel: service.deviceBrandModel,
              completedAt: service.completedAt || now
            };
          }),
          totalLaborCost: group.totalLaborCost,
          totalTechnicianShare: group.totalTechnicianShare,
          status: 'completed',
          createdAt: now,
          notes: liquidationNotes
        };

        // Crear la liquidación
        const liquidationRef = await addDoc(collection(db, COLLECTIONS.TECHNICIAN_LIQUIDATIONS), liquidationData);

        // Actualizar los servicios con el ID de liquidación
        for (const service of group.services) {
          await updateDoc(doc(db, COLLECTIONS.TECHNICAL_SERVICES, service.id), {
            liquidationId: liquidationRef.id,
            liquidatedAt: now
          });
        }
      }

      showNotification('Liquidaciones creadas exitosamente', 'success');
      
      // Limpiar estados de forma secuencial para evitar problemas de sincronización
      setSelectedServices(new Set());
      setLiquidationNotes('');
      setShowLiquidationModal(false);
    } catch (error) {
      console.error('Error creating liquidations:', error);
      showNotification('Error al crear las liquidaciones', 'error');
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-300">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Liquidación de Técnicos</h1>
              <p className="text-gray-600 mt-1">Gestiona los pagos de mano de obra para técnicos</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Servicios Pendientes ({filteredPendingServices.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2" />
                Historial de Liquidaciones ({filteredLiquidations.length})
              </div>
            </button>
          </nav>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Técnico
              </label>
              <select
                value={selectedTechnicianFilter}
                onChange={(e) => setSelectedTechnicianFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos los técnicos</option>
                {technicians.map(technician => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={dateFromFilter}
                min={sixMonthsAgo}
                max={today}
                onChange={(e) => setDateFromFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={dateToFilter}
                min={sixMonthsAgo}
                max={today}
                onChange={(e) => setDateToFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cliente, técnico, dispositivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          {/* Botones de acceso rápido para fechas */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => {
                setDateFromFilter(today);
                setDateToFilter(today);
              }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                dateFromFilter === today && dateToFilter === today
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => {
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                setDateFromFilter(yesterday);
                setDateToFilter(yesterday);
              }}
              className="px-3 py-1 text-xs rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Ayer
            </button>
            <button
              onClick={() => {
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                setDateFromFilter(weekAgo);
                setDateToFilter(today);
              }}
              className="px-3 py-1 text-xs rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Última semana
            </button>
            <button
              onClick={() => {
                const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                setDateFromFilter(monthAgo);
                setDateToFilter(today);
              }}
              className="px-3 py-1 text-xs rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Último mes
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'pending' ? (
            <div>
              {/* Actions */}
              {filteredPendingServices.length > 0 && (
                <div className="mb-6 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {selectedServices.size === filteredPendingServices.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                    {selectedServices.size > 0 && (
                      <span className="text-sm text-gray-600">
                        {selectedServices.size} servicio{selectedServices.size !== 1 ? 's' : ''} seleccionado{selectedServices.size !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  {selectedServices.size > 0 && !showLiquidationModal && (
                    <button
                      onClick={() => setShowLiquidationModal(true)}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Crear Liquidación ({selectedServices.size})
                    </button>
                  )}
                </div>
              )}

              {/* Services List */}
              {filteredPendingServices.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No hay servicios pendientes</h3>
                  <p className="text-gray-600">Los servicios completados con técnico asignado aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPendingServices.map((service) => (
                    <div key={service.id} className="bg-white border border-gray-300 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedServices.has(service.id)}
                          onChange={() => handleSelectService(service.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        
                        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                          {/* Customer & Status */}
                          <div className="col-span-3">
                            <h3 className="font-bold text-gray-900">{service.customerName}</h3>
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                              Completado
                            </span>
                          </div>
                          
                          {/* Technician */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-900">{service.technicianName}</div>
                            <div className="text-xs text-gray-500">{service.deviceBrandModel}</div>
                          </div>
                          
                          {/* Date */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-600">
                              {service.completedAt ? formatDate(service.completedAt) : 'Fecha no disponible'}
                            </div>
                          </div>
                          
                          {/* Service Cost */}
                          <div className="col-span-1 text-center">
                            <div className="font-bold text-blue-600">
                              {formatCurrency(service.serviceCost || 0)}
                            </div>
                            <div className="text-xs text-gray-500">Servicio</div>
                          </div>
                          
                          {/* Parts Cost */}
                          <div className="col-span-1 text-center">
                            {(() => {
                              const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
                              return (
                                <>
                                  <div className="font-medium text-gray-600">
                                    {formatCurrency(partsCost)}
                                  </div>
                                  <div className="text-xs text-gray-500">Repuestos</div>
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Labor Cost */}
                          <div className="col-span-1 text-center">
                            {(() => {
                              const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
                              const serviceCost = service.serviceCost || 0;
                              const laborCost = service.laborCost || (partsCost === 0 ? serviceCost : Math.max(0, serviceCost - partsCost));
                              return (
                                <>
                                  <div className="font-medium text-blue-600">
                                    {formatCurrency(laborCost)}
                                  </div>
                                  <div className="text-xs text-gray-500">Mano de Obra</div>
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Technician Share */}
                          <div className="col-span-2 text-center">
                            {(() => {
                              const partsCost = service.items?.reduce((sum, item) => sum + item.totalCost, 0) || 0;
                              const serviceCost = service.serviceCost || 0;
                              const laborCost = service.laborCost || (partsCost === 0 ? serviceCost : Math.max(0, serviceCost - partsCost));
                              const technicianShare = service.technicianShare || (laborCost * 0.5);
                              return (
                                <>
                                  <div className="font-bold text-green-600 text-lg">
                                    {formatCurrency(technicianShare)}
                                  </div>
                                  <div className="text-xs text-gray-500">Para Técnico</div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* Parts detail - collapsible */}
                      {service.items && service.items.length > 0 && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                            Ver repuestos usados ({service.items.length})
                          </summary>
                          <div className="mt-2 bg-gray-50 rounded p-3">
                            {service.items.map((item, index) => (
                              <div key={index} className="flex justify-between text-sm py-1">
                                <span>{item.partName || item.name} (x{item.quantity})</span>
                                <span className="font-medium">{formatCurrency(item.totalCost)}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Liquidations History */}
              {filteredLiquidations.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No hay liquidaciones</h3>
                  <p className="text-gray-600">Las liquidaciones creadas aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLiquidations.map((liquidation) => (
                    <div key={liquidation.id} className="bg-white border border-gray-300 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <h3 className="font-bold text-gray-900">{liquidation.technicianName}</h3>
                            <div className="text-sm text-gray-500">
                              {formatDate(liquidation.createdAt)}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-6 text-center">
                            <div>
                              <div className="font-medium text-blue-600">{liquidation.services.length}</div>
                              <div className="text-xs text-gray-500">Servicios</div>
                            </div>
                            <div>
                              <div className="font-medium text-purple-600">{formatCurrency(liquidation.totalLaborCost)}</div>
                              <div className="text-xs text-gray-500">Mano de Obra</div>
                            </div>
                            <div>
                              <div className="font-bold text-green-600 text-lg">{formatCurrency(liquidation.totalTechnicianShare)}</div>
                              <div className="text-xs text-gray-500">Para Técnico</div>
                            </div>
                          </div>
                        </div>

                      </div>

                      {liquidation.notes && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                          <strong>Notas:</strong> {liquidation.notes}
                        </div>
                      )}

                      {/* Services Details */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                          Ver servicios incluidos ({liquidation.services.length})
                        </summary>
                        <div className="mt-2 bg-gray-50 rounded p-3">
                          {liquidation.services.map((service, index) => (
                            <div key={index} className="flex justify-between text-sm py-1">
                              <span>{service.customerName} - {service.deviceBrandModel}</span>
                              <span className="font-medium text-green-600">{formatCurrency(service.technicianShare)}</span>
                            </div>
                          ))}
                        </div>
                      </details>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Liquidation Modal */}
      {showLiquidationModal && groupedServicesForLiquidation.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-90vh overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Liquidaciones</h2>
              
              <div className="space-y-4">
                {groupedServicesForLiquidation.map((group) => (
                  <div key={group.technicianId} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-2">{group.technicianName}</h3>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                      <div className="bg-blue-50 p-2 rounded">
                        <span className="text-blue-900 font-medium">Servicios: </span>
                        <span className="text-blue-700">{group.services.length}</span>
                      </div>
                      <div className="bg-green-50 p-2 rounded">
                        <span className="text-green-900 font-medium">Total Mano de Obra: </span>
                        <span className="text-green-700">{formatCurrency(group.totalLaborCost)}</span>
                      </div>
                      <div className="bg-yellow-50 p-2 rounded">
                        <span className="text-yellow-900 font-medium">A Pagar: </span>
                        <span className="text-yellow-700">{formatCurrency(group.totalTechnicianShare)}</span>
                      </div>
                    </div>

                    <div className="text-xs text-gray-600">
                      <details>
                        <summary className="cursor-pointer hover:text-gray-800">
                          Ver servicios ({group.services.length})
                        </summary>
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                          {group.services.map((service) => (
                            <div key={service.id} className="flex justify-between items-center p-1 bg-gray-50 rounded">
                              <span>{service.customerName} - {service.deviceBrandModel}</span>
                              <span className="font-medium">{formatCurrency(service.technicianShare || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={liquidationNotes}
                  onChange={(e) => setLiquidationNotes(e.target.value)}
                  rows={3}
                  placeholder="Notas adicionales sobre esta liquidación"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCreateLiquidations}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {loading ? 'Creando...' : 'Crear Liquidaciones'}
                </button>
                <button
                  onClick={() => setShowLiquidationModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}