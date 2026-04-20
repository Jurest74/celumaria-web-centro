import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, Search, Calendar, DollarSign, User, Package, Eye, CheckCircle, Clock, X, AlertTriangle, AlertCircle, Settings, ArrowUpRight, Gift } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { selectTechnicalServices, selectProducts, selectCustomers } from '../store/selectors';
import { technicalServicesService, productsService, courtesiesService } from '../services/firebase/firestore';
import { customersService } from '../services/firebase/firestore';
import { TechnicalService as TechnicalServicePlan, TechnicalServiceItem, TechnicalServicePayment, PaymentMethod, Technician } from '../types';
import { formatCurrency, formatNumber, formatNumberInput, parseNumberInput } from '../utils/currency';
import { getColombiaTimestamp } from '../utils/dateUtils';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';

import { fetchProducts } from '../store/thunks/productsThunks';
import { fetchTechnicalServices, fetchTechnicalServicesByStatus } from '../store/thunks/technicalServicesThunks';
// ⚡ OPTIMIZADO: No usar useSectionRealtime - datos se cargan al navegar
import { useFirebase } from '../contexts/FirebaseContext';

// AddProductsToLayawayPOS no se usa más - los repuestos se agregan al crear el servicio
import { ProductPOSSelector } from './ProductPOSSelector';
import { CustomerComboBox } from './CustomerComboBox';
import { CourtesyModal } from './CourtesyModal';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppUser } from '../types';
import { COLLECTIONS } from '../services/firebase/collections';

export function TechnicalService() {
  // Estado para saldo a favor usado en ventas
  const [usedCreditInSales, setUsedCreditInSales] = useState(0);
  const [creditDataLoaded, setCreditDataLoaded] = useState(false);

  // Obtener saldo a favor usado en ventas
  useEffect(() => {
    async function fetchUsedCredit() {
      try {
        const { salesService } = await import('../services/firebase/firestore');
        const sales = await salesService.getAll();
        const totalCreditUsed = sales.reduce((sum, sale) => {
          if (Array.isArray(sale.paymentMethods)) {
            return sum + sale.paymentMethods
              .filter(p => (p.method as string) === 'credit')
              .reduce((s, p) => s + p.amount, 0);
          }
          return sum;
        }, 0);
        setUsedCreditInSales(totalCreditUsed);
        setCreditDataLoaded(true);
      } catch (e) {
        setUsedCreditInSales(0);
        setCreditDataLoaded(true);
      }
    }
    fetchUsedCredit();
  }, []);

  // Load available users for salesperson filter and technicians
  useEffect(() => {
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

    const loadTechnicians = async () => {
      try {
        const techniciansRef = collection(db, COLLECTIONS.TECHNICIANS);
        const snapshot = await getDocs(techniciansRef);
        const techniciansData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Technician[];
        setAvailableTechnicians(techniciansData);
      } catch (error) {
        console.error('Error loading technicians:', error);
      }
    };

    loadUsers();
    loadTechnicians();
  }, []);

  // Eliminar producto no recogido y devolver al inventario
  const handleRemoveUnpickedProduct = async (itemId: string) => {
    if (!selectedTechnicalService) return;
    const item = selectedTechnicalService.items.find((i: any) => i.id === itemId);
    if (!item) return;
    const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
    if (unPickedQuantity <= 0) return;

    showConfirm(
      'Confirmar eliminación de producto',
      `¿Seguro que quieres eliminar "${item.productName}" (${unPickedQuantity} unidades no recogidas) del servicio técnico? Las unidades serán devueltas al inventario y los totales recalculados.`,
      async () => {
        setIsLoading(true);
        try {
          // Actualizar inventario usando el servicio correcto
          await productsService.updateStock(item.productId, unPickedQuantity);
          // Eliminar el producto del servicio técnico
          const newItems = selectedTechnicalService.items.filter((i: any) => i.id !== itemId);
          // Recalcular totales
          const newTotalCost = newItems.reduce((sum: number, i: any) => sum + i.totalCost, 0);
          const newTotalAmount = newItems.reduce((sum: number, i: any) => sum + i.totalRevenue, 0);
          const newExpectedProfit = newTotalAmount - newTotalCost;
          // Pagos ya realizados
          const totalPaid = selectedTechnicalService.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
          const newRemainingBalance = Math.max(0, newTotalAmount - totalPaid);
          // Recalcular shares si usa el nuevo sistema de costos
          const svcCostRemove = selectedTechnicalService.serviceCost;
          const newLaborCostRemove = svcCostRemove !== undefined ? Math.max(0, svcCostRemove - newTotalCost) : undefined;
          await technicalServicesService.update(selectedTechnicalService.id, {
            items: newItems,
            totalAmount: newTotalAmount,
            totalCost: newTotalCost,
            expectedProfit: newExpectedProfit,
            remainingBalance: newRemainingBalance,
            ...(newLaborCostRemove !== undefined && {
              laborCost: newLaborCostRemove,
              technicianShare: newLaborCostRemove * 0.5,
              businessShare: newLaborCostRemove * 0.5,
            }),
            updatedAt: getColombiaTimestamp()
          });
          // Actualizar estado local
          updateTechnicalServiceInState({
            ...selectedTechnicalService,
            items: newItems,
            totalAmount: newTotalAmount,
            totalCost: newTotalCost,
            expectedProfit: newExpectedProfit,
            remainingBalance: newRemainingBalance,
            ...(newLaborCostRemove !== undefined && {
              laborCost: newLaborCostRemove,
              technicianShare: newLaborCostRemove * 0.5,
              businessShare: newLaborCostRemove * 0.5,
            }),
            updatedAt: getColombiaTimestamp()
          });
          showSuccess('Producto eliminado', `El producto fue eliminado y las unidades devueltas al inventario.`);
          dispatch(fetchProducts());
          dispatch(fetchTechnicalServices());
        } catch (error) {
          showError('Error', 'No se pudo eliminar el producto.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  // Eliminar servicio técnico
  const handleDeleteTechnicalService = async (layaway: TechnicalServicePlan) => {
    showConfirm(
      'Confirmar eliminación',
      `¿Seguro que quieres eliminar el servicio técnico de ${layaway.customerName}? Esta acción no se puede deshacer.`,
      async () => {
        setIsLoading(true);
        try {
          await technicalServicesService.delete(layaway.id);
          showSuccess('Servicio técnico eliminado', 'El servicio técnico fue eliminado exitosamente.');
          dispatch(fetchTechnicalServices());
        } catch (error) {
          showError('Error', 'No se pudo eliminar el servicio técnico.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const dispatch = useAppDispatch();
  const firebase = useFirebase();
  
  // Estado del filtro (debe estar antes de los useEffects que lo usan)
  const [statusFilter, setStatusFilter] = useState('active');

  // ⚡ OPTIMIZADO: NO usar listeners en tiempo real
  // Los datos se recargan automáticamente al navegar a esta sección
  // Si el usuario está quieto aquí, no necesita ver actualizaciones de otros

  // Cargar servicios técnicos al cambiar filtro de estado
  useEffect(() => {
    const loadServices = async () => {
      try {
        if (statusFilter === 'all') {
          const services = await technicalServicesService.getAll();
          dispatch(fetchTechnicalServices.fulfilled(services, '', undefined));
        } else {
          const services = await technicalServicesService.getByStatus(statusFilter as 'active' | 'completed' | 'cancelled');
          dispatch(fetchTechnicalServices.fulfilled(services, '', undefined));
        }
      } catch (error) {
        console.error('Error loading technical services:', error);
      }
    };

    loadServices();
  }, [statusFilter, dispatch]);
  const allTechnicalServices = useAppSelector(selectTechnicalServices);
  const products = useAppSelector(selectProducts);
  const customers = useAppSelector(selectCustomers);
  const { showSuccess, showError, showConfirm } = useNotification();
  const { appUser } = useAuth();

  // Estados locales
  const [selectedTechnicalService, setSelectedTechnicalService] = useState<TechnicalServicePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editableCustomerInfo, setEditableCustomerInfo] = useState({
    phone: '',
    address: ''
  });
  const [createServiceParts, setCreateServiceParts] = useState<TechnicalServiceItem[]>([]);
  const [serviceCost, setServiceCost] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [courtesyItems, setCourtesyItems] = useState<any[]>([]);
  const [showCourtesyModal, setShowCourtesyModal] = useState(false);

  // Estados para modal de impresión
  const [showPrintModal, setShowPrintModal] = useState<TechnicalServicePlan | null>(null);
  
  // Estados para cancelación con manejo de dinero
  const [showCancellationModal, setShowCancellationModal] = useState<TechnicalServicePlan | null>(null);
  const [cancellationRefund, setCancellationRefund] = useState('');
  const [cancellationPenalty, setCancellationPenalty] = useState('');
  // Modal de penalización simple (sin pagos previos)
  const [showPenaltyModal, setShowPenaltyModal] = useState<TechnicalServicePlan | null>(null);
  const [penaltyAmount, setPenaltyAmount] = useState('');

  // Función para calcular mano de obra automáticamente
  const calculateLaborCost = () => {
    const totalPartsCost = createServiceParts.reduce((sum, part) => sum + (part.quantity * part.partCost), 0);
    return Math.max(0, serviceCost - totalPartsCost);
  };

  // Función para calcular las partes del técnico y negocio
  const calculateShares = () => {
    const laborCost = calculateLaborCost();
    const technicianShare = laborCost * 0.5; // 50% para el técnico
    const businessShare = laborCost * 0.5;   // 50% para el negocio
    return { laborCost, technicianShare, businessShare };
  };

  // Function to reset create form
  const resetCreateForm = () => {
    setSelectedCustomer(null);
    setEditableCustomerInfo({ phone: '', address: '' });
    setCreateServiceParts([]);
    setServiceCost(0);
    setDownPaymentDisplay('0');
    setPaymentMethodsCreate([]);
    setUseMultiplePaymentsCreate(false);
    setUseCreditCreate(false);
    setCourtesyItems([]);
    if (formRef.current) {
      formRef.current.reset();
    }
  };
  const [showAddParts, setShowAddParts] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [partToDelete, setPartToDelete] = useState<{id: string, name: string, item: any} | null>(null);
  const [overpaymentAction, setOverpaymentAction] = useState<'credit' | 'refund' | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editingData, setEditingData] = useState({
    deviceImei: '',
    deviceBrandModel: '',
    devicePassword: '',
    physicalCondition: '',
    reportedIssue: '',
    laborCost: 0,
    serviceCost: 0,
    notes: '',
    technicianId: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name_az' | 'name_za' | 'total_desc' | 'pending_desc'>('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [availableTechnicians, setAvailableTechnicians] = useState<Technician[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPickupForm, setShowPickupForm] = useState<{ item: TechnicalServiceItem; technicalService: TechnicalServicePlan } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [downPaymentDisplay, setDownPaymentDisplay] = useState('');
  const [useMultiplePaymentsCreate, setUseMultiplePaymentsCreate] = useState(false);
  const [paymentMethodsCreate, setPaymentMethodsCreate] = useState<PaymentMethod[]>([]);
  const [currentPaymentMethodCreate, setCurrentPaymentMethodCreate] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'>('efectivo');
  const [useCreditCreate, setUseCreditCreate] = useState(false);
  const [useMultiplePayments, setUseMultiplePayments] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'>('efectivo');

  // Función para manejar el cambio en el input de monto formateado
  const handlePaymentAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = parseNumberInput(value);
    
    if (!isNaN(numericValue)) {
      if (selectedTechnicalService && numericValue > calculateRealTotals(selectedTechnicalService).remainingBalance) {
        setPaymentAmount(formatNumberInput(calculateRealTotals(selectedTechnicalService).remainingBalance));
      } else {
        setPaymentAmount(formatNumberInput(numericValue));
      }
    } else if (value === '') {
      setPaymentAmount('');
    }
  };

  // Función para manejar el cambio en el input de pago inicial formateado
  const handleDownPaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = parseNumberInput(value);
    
    if (!isNaN(numericValue)) {
      setDownPaymentDisplay(formatNumberInput(numericValue));
    } else if (value === '') {
      setDownPaymentDisplay('');
    }
  };

  // Limpiar el monto cuando se cierre el modal
  useEffect(() => {
    if (!showPaymentForm) {
      setPaymentAmount('');
      setPaymentMethods([]);
      setUseMultiplePayments(false);
      setUseCredit(false);
    }
  }, [showPaymentForm]);

  // Limpiar el pago inicial cuando se cierre el modal de creación
  React.useEffect(() => {
    if (!showCreateForm) {
      setDownPaymentDisplay('');
      setPaymentMethodsCreate([]);
      setUseMultiplePaymentsCreate(false);
      setUseCreditCreate(false);
    }
  }, [showCreateForm]);

  // Load technical services on component mount and when status filter changes
  useEffect(() => {
    if (statusFilter === 'all') {
      dispatch(fetchTechnicalServices());
    } else {
      dispatch(fetchTechnicalServicesByStatus(statusFilter as 'active' | 'completed' | 'cancelled'));
    }
  }, [dispatch, statusFilter]);

  useEffect(() => {
    if (selectedTechnicalService) {
      const updatedSelected = allTechnicalServices.find(l => l.id === selectedTechnicalService.id);
      if (updatedSelected) {
        setSelectedTechnicalService(updatedSelected);
      }
    }
  }, [allTechnicalServices, selectedTechnicalService?.id]);
  
  const updateTechnicalServiceInState = (updatedTechnicalService: TechnicalServicePlan) => {
    if (selectedTechnicalService && selectedTechnicalService.id === updatedTechnicalService.id) {
      setSelectedTechnicalService(updatedTechnicalService);
    }
  };

  // Initialize editing data when modal opens
  React.useEffect(() => {
    if (selectedTechnicalService) {
      setEditingData({
        deviceImei: selectedTechnicalService.deviceImei || '',
        deviceBrandModel: selectedTechnicalService.deviceBrandModel || '',
        devicePassword: selectedTechnicalService.devicePassword || '',
        physicalCondition: selectedTechnicalService.physicalCondition || '',
        reportedIssue: selectedTechnicalService.reportedIssue || '',
        laborCost: selectedTechnicalService.laborCost || 0,
        serviceCost: selectedTechnicalService.serviceCost || 0,
        notes: selectedTechnicalService.notes || '',
        technicianId: selectedTechnicalService.technicianId || ''
      });
      setIsEditingDetails(false); // Reset editing mode when opening modal
    }
  }, [selectedTechnicalService]);

  // Handlers para cortesías
  const handleOpenCourtesyModal = () => {
    setShowCourtesyModal(true);
  };

  const handleCloseCourtesyModal = () => {
    setShowCourtesyModal(false);
  };

  const handleAddCourtesy = (courtesyItem: any) => {
    setCourtesyItems([...courtesyItems, courtesyItem]);
  };

  const handleRemoveCourtesy = (index: number) => {
    const updatedCourtesyItems = courtesyItems.filter((_, i) => i !== index);
    setCourtesyItems(updatedCourtesyItems);
  };

  // Handle customer selection and auto-complete info
  const handleCustomerSelect = useCallback((customer: any) => {
    setSelectedCustomer(customer);
    setEditableCustomerInfo({
      phone: customer?.phone || '',
      address: customer?.address || ''
    });
  }, []);

  // Get reasons why service cannot be completed
  const getCompletionBlockers = (service: any): string[] => {
    const blockers: string[] = [];
    const { remainingBalance } = calculateRealTotals(service);
    
    // Check payment status
    if (remainingBalance > 0.01) {
      blockers.push(`Falta pagar ${formatCurrency(remainingBalance)}`);
    } else if (remainingBalance < -0.01) {
      blockers.push(`Sobrepago de ${formatCurrency(Math.abs(remainingBalance))} - requiere reajuste`);
    }
    
    // Check parts installation status
    const pendingParts = service.items.filter((item: any) => item.status !== 'instalado');
    if (pendingParts.length > 0) {
      blockers.push(`${pendingParts.length} repuesto${pendingParts.length > 1 ? 's' : ''} sin instalar`);
    }
    
    return blockers;
  };

  // Check if service can be completed (paid and all parts installed)
  const canCompleteService = (service: any): boolean => {
    return getCompletionBlockers(service).length === 0;
  };

  // Handle completing/closing technical service
  const handleCompleteService = async () => {
    if (!selectedTechnicalService) return;
    
    if (!canCompleteService(selectedTechnicalService)) {
      showError('No se puede finalizar', 'El servicio debe estar pagado completamente y todos los repuestos deben estar instalados.');
      return;
    }

    // Verificar si tiene técnico asignado (servicios creados antes de que fuera obligatorio)
    if (!selectedTechnicalService.technicianId) {
      showError('Técnico requerido', 'Este servicio no tiene técnico asignado. Edita el servicio y asigna un técnico antes de finalizarlo.');
      return;
    }

    try {
      setIsLoading(true);
      
      await technicalServicesService.update(selectedTechnicalService.id, {
        status: 'completed',
        completedAt: getColombiaTimestamp(),
        updatedAt: getColombiaTimestamp(),
        // Auditoría de finalización
        completedBy: appUser?.uid,
        completedByName: appUser?.displayName || appUser?.email,
        statusChangedBy: appUser?.uid,
        statusChangedByName: appUser?.displayName || appUser?.email,
        statusChangedAt: getColombiaTimestamp()
      });

      // Update local state
      const updatedService = {
        ...selectedTechnicalService,
        status: 'completed' as const,
        completedAt: getColombiaTimestamp(),
        completedBy: appUser?.uid,
        completedByName: appUser?.displayName || appUser?.email,
        statusChangedBy: appUser?.uid,
        statusChangedByName: appUser?.displayName || appUser?.email,
        statusChangedAt: getColombiaTimestamp()
      };
      updateTechnicalServiceInState(updatedService);
      
      showSuccess('Servicio finalizado', `El servicio técnico para ${selectedTechnicalService.customerName} se ha completado exitosamente y aparecerá en la liquidación de técnicos.`);
      
      // Close modal and refresh data
      setSelectedTechnicalService(null);
      dispatch(fetchTechnicalServices());
    } catch (error) {
      console.error('Error completing service:', error);
      showError('Error', 'No se pudo finalizar el servicio técnico');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle showing delete confirmation modal
  const handleDeletePart = (itemId: string, partName: string) => {
    if (!selectedTechnicalService) return;
    
    // Find the item to delete
    const itemToDelete = selectedTechnicalService.items.find(item => item.id === itemId);
    if (!itemToDelete) return;
    
    // Set up the modal data
    setPartToDelete({
      id: itemId,
      name: partName,
      item: itemToDelete
    });
    setShowDeleteConfirm(true);
  };

  const handleAdjustOverpayment = (service: TechnicalServicePlan) => {
    if (!service) return;
    
    // Calculate overpayment
    const { remainingBalance } = calculateRealTotals(service);
    const overpayment = Math.abs(remainingBalance);
    
    if (overpayment <= 0.01) return; // No overpayment to adjust
    
    // Set up modal with fake deleted part to reuse existing overpayment modal
    setPartToDelete({
      id: 'adjustment',
      name: 'Reajuste de Sobrepago', 
      item: {
        id: 'adjustment',
        partName: 'Reajuste de Sobrepago',
        quantity: 1,
        partCost: overpayment,
        totalCost: overpayment,
        status: 'instalado' as const
      }
    });
    setShowDeleteConfirm(true);
  };

  // Handle confirming the delete
  const handleConfirmDelete = async () => {
    if (!selectedTechnicalService || !partToDelete) return;
    
    try {
      setIsLoading(true);
      
      // Special handling for overpayment adjustment
      if (partToDelete.id === 'adjustment') {
        const { remainingBalance } = calculateRealTotals(selectedTechnicalService);
        const overpayment = Math.abs(remainingBalance);
        
        if (overpaymentAction === 'credit') {
          // Add to customer credit
          const customer = customers.find(c => c.id === selectedTechnicalService.customerId);
          if (customer) {
            const { customersService } = await import('../services/firebase/firestore');
            await customersService.update(customer.id, {
              credit: (customer.credit || 0) + overpayment,
              updatedAt: getColombiaTimestamp()
            });
            
            showSuccess(
              'Saldo agregado',
              `Se agregó ${formatCurrency(overpayment)} al saldo a favor de ${customer.name}`
            );
          }
        } else if (overpaymentAction === 'refund') {
          // Create a negative payment to represent the refund
          const refundPayment = {
            id: crypto.randomUUID(),
            amount: -overpayment,
            paymentDate: getColombiaTimestamp(),
            paymentMethod: 'efectivo' as const,
            notes: `Reembolso por sobrepago en servicio técnico`
          };
          
          const updatedService = {
            ...selectedTechnicalService,
            payments: [...selectedTechnicalService.payments, refundPayment],
            updatedAt: getColombiaTimestamp()
          };
          
          // Update in Firebase
          await technicalServicesService.update(selectedTechnicalService.id, updatedService);
          
          // Update local state
          updateTechnicalServiceInState(updatedService);
          setSelectedTechnicalService(updatedService);
          
          showSuccess(
            'Reembolso registrado',
            `Se registró un reembolso de ${formatCurrency(overpayment)} para el cliente`
          );
        }
        
        // Reset state
        setShowDeleteConfirm(false);
        setPartToDelete(null);
        setOverpaymentAction(null);
        setIsLoading(false);
        return;
      }
      
      // Regular delete handling
      // Calculate if there will be overpayment
      const currentTotal = selectedTechnicalService.items.reduce((sum: number, item: any) => sum + item.totalCost, 0) + (selectedTechnicalService.laborCost || 0);
      const totalPaid = selectedTechnicalService.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
      const removedAmount = partToDelete.item.totalCost;
      const newTotal = currentTotal - removedAmount;
      const overpayment = totalPaid - newTotal;
      
      // Remove the item from the array
      const updatedItems = selectedTechnicalService.items.filter(item => item.id !== partToDelete.id);
      
      let updatedService = {
        ...selectedTechnicalService,
        items: updatedItems,
        totalAmount: selectedTechnicalService.totalAmount - removedAmount,
        totalCost: selectedTechnicalService.totalCost - removedAmount,
        remainingBalance: selectedTechnicalService.remainingBalance - removedAmount,
        updatedAt: getColombiaTimestamp()
      };

      // Handle overpayment if exists
      if (overpayment > 0.01) {
        if (overpaymentAction === 'credit') {
          // Add to customer credit
          const customer = customers.find(c => c.id === selectedTechnicalService.customerId);
          if (customer) {
            const { customersService } = await import('../services/firebase/firestore');
            await customersService.update(customer.id, {
              credit: (customer.credit || 0) + overpayment,
              updatedAt: getColombiaTimestamp()
            });
            
            showSuccess(
              'Saldo agregado',
              `Se agregó ${formatCurrency(overpayment)} al saldo a favor de ${customer.name}`
            );
          }
        } else if (overpaymentAction === 'refund') {
          // Create a negative payment to represent the refund
          const refundPayment = {
            id: crypto.randomUUID(),
            amount: -overpayment,
            paymentDate: getColombiaTimestamp(),
            paymentMethod: 'efectivo' as const,
            notes: `Reembolso por eliminación de repuesto: ${partToDelete.name}`
          };
          
          updatedService = {
            ...updatedService,
            payments: [...selectedTechnicalService.payments, refundPayment]
          };
          
          showSuccess(
            'Reembolso registrado',
            `Se registró un reembolso de ${formatCurrency(overpayment)} para el cliente`
          );
        }
      }
      
      // Update in Firebase
      await technicalServicesService.update(selectedTechnicalService.id, updatedService);
      
      // Update local state
      updateTechnicalServiceInState(updatedService);
      setSelectedTechnicalService(updatedService);
      
      showSuccess(
        'Repuesto eliminado',
        `Se eliminó "${partToDelete.name}" por ${formatCurrency(removedAmount)}`
      );
      
      dispatch(fetchTechnicalServices());
      
      // Close modal and reset state
      setShowDeleteConfirm(false);
      setPartToDelete(null);
      setOverpaymentAction(null);
    } catch (error) {
      console.error('Error deleting part:', error);
      showError('Error', 'No se pudo eliminar el repuesto. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle updating item status
  const handleUpdateItemStatus = async (itemId: string, newStatus: 'solicitado' | 'en_tienda' | 'instalado') => {
    if (!selectedTechnicalService) return;
    
    try {
      const updatedItems = selectedTechnicalService.items.map(item => {
        if (item.id === itemId) {
          const updatedItem: any = { ...item, status: newStatus };
          // Add installedAt timestamp when status changes to 'instalado'
          if (newStatus === 'instalado' && item.status !== 'instalado') {
            updatedItem.installedAt = getColombiaTimestamp();
          }
          // Auditoría de cambio de estado
          updatedItem.statusChangedBy = appUser?.uid;
          updatedItem.statusChangedByName = appUser?.displayName || appUser?.email;
          updatedItem.statusChangedAt = getColombiaTimestamp();
          return updatedItem;
        }
        return item;
      });

      await technicalServicesService.update(selectedTechnicalService.id, {
        items: updatedItems,
        updatedAt: getColombiaTimestamp()
      });

      // Update local state
      const updatedService = {
        ...selectedTechnicalService,
        items: updatedItems
      };
      updateTechnicalServiceInState(updatedService);
      
      showSuccess('Estado actualizado', `El repuesto ahora está en estado: ${
        newStatus === 'solicitado' ? 'Solicitado' :
        newStatus === 'en_tienda' ? 'En tienda' :
        'Instalado'
      }`);
    } catch (error) {
      console.error('Error updating item status:', error);
      showError('Error', 'No se pudo actualizar el estado del repuesto');
    }
  };

  // Handle updating customer info in both service and customer collection
  const updateCustomerInfo = async (phone: string, address: string) => {
    if (!selectedCustomer) return;
    
    try {
      // Update customer in Firebase
      await customersService.update(selectedCustomer.id, {
        phone,
        address,
        updatedAt: getColombiaTimestamp()
      });
      
      // Update local customer state
      setSelectedCustomer({
        ...selectedCustomer,
        phone,
        address
      });
    } catch (error) {
      console.error('Error updating customer info:', error);
    }
  };

  // Handle updating technical service details
  const handleUpdateDetails = async () => {
    if (!selectedTechnicalService) return;
    
    setIsLoading(true);
    try {
      const updateData = {
        deviceImei: editingData.deviceImei,
        deviceBrandModel: editingData.deviceBrandModel,
        devicePassword: editingData.devicePassword,
        physicalCondition: editingData.physicalCondition,
        reportedIssue: editingData.reportedIssue,
        laborCost: editingData.laborCost,
        serviceCost: editingData.serviceCost,
        notes: editingData.notes,
        technicianId: editingData.technicianId,
        customerPhone: editableCustomerInfo.phone,
        customerAddress: editableCustomerInfo.address,
        updatedAt: getColombiaTimestamp()
      };

      await technicalServicesService.update(selectedTechnicalService.id, updateData);
      
      // Also update customer info if it has changed
      const currentCustomer = customers.find(c => c.id === selectedTechnicalService.customerId);
      if (currentCustomer && 
          (currentCustomer.phone !== editableCustomerInfo.phone || 
           currentCustomer.address !== editableCustomerInfo.address)) {
        await updateCustomerInfo(editableCustomerInfo.phone, editableCustomerInfo.address);
      }

      // Update local state
      const updatedService = {
        ...selectedTechnicalService,
        ...updateData
      };
      updateTechnicalServiceInState(updatedService);
      
      // Force refresh
      dispatch(fetchTechnicalServices());
      
      setIsEditingDetails(false);
      showSuccess('Información actualizada', 'Los datos del servicio técnico han sido actualizados correctamente.');
    } catch (error) {
      console.error('Error updating technical service details:', error);
      showError('Error al actualizar', 'No se pudieron actualizar los datos. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Layaways filtrados por búsqueda, estado y vendedor
  const filteredTechnicalServices = useMemo(() => {
    const filtered = allTechnicalServices.filter(layaway => {
      // Filtro por estado
      if (statusFilter !== 'all' && layaway.status !== statusFilter) return false;

      // Filtro por vendedor
      if (salesPersonFilter !== 'all' && layaway.salesPersonId !== salesPersonFilter) return false;

      // Filtro por rango de fechas (usando fecha local para evitar desfase UTC)
      if (dateFrom || dateTo) {
        const d = new Date(layaway.createdAt);
        const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateFrom && localDate < dateFrom) return false;
        if (dateTo && localDate > dateTo) return false;
      }

      // Filtro por búsqueda (ID, nombre cliente o repuesto)
      const search = searchTerm.trim().toLowerCase();
      if (!search) return true;
      const inId = layaway.id.toLowerCase().includes(search);
      const inCustomer = layaway.customerName?.toLowerCase().includes(search);
      const inParts = layaway.items?.some(item => item.partName?.toLowerCase().includes(search));
      return inId || inCustomer || inParts;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name_az':
          return (a.customerName || '').localeCompare(b.customerName || '');
        case 'name_za':
          return (b.customerName || '').localeCompare(a.customerName || '');
        case 'total_desc':
          return (b.totalAmount || 0) - (a.totalAmount || 0);
        case 'pending_desc':
          return (b.remainingBalance || 0) - (a.remainingBalance || 0);
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [allTechnicalServices, statusFilter, salesPersonFilter, searchTerm, sortBy, dateFrom, dateTo]);
  const forceRefreshTechnicalService = async (technicalServiceId: string) => {
    try {
      const allTechnicalServicesFromFirebase = await technicalServicesService.getAll();
      const updatedTechnicalService = allTechnicalServicesFromFirebase.find(ts => ts.id === technicalServiceId);
      if (updatedTechnicalService) {
        updateTechnicalServiceInState(updatedTechnicalService);
      }
    } catch (error) {}
  };


  // Utilidades para pagos múltiples (similar a Sales.tsx)
  const calculatePaymentCommission = (method: string, amount: number): number => {
    switch (method) {
      case 'card':
        return (amount * 0.0299) + 300; // 2.99% + $300
      case 'sistecredito':
        return amount * 0.02; // 2%
      case 'addi':
        const addiCommission = amount * 0.065; // 6.5%
        const addiIva = addiCommission * 0.19; // 19% IVA sobre la comisión
        return addiCommission + addiIva;
      case 'cash':
      default:
        return 0;
    }
  };

  const addPaymentMethod = (method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito', amount: number) => {
    if (amount <= 0) return;
    
    const commission = calculatePaymentCommission(method, amount);
    const newPayment: PaymentMethod = {
      method,
      amount,
      commission
    };
    
    setPaymentMethods(prev => [...prev, newPayment]);
  };

  const removePaymentMethod = (index: number) => {
    setPaymentMethods(prev => prev.filter((_, i) => i !== index));
  };

  const getTotalPaidAmount = () => {
    let paid = paymentMethods.reduce((sum, payment) => sum + payment.amount, 0);
    if (selectedCustomer && useCredit && selectedCustomer.credit > 0 && selectedTechnicalService) {
      const creditUsed = Math.min(selectedCustomer.credit, calculateRealTotals(selectedTechnicalService).remainingBalance - paid);
      paid += Math.max(0, creditUsed);
    }
    return paid;
  };

  const getRemainingAmount = () => {
    if (!selectedTechnicalService) return 0;
    return Math.max(0, calculateRealTotals(selectedTechnicalService).remainingBalance - getTotalPaidAmount());
  };

  // Utilidades para pagos múltiples en creación
  const addPaymentMethodCreate = (method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito', amount: number) => {
    if (amount <= 0) return;
    
    const commission = calculatePaymentCommission(method, amount);
    const newPayment: PaymentMethod = {
      method,
      amount,
      commission
    };
    
    setPaymentMethodsCreate(prev => [...prev, newPayment]);
  };

  const removePaymentMethodCreate = (index: number) => {
    setPaymentMethodsCreate(prev => prev.filter((_, i) => i !== index));
  };

  const getTotalPaidAmountCreate = () => {
    let paid = paymentMethodsCreate.reduce((sum, payment) => sum + payment.amount, 0);
    if (selectedCustomer && useCreditCreate && selectedCustomer.credit > 0) {
      const creditUsed = Math.min(selectedCustomer.credit, serviceCost - paid);
      paid += Math.max(0, creditUsed);
    }
    return paid;
  };

  const getRemainingAmountCreate = () => {
    return Math.max(0, serviceCost - getTotalPaidAmountCreate());
  };

  // Función auxiliar unificada para procesar pagos de servicios técnicos
  const processPayment = async (
    technicalService: TechnicalServicePlan,
    totalAmount: number,
    allPaymentMethods: { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' | 'credit'; amount: number; commission?: number }[],
    creditUsed: number,
    notes: string = ''
  ) => {
    // Crear un solo pago que combine todos los métodos
    const nonCreditMethod = allPaymentMethods.find(p => p.method !== 'credit');
    const primaryMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' = nonCreditMethod?.method as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' || 'efectivo';
    
    const newPayment = {
      id: crypto.randomUUID(),
      amount: totalAmount,
      paymentDate: getColombiaTimestamp(),
      paymentMethod: primaryMethod,
      paymentMethods: allPaymentMethods,
      notes: creditUsed > 0 ? 
        (notes ? `${notes} (usó ${formatCurrency(creditUsed)} de saldo a favor)` : `Usó ${formatCurrency(creditUsed)} de saldo a favor`) :
        notes,
      // Auditoría
      registeredBy: appUser?.uid,
      registeredByName: appUser?.displayName || appUser?.email,
      registeredAt: getColombiaTimestamp()
    };

    const newRemainingBalance = technicalService.remainingBalance - totalAmount;
    // Don't automatically change status to completed, keep it as active until manually closed
    const newStatus = technicalService.status;
    
    // Actualizar en Firebase
    const updatedPayments = [...technicalService.payments, newPayment];
    const updateData: any = {
      payments: updatedPayments.map(p => ({
        ...p,
        paymentMethod: (['efectivo', 'transferencia', 'tarjeta', 'crédito'].includes(p.paymentMethod) ? p.paymentMethod : 'efectivo') as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'
      })),
      remainingBalance: newRemainingBalance,
      status: newStatus
    };
    
    // completedAt will be set when service is manually closed
    
    await technicalServicesService.update(technicalService.id, updateData);

    // **NUEVA FUNCIONALIDAD: Registrar el abono como una venta**
    try {
      const { salesService } = await import('../services/firebase/firestore');
      
      // Calcular la ganancia real basada en la proporción del servicio técnico
      const serviceTotalCost = technicalService.items?.reduce((sum: number, item: any) => sum + (item.partCost * item.quantity), 0) || 0;
      const serviceLaborCost = technicalService.laborCost || 0;
      const serviceTotal = technicalService.total || (serviceTotalCost + serviceLaborCost);
      
      // Calcular la ganancia proporcional al pago:
      // Si es pago parcial, la ganancia es proporcional a la parte de mano de obra que le corresponde al negocio
      const laborProportion = serviceTotal > 0 ? serviceLaborCost / serviceTotal : 0;
      const businessLaborProportion = laborProportion * 0.5; // 50% del labor va al negocio
      const realProfit = totalAmount * businessLaborProportion;
      const realCost = totalAmount - realProfit;
      const realMargin = totalAmount > 0 ? (realProfit / totalAmount) * 100 : 0;


      // Crear datos de venta para el abono
      const saleData = {
        items: [], // Los servicios técnicos no tienen productos específicos en la venta del abono
        subtotal: totalAmount,
        discount: 0,
        tax: 0,
        total: totalAmount,
        finalTotal: totalAmount,
        totalCost: realCost, // Costo proporcional de los repuestos
        totalRevenue: totalAmount,
        totalProfit: realProfit, // Ganancia real (solo mano de obra)
        profitMargin: realMargin, // Margen real del servicio
        paymentMethod: primaryMethod,
        paymentMethods: allPaymentMethods.map(pm => ({
          method: pm.method,
          amount: pm.amount,
          commission: pm.commission || 0
        })),
        useMultiplePayments: allPaymentMethods.length > 1,
        totalCommissions: allPaymentMethods.reduce((sum, pm) => sum + (pm.commission || 0), 0),
        customerName: technicalService.customerName,
        customerId: technicalService.customerId,
        salesPersonId: appUser?.uid,
        salesPersonName: appUser?.displayName || appUser?.email,
        technicalServiceId: technicalService.id, // Referencia al servicio técnico
        type: 'technical_service_payment' as any, // Tipo para servicios técnicos
        notes: `💻 Pago servicio técnico: ${technicalService.deviceBrandModel || 'Dispositivo'} - Cliente: ${technicalService.customerName}${notes ? ` - ${notes}` : ''}`,
        // Información adicional del servicio técnico para mostrar en detalles
        technicalServiceDetails: {
          ...(technicalService.deviceBrandModel && { deviceBrandModel: technicalService.deviceBrandModel }),
          ...(technicalService.deviceImei && { deviceImei: technicalService.deviceImei }),
          ...(technicalService.reportedIssue && { reportedIssue: technicalService.reportedIssue }),
          ...(technicalService.technicianName && { technicianName: technicalService.technicianName }),
          ...(technicalService.status && { status: technicalService.status }),
          ...(technicalService.total !== undefined && { total: technicalService.total }),
          ...(technicalService.remainingBalance !== undefined && { remainingBalance: technicalService.remainingBalance - totalAmount }),
          ...(technicalService.estimatedCompletionDate && { estimatedCompletionDate: technicalService.estimatedCompletionDate })
        },
        createdAt: getColombiaTimestamp(),
        updatedAt: getColombiaTimestamp()
      };

      await salesService.add(saleData);
      console.log('💻 Abono de servicio técnico registrado como venta:', {
        type: saleData.type,
        salesPersonId: saleData.salesPersonId,
        salesPersonName: saleData.salesPersonName,
        total: saleData.total,
        createdAt: saleData.createdAt,
        technicalServiceId: saleData.technicalServiceId
      });
    } catch (saleError) {
      console.error('Error registrando abono como venta:', saleError);
      // No lanzamos el error para que no falle todo el proceso
    }

    return {
      updatedTechnicalService: {
        ...technicalService,
        payments: updatedPayments.map(p => ({
          ...p,
          paymentMethod: (['efectivo', 'transferencia', 'tarjeta', 'crédito'].includes(p.paymentMethod) ? p.paymentMethod : 'efectivo') as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'
        })),
        remainingBalance: newRemainingBalance,
        status: newStatus,
        updatedAt: getColombiaTimestamp()
      },
      newStatus,
      creditUsed
    };
  };

  const handleCreateLayaway = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const notes = formData.get('notes') as string || '';
      const deviceImei = formData.get('deviceImei') as string || '';
      const deviceBrandModel = formData.get('deviceBrandModel') as string || '';
      const devicePassword = formData.get('devicePassword') as string || '';
      const physicalCondition = formData.get('physicalCondition') as string || '';
      const reportedIssue = formData.get('reportedIssue') as string || '';
      const serviceCostInput = formData.get('serviceCost') as string || '0';
      const serviceCostValue = parseNumberInput(serviceCostInput);
      const assignedTechnicianId = formData.get('assignedTechnician') as string || '';
      
      // Buscar el nombre del técnico si se asignó uno
      const assignedTechnicianName = assignedTechnicianId 
        ? availableTechnicians.find(tech => tech.id === assignedTechnicianId)?.name || ''
        : '';

      // Usar el cliente seleccionado del combobox
      const customer = selectedCustomer;
      if (!customer) {
        showError('Error de validación', 'Debes seleccionar un cliente');
        setIsLoading(false);
        return;
      }

      // Técnico es obligatorio
      if (!assignedTechnicianId) {
        showError('Técnico requerido', 'Debes asignar un técnico antes de crear el servicio.');
        setIsLoading(false);
        return;
      }

      // Advertir si no hay repuestos (pero no bloquear)
      if (createServiceParts.length === 0) {
        const confirmed = await new Promise<boolean>((resolve) => {
          showConfirm(
            'Sin repuestos',
            'No has agregado repuestos al servicio. ¿Deseas continuar de todas formas?',
            () => resolve(true),
            () => resolve(false)
          );
        });
        if (!confirmed) {
          setIsLoading(false);
          return;
        }
      }

      // Los repuestos son opcionales - se puede crear un servicio técnico solo para revisión inicial

      // Procesar métodos de pago inicial
      let downPayment: number;
      let allPaymentMethodsCreate: { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' | 'credit'; amount: number; commission?: number }[] = [];
      let creditUsedCreate = 0;

      if (useMultiplePaymentsCreate) {
        // Validar pagos múltiples
        if (paymentMethodsCreate.length === 0) {
          showError('Error de validación', 'Debes agregar al menos un método de pago');
          setIsLoading(false);
          return;
        }
        
        downPayment = getTotalPaidAmountCreate();
        allPaymentMethodsCreate = [...paymentMethodsCreate.map(p => ({ method: p.method, amount: p.amount, commission: p.commission }))];
        
        // Agregar saldo a favor si está siendo usado
        if (useCreditCreate && customer && customer.credit > 0) {
          const totalParts = createServiceParts.reduce((sum, item) => sum + (item.partCost * item.quantity), 0);
          const totalItems = totalParts + (laborCost || 0);
          const availableCredit = Math.min(customer.credit, totalItems - paymentMethodsCreate.reduce((sum, p) => sum + p.amount, 0));
          if (availableCredit > 0) {
            creditUsedCreate = availableCredit;
            allPaymentMethodsCreate.push({ method: 'credit', amount: creditUsedCreate });
            downPayment += creditUsedCreate;
          }
        }
      } else {
        // Pago único tradicional
        const manualPayment = parseNumberInput(downPaymentDisplay) || 0;
        
        // Calcular el saldo a favor que se usará
        if (useCreditCreate && customer && customer.credit > 0) {
          // Si hay pago manual, usar el saldo disponible
          // Si no hay pago manual, usar todo el saldo disponible hasta el total de repuestos
          const totalParts = createServiceParts.reduce((sum, item) => {
            const itemTotal = item.partCost * item.quantity;
            return sum + itemTotal;
          }, 0);
          const totalItems = totalParts + (laborCost || 0);
          
          if (manualPayment > 0) {
            // Hay pago manual, usar saldo disponible sin límite del pago manual
            creditUsedCreate = Math.min(customer.credit, totalItems);
          } else {
            // No hay pago manual, usar todo el saldo disponible
            creditUsedCreate = Math.min(customer.credit, totalItems);
          }
        }
        
        // El downPayment total es la suma del pago manual + saldo a favor
        downPayment = manualPayment + creditUsedCreate;
        
        
        if (downPayment > 0) {
          if (creditUsedCreate > 0) {
            allPaymentMethodsCreate.push({ method: 'credit', amount: creditUsedCreate });
          }
          if (manualPayment > 0) {
            const commission = calculatePaymentCommission(currentPaymentMethodCreate, manualPayment);
            allPaymentMethodsCreate.push({ method: currentPaymentMethodCreate, amount: manualPayment, commission });
          }
        }
      }

      const technicalServiceItems: TechnicalServiceItem[] = [];
      let totalAmount = 0;
      let totalCost = 0;
      
      // Procesar repuestos si existen
      for (let i = 0; i < createServiceParts.length; i++) {
        const item = createServiceParts[i];
        if (item.quantity <= 0 || item.partCost < 0) {
          showError('Error de validación', `Cantidad y costo deben ser mayores a 0 para ${item.partName}`);
          setIsLoading(false);
          return;
        }
        const itemTotalCost = item.quantity * item.partCost;
        const technicalServiceItem: any = {
          id: crypto.randomUUID(),
          partName: item.partName,
          quantity: item.quantity,
          partCost: item.partCost,
          totalCost: itemTotalCost,
          status: 'solicitado'
        };
        
        // Add optional fields only if they have values
        if (item.partDescription) {
          technicalServiceItem.partDescription = item.partDescription;
        }
        technicalServiceItems.push(technicalServiceItem);
        totalAmount += itemTotalCost;
        totalCost += itemTotalCost;
      }
      
      // Calcular mano de obra automáticamente
      const laborCost = Math.max(0, serviceCostValue - totalCost);
      const technicianShare = laborCost * 0.5; // 50% para el técnico
      const businessShare = laborCost * 0.5;   // 50% para el negocio
      
      // El total amount es el costo del servicio técnico completo
      totalAmount = serviceCostValue;
      
      const expectedProfit = businessShare + (totalAmount - totalCost - laborCost); // Ganancia del negocio
      if (downPayment > totalAmount) {
        showError('Error de validación', 'El pago inicial no puede ser mayor al total');
        setIsLoading(false);
        return;
      }
      // Crear servicio técnico sin pago inicial (remainingBalance = totalAmount)
      const technicalServiceData: any = {
        items: technicalServiceItems,
        totalAmount,
        totalCost,
        expectedProfit,
        customerId: customer.id,
        customerName: customer.name,
        downPayment: 0, // Siempre 0, el pago inicial se manejará como un abono
        remainingBalance: totalAmount, // El saldo pendiente es el total
        payments: [], // Sin pagos iniciales
        status: 'active' as const,
        serviceCost: serviceCostValue,
        laborCost: laborCost,
        technicianShare: technicianShare,
        businessShare: businessShare
      };

      // Add optional fields only if they have values
      if (customer.phone) technicalServiceData.customerPhone = customer.phone;
      if (customer.address) technicalServiceData.customerAddress = customer.address;
      if (appUser?.uid) technicalServiceData.salesPersonId = appUser.uid;
      if (appUser?.displayName || appUser?.email) technicalServiceData.salesPersonName = appUser?.displayName || appUser?.email;
      if (deviceImei) technicalServiceData.deviceImei = deviceImei;
      if (deviceBrandModel) technicalServiceData.deviceBrandModel = deviceBrandModel;
      if (devicePassword) technicalServiceData.devicePassword = devicePassword;
      if (physicalCondition) technicalServiceData.physicalCondition = physicalCondition;
      if (reportedIssue) technicalServiceData.reportedIssue = reportedIssue;
      if (notes) technicalServiceData.notes = notes;
      if (assignedTechnicianId) technicalServiceData.technicianId = assignedTechnicianId;
      if (assignedTechnicianName) technicalServiceData.technicianName = assignedTechnicianName;

      // Agregar cortesías si existen
      if (courtesyItems.length > 0) {
        technicalServiceData.courtesyItems = courtesyItems;
        const courtesyTotalValue = courtesyItems.reduce((sum, item) => sum + item.totalValue, 0);
        const courtesyTotalCost = courtesyItems.reduce((sum, item) => sum + item.totalCost, 0);
        technicalServiceData.courtesyTotalValue = courtesyTotalValue;
        technicalServiceData.courtesyTotalCost = courtesyTotalCost;
      }

      // Crear servicio técnico
      const newTechnicalServiceId = await technicalServicesService.add(technicalServiceData);
      console.log('Technical service created with ID:', newTechnicalServiceId);
      
      // Force refresh of technical services data
      await dispatch(fetchTechnicalServices());

      // Obtener el servicio técnico recién creado para procesarle el pago inicial
      const newTechnicalService: TechnicalServicePlan = {
        id: newTechnicalServiceId,
        ...technicalServiceData,
        createdAt: getColombiaTimestamp(),
        updatedAt: getColombiaTimestamp()
      };

      // Procesar pago inicial si existe (usando la función unificada)
      if (downPayment > 0) {
        // Actualizar crédito del cliente si se usó saldo a favor (ANTES de procesar el pago)
        if (creditUsedCreate > 0 && customer) {
          await customersService.update(customer.id, { credit: customer.credit - creditUsedCreate });
        }
        
        await processPayment(
          newTechnicalService,
          downPayment,
          allPaymentMethodsCreate,
          creditUsedCreate,
          'Pago inicial'
        );
      }

      // Registrar cortesías en la colección de courtesies
      if (courtesyItems.length > 0) {
        const courtesyPromises = courtesyItems.map(async (courtesyItem) => {
          const courtesy = {
            saleId: newTechnicalServiceId,
            customerId: customer.id,
            customerName: customer.name,
            salesPersonId: appUser?.uid || '',
            salesPersonName: appUser?.displayName || appUser?.email || '',
            item: courtesyItem,
            reason: courtesyItem.reason
          };
          return courtesiesService.add(courtesy);
        });
        await Promise.all(courtesyPromises);
      }

      // Update customer information if provided
      if (editableCustomerInfo.phone || editableCustomerInfo.address) {
        const customerUpdates: Partial<{ phone: string; address: string; updatedAt: string }> = {
          updatedAt: getColombiaTimestamp()
        };
        
        if (editableCustomerInfo.phone && editableCustomerInfo.phone !== customer.phone) {
          customerUpdates.phone = editableCustomerInfo.phone;
        }
        
        if (editableCustomerInfo.address && editableCustomerInfo.address !== customer.address) {
          customerUpdates.address = editableCustomerInfo.address;
        }
        
        if (Object.keys(customerUpdates).length > 1) { // More than just updatedAt
          await customersService.update(customer.id, customerUpdates);
        }
      }
      
      resetCreateForm();
      setShowCreateForm(false);
      showSuccess(
        'Servicio técnico creado',
        `Servicio técnico para ${customer.name} creado exitosamente por ${formatCurrency(totalAmount)}${
          downPayment > 0 ? `. Pago inicial de ${formatCurrency(downPayment)} registrado${
            creditUsedCreate > 0 ? ` (incluye ${formatCurrency(creditUsedCreate)} de saldo a favor)` : ''
          }.` : ''
        }`
      );
      dispatch(fetchProducts());
      dispatch(fetchTechnicalServices());
      
      // Mostrar modal de impresión automáticamente después de crear el servicio
      setTimeout(async () => {
        try {
          const updatedService = await technicalServicesService.getById(newTechnicalServiceId);
          setShowPrintModal(updatedService);
        } catch (error) {
          console.error('Error fetching service for print:', error);
          // Usar datos locales como fallback
          setShowPrintModal(newTechnicalService);
        }
      }, 500);
    } catch (error) {
      console.error('Error creating technical service:', error);
      showError('Error al crear servicio técnico', 'No se pudo crear el servicio técnico. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // handleAddProducts removido por error de sintaxis y duplicidad

  const handleAddPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTechnicalService) return;
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const notes = formData.get('notes') as string || '';
      const customer = customers.find(c => c.id === selectedTechnicalService.customerId);

      let totalAmount: number;
      let allPaymentMethods: { method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' | 'credit'; amount: number; commission?: number }[] = [];
      let creditUsed = 0;

      if (useMultiplePayments) {
        // Validar pagos múltiples
        if (paymentMethods.length === 0) {
          showError('Error de validación', 'Debes agregar al menos un método de pago');
          setIsLoading(false);
          return;
        }
        
        totalAmount = getTotalPaidAmount();
        allPaymentMethods = [...paymentMethods.map(p => ({ method: p.method, amount: p.amount, commission: p.commission }))];
        
        // Agregar saldo a favor si está siendo usado
        if (useCredit && customer && customer.credit > 0) {
          const availableCredit = Math.min(customer.credit, calculateRealTotals(selectedTechnicalService).remainingBalance - paymentMethods.reduce((sum, p) => sum + p.amount, 0));
          if (availableCredit > 0) {
            creditUsed = availableCredit;
            allPaymentMethods.push({ method: 'credit', amount: creditUsed });
            totalAmount += creditUsed;
          }
        }

        if (Math.abs(totalAmount - calculateRealTotals(selectedTechnicalService).remainingBalance) > 0.01) {
          showError('Pago incompleto', `El total de los pagos (${formatCurrency(totalAmount)}) no coincide con el saldo pendiente (${formatCurrency(calculateRealTotals(selectedTechnicalService).remainingBalance)})`);
          setIsLoading(false);
          return;
        }
      } else {
        // Pago único tradicional
        const manualPayment = parseNumberInput(paymentAmount);
        const paymentMethod = formData.get('paymentMethod') as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito';
        
        // Calcular el saldo a favor que se usará
        if (useCredit && customer && customer.credit > 0) {
          // Usar todo el saldo disponible hasta el remaining balance
          creditUsed = Math.min(customer.credit, calculateRealTotals(selectedTechnicalService).remainingBalance);
        }
        
        // El totalAmount es la suma del pago manual + saldo a favor
        totalAmount = manualPayment + creditUsed;
        
        if (totalAmount <= 0 || totalAmount > calculateRealTotals(selectedTechnicalService).remainingBalance) {
          showError('Error de validación', 'El monto del pago no es válido');
          setIsLoading(false);
          return;
        }

        if (creditUsed > 0) {
          allPaymentMethods.push({ method: 'credit', amount: creditUsed });
        }
        if (manualPayment > 0) {
          const commission = calculatePaymentCommission(paymentMethod, manualPayment);
          allPaymentMethods.push({ method: paymentMethod, amount: manualPayment, commission });
        }
      }
      // Actualizar crédito en Firestore y local
      if (creditUsed > 0 && customer) {
        await customersService.update(customer.id, { credit: customer.credit - creditUsed });
        // Actualizar localmente si tienes un método, por ejemplo:
        // updateCustomerInState({ ...customer, credit: customer.credit - creditUsed });
      }

      // Usar la función unificada para procesar el pago
      const paymentResult = await processPayment(
        selectedTechnicalService,
        totalAmount,
        allPaymentMethods,
        creditUsed,
        notes
      );

      // Actualizar estado local inmediatamente
      updateTechnicalServiceInState(paymentResult.updatedTechnicalService);
      setShowPaymentForm(false);
      showSuccess(
        'Pago registrado',
        `Pago de ${formatCurrency(totalAmount)} registrado exitosamente. ${
          creditUsed > 0 ? `Se usó ${formatCurrency(creditUsed)} de saldo a favor. ` : ''
        }${
          paymentResult.newStatus === 'completed'
            ? '¡Plan separe completado! Todos los productos han sido marcados como recogidos automáticamente.'
            : `Saldo pendiente: ${formatCurrency(paymentResult.updatedTechnicalService.remainingBalance)}`
        }`
      );
      setTimeout(() => forceRefreshTechnicalService(selectedTechnicalService.id), 1000);
      dispatch(fetchTechnicalServices());
    } catch (error) {
      console.error('Error adding payment:', error);
      showError('Error al registrar pago', 'No se pudo registrar el pago. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsPickedUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!showPickupForm) return;

    const { item, technicalService } = showPickupForm;
    setIsLoading(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      const quantityToPickUp = parseInt(formData.get('quantity') as string);
      const notes = formData.get('notes') as string || '';

      const maxCanPickUp = item.quantity - (item.pickedUpQuantity || 0);
      
      if (quantityToPickUp <= 0 || quantityToPickUp > maxCanPickUp) {
        showError('Error de validación', `Solo puedes recoger entre 1 y ${formatNumber(maxCanPickUp)} unidades`);
        setIsLoading(false);
        return;
      }

      // Actualizar en Firebase
      await technicalServicesService.update(technicalService.id, {
        items: technicalService.items.map((i: TechnicalServiceItem) => {
          if (i.id === item.id) {
            const newPickupRecord = {
              id: crypto.randomUUID(),
              quantity: quantityToPickUp,
              date: getColombiaTimestamp(),
              notes
            };

            return {
              ...i,
              pickedUpQuantity: (i.pickedUpQuantity || 0) + quantityToPickUp,
              pickedUpHistory: [...(i.pickedUpHistory || []), newPickupRecord]
            };
          }
          return i;
        })
      });

      // Registrar venta real por productos entregados
      try {
        const { salesService } = await import('../services/firebase/firestore');
        
        // Registrar ganancia real al entregar producto
        const deliveryRevenue = quantityToPickUp * item.productSalePrice;
        const deliveryCost = quantityToPickUp * item.productPurchasePrice;
        const deliveryProfit = deliveryRevenue - deliveryCost;
        const deliveryMargin = deliveryRevenue > 0 ? (deliveryProfit / deliveryRevenue) * 100 : 0;

        const deliverySaleData = {
          items: [{
            productId: item.productId,
            productName: item.productName,
            quantity: quantityToPickUp, // Cantidad real entregada
            purchasePrice: item.productPurchasePrice,
            salePrice: item.productSalePrice,
            totalCost: deliveryCost, // ← Costo real del producto entregado
            totalRevenue: 0, // ← No revenue adicional (ya se contó en abono)
            profit: deliveryProfit // ← Ganancia real materializada
          }],
          subtotal: 0, // ← No revenue adicional
          discount: 0,
          tax: 0,
          total: 0, // ← No dinero adicional (solo ganancia)
          totalCost: deliveryCost, // ← Costo real
          totalProfit: deliveryProfit, // ← Ganancia real materializada
          profitMargin: deliveryMargin, // ← Margen real
          paymentMethod: 'efectivo' as 'efectivo',
          paymentMethods: [{ method: 'efectivo' as 'efectivo', amount: 0 }],
          customerName: technicalService.customerName,
          customerId: technicalService.customerId,
          isLayaway: true,
          layawayId: technicalService.id,
          type: 'layaway_delivery' as 'layaway_delivery', // Solo para tracking de entregas
          notes: `✅ Entrega servicio técnico: ${quantityToPickUp} x ${item.productName} (Valor: ${formatCurrency(deliveryRevenue)}) - Ganancia registrada${notes ? ` - ${notes}` : ''}`
        };

        await salesService.add(deliverySaleData);
      } catch (err) {
        console.error('Error registrando venta de entrega:', err);
      }

      // Actualizar estado local inmediatamente
      const updatedItems = technicalService.items.map((i: TechnicalServiceItem) => {
        if (i.id === item.id) {
          const newPickupRecord = {
            id: crypto.randomUUID(),
            quantity: quantityToPickUp,
            date: getColombiaTimestamp(),
            notes
          };

          return {
            ...i,
            pickedUpQuantity: (i.pickedUpQuantity || 0) + quantityToPickUp,
            pickedUpHistory: [...(i.pickedUpHistory || []), newPickupRecord]
          };
        }
        return i;
      });

      const updatedTechnicalService: TechnicalServicePlan = {
        ...technicalService,
        items: updatedItems,
        updatedAt: getColombiaTimestamp()
      };

      updateTechnicalServiceInState(updatedTechnicalService);
      
      setShowPickupForm(null);
      
      showSuccess(
        'Productos recogidos',
        `Se marcaron ${quantityToPickUp} unidades de "${item.productName}" como recogidas`
      );

      // Forzar actualización desde Firebase
      setTimeout(() => forceRefreshTechnicalService(technicalService.id), 1000);

    } catch (error) {
      console.error('Error marking as picked up:', error);
      showError('Error al marcar como recogido', 'No se pudo actualizar el estado. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!selectedTechnicalService) return;

    const paymentToCancel = selectedTechnicalService.payments.find(p => p.id === paymentId);
    if (!paymentToCancel) return;

    showConfirm(
      'Confirmar cancelación de pago',
      `¿Estás seguro de que quieres cancelar el pago de ${formatCurrency(paymentToCancel.amount)}? El saldo pendiente se actualizará automáticamente y el abono será eliminado del historial de ventas.`,
      async () => {
        setIsLoading(true);
        try {
          // Filtrar el pago cancelado
          const updatedPayments = selectedTechnicalService.payments.filter(p => p.id !== paymentId);
          // Recalcular saldo pendiente
          const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
          const newRemainingBalance = selectedTechnicalService.totalAmount - totalPaid;
          // Si el plan estaba completado y ahora tiene saldo pendiente, cambiar status a active y revertir productos marcados automáticamente como recogidos
          let newStatus = selectedTechnicalService.status;
          let updatedItems = selectedTechnicalService.items;
          if (selectedTechnicalService.status === 'completed' && newRemainingBalance > 0) {
            newStatus = 'active';
            updatedItems = selectedTechnicalService.items.map(item => {
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
          // Actualizar en Firebase el servicio técnico
          const updateData: any = {
            payments: updatedPayments,
            remainingBalance: newRemainingBalance,
            status: newStatus
          };
          if (newStatus === 'active' && selectedTechnicalService.status === 'completed') {
            updateData.items = updatedItems;
          }
          await technicalServicesService.update(selectedTechnicalService.id, updateData);
          // Eliminar el abono correspondiente en la colección de ventas
          try {
            const { salesService } = await import('../services/firebase/firestore');
            // Buscar el registro de venta del abono por layawayId, monto y tipo
            const allSales = await salesService.getAll();
            const abonoSale = allSales.find(sale =>
              sale.type === 'technical_service_payment' &&
              (sale as any).technicalServiceId === selectedTechnicalService.id &&
              sale.total === paymentToCancel.amount
            );
            if (abonoSale) {
              await salesService.delete(abonoSale.id);
              console.log('Venta de abono de servicio técnico eliminada:', abonoSale.id);
            } else {
              console.warn('No se encontró la venta correspondiente al abono cancelado');
            }
          } catch (err) {
            console.error('Error eliminando abono en ventas:', err);
          }
          // Actualizar estado local inmediatamente
          const updatedLayaway: LayawayPlan = {
            ...selectedTechnicalService,
            payments: updatedPayments,
            remainingBalance: newRemainingBalance,
            status: newStatus,
            items: updatedItems,
            updatedAt: getColombiaTimestamp()
          };
          updateTechnicalServiceInState(updatedLayaway);
          showSuccess(
            'Pago cancelado',
            `El pago de ${formatCurrency(paymentToCancel.amount)} ha sido cancelado y el abono eliminado del historial de ventas. ${
              newStatus === 'active' && selectedTechnicalService.status === 'completed'
                ? 'El servicio técnico ha vuelto a estado activo y se han revertido las recogidas automáticas.'
                : `Nuevo saldo pendiente: ${formatCurrency(newRemainingBalance)}`
            }`
          );
          // Forzar actualización desde Firebase
          setTimeout(() => forceRefreshTechnicalService(selectedTechnicalService.id), 1000);
          dispatch(fetchTechnicalServices());
        } catch (error) {
          console.error('Error cancelling payment:', error);
          showError('Error al cancelar pago', 'No se pudo cancelar el pago. Inténtalo de nuevo.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const handleRevertPickup = async (itemId: string, pickupId: string) => {
    if (!selectedTechnicalService) return;

    const item = selectedTechnicalService.items.find(i => i.id === itemId);
    if (!item) return;

    const pickupToRevert = item.pickedUpHistory?.find(p => p.id === pickupId);
    if (!pickupToRevert) return;

    showConfirm(
      'Confirmar reversión de recogida',
      `¿Estás seguro de que quieres revertir la recogida de ${pickupToRevert.quantity} unidades de "${item.productName}"? Estas unidades volverán a estar disponibles para recoger.`,
      async () => {
        setIsLoading(true);
        try {
          // Actualizar los items removiendo la recogida específica
          const updatedItems = selectedTechnicalService.items.map(i => {
            if (i.id === itemId) {
              // Filtrar la recogida que se va a revertir
              const updatedPickupHistory = i.pickedUpHistory?.filter(p => p.id !== pickupId) || [];
              
              // Recalcular cantidad recogida
              const newPickedUpQuantity = updatedPickupHistory.reduce(
                (sum, pickup) => sum + pickup.quantity, 0
              );

              return {
                ...i,
                pickedUpQuantity: newPickedUpQuantity,
                pickedUpHistory: updatedPickupHistory
              };
            }
            return i;
          });

          // Si el plan estaba completado y ahora tiene productos sin recoger completamente,
          // cambiar status a active
          let newStatus = selectedTechnicalService.status;
          const hasUnpickedItems = updatedItems.some(item => 
            (item.pickedUpQuantity || 0) < item.quantity
          );

          if (selectedTechnicalService.status === 'completed' && hasUnpickedItems) {
            newStatus = 'active';
          }

          // Actualizar en Firebase
          const updateData: any = {
            items: updatedItems,
            status: newStatus
          };

          await technicalServicesService.update(selectedTechnicalService.id, updateData);

          // Actualizar estado local inmediatamente
          const updatedLayaway: LayawayPlan = {
            ...selectedTechnicalService,
            items: updatedItems,
            status: newStatus,
            updatedAt: getColombiaTimestamp()
          };

          updateTechnicalServiceInState(updatedLayaway);
          
          showSuccess(
            'Recogida revertida',
            `Se ha revertido la recogida de ${pickupToRevert.quantity} unidades de "${item.productName}". ${
              newStatus === 'active' && selectedTechnicalService.status === 'completed'
                ? 'El servicio técnico ha vuelto a estado activo.'
                : 'Las unidades están disponibles para recoger nuevamente.'
            }`
          );

          // Forzar actualización desde Firebase
          setTimeout(() => forceRefreshTechnicalService(selectedTechnicalService.id), 1000);
          dispatch(fetchTechnicalServices());

        } catch (error) {
          console.error('Error reverting pickup:', error);
          showError('Error al revertir recogida', 'No se pudo revertir la recogida. Inténtalo de nuevo.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  // Función correcta para cancelar SERVICIOS TÉCNICOS (no planes separé)
  const handleCancelTechnicalService = async (service: TechnicalServicePlan) => {
    const totalPaid = service.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
    
    if (totalPaid > 0) {
      // Si el cliente pagó algo, mostrar modal para definir devolución/penalización
      setShowCancellationModal(service);
      setCancellationRefund('');
      setCancellationPenalty('');
    } else {
      // Si no pagó nada, mostrar modal para solo penalización
      setShowPenaltyModal(service);
      setPenaltyAmount('');
    }
  };

  // Función para procesar la cancelación con manejo de dinero
  const processCancellation = async (service: TechnicalServicePlan, refundAmount: number, penaltyAmount: number) => {
    setIsLoading(true);
    try {
      // Actualizar el estado del servicio técnico
      await technicalServicesService.update(service.id, { 
        status: 'cancelled',
        updatedAt: getColombiaTimestamp(),
        // Auditoría de cancelación
        cancelledBy: appUser?.uid,
        cancelledByName: appUser?.displayName || appUser?.email,
        statusChangedBy: appUser?.uid,
        statusChangedByName: appUser?.displayName || appUser?.email,
        statusChangedAt: getColombiaTimestamp()
      });

      // Si hay devolución, registrar como egreso (nota: aquí deberías integrar con tu sistema de caja)
      if (refundAmount > 0) {
        console.log(`💸 Egreso por devolución de cancelación: ${formatCurrency(refundAmount)}`);
        // TODO: Registrar en sistema de caja como egreso
      }

      // La penalización NO se registra como ingreso porque es dinero que ya estaba en caja
      // Solo es el monto que decides no devolver del pago original
      if (penaltyAmount > 0) {
        console.log(`📝 Penalización aplicada: ${formatCurrency(penaltyAmount)} (dinero retenido del pago original)`);
      }

      // Crear mensaje de éxito
      let successMessage = `El servicio técnico de ${service.customerName} se canceló correctamente.`;
      if (refundAmount > 0) {
        successMessage += ` Se devolvieron ${formatCurrency(refundAmount)} al cliente.`;
      }
      if (penaltyAmount > 0) {
        successMessage += ` Se cobraron ${formatCurrency(penaltyAmount)} como penalización.`;
      }

      showSuccess('Servicio técnico cancelado', successMessage);
      dispatch(fetchTechnicalServices());
      setShowCancellationModal(null);
    } catch (error) {
      console.error('Error cancelling technical service:', error);
      showError('Error al cancelar servicio técnico', 'No se pudo cancelar el servicio técnico. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Funciones de impresión para servicios técnicos
  const printCustomerReceipt = (service: TechnicalServicePlan) => {
    const customer = customers.find(c => c.id === service.customerId);
    const totalPaid = service.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    const realTotal = service.serviceCost !== undefined
      ? service.serviceCost
      : service.items.reduce((sum: number, item: any) => sum + item.totalCost, 0) + (service.laborCost || 0);
    const remainingBalance = realTotal - totalPaid;
    
    const printContent = `
      <html>
        <head>
          <title>Remisión</title>
          <style>
            @media print {
              @page { margin: 0 !important; size: 75mm auto !important; }
              * { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }
              html, body {
                width: 75mm !important;
                min-width: 75mm !important;
                max-width: 75mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              body, .remision-recibo {
                font-family: monospace, Arial, sans-serif !important;
                font-size: 14px !important;
                width: 75mm !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .remision-recibo {
                width: 75mm !important;
                margin: 0 !important;
                padding: 0 6mm 0 12mm !important;
              }
              .business-name {
                font-size: 24px !important;
                font-weight: bold !important;
                font-style: italic !important;
                letter-spacing: -1px !important;
                text-align: center !important;
                margin: 0 auto !important;
                display: block !important;
                color: #000 !important;
              }
              .header { text-align: center !important; }
              .business-info { text-align: center !important; font-size: 10px !important; line-height: 1.2 !important; margin-bottom: 1px !important; }
              .center { text-align: center !important; }
              .section { text-align: left !important; }
              .service-info { text-align: left !important; display: flex !important; justify-content: space-between !important; font-size: 10px !important; margin: 2mm 0 !important; }
              .financial-section { text-align: left !important; }
              .payment-info { text-align: left !important; display: flex !important; justify-content: space-between !important; margin: 2mm 0 !important; }
              .total { text-align: center !important; }
              .footer { text-align: center !important; }
              .flex-between { display: flex !important; justify-content: space-between !important; font-size: 11px !important; }
              h2 { text-align: center !important; font-size: 16px !important; margin: 8px 0 !important; font-weight: bold !important; }
            }
            body { width: 75mm; margin: 0; font-family: monospace, Arial, sans-serif; font-size: 14px; }
            .header { text-align: center; margin-bottom: 4mm; }
            .business-name { 
              font-size: 24px; 
              font-weight: bold; 
              font-style: italic; 
              letter-spacing: -1px; 
              text-align: center; 
              margin: 0 auto 8px auto; 
              display: block; 
              color: #000; 
            }
            .business-info { font-size: 10px; line-height: 1.2; text-align: center; margin-bottom: 1px; }
            .separator { border-top: 1px dashed #000; margin: 3mm 0; }
            .section { margin: 3mm 0; }
            .label { font-weight: 600; font-size: 10px; }
            .service-info { margin: 2mm 0; font-size: 10px; display: flex; justify-content: space-between; }
            .device-info { margin: 2mm 0; }
            .financial-section { margin: 4mm 0; padding: 2mm 0; }
            .total { font-weight: bold; font-size: 14px; margin: 2mm 0; text-align: center; }
            .payment-info { font-size: 13px; margin: 2mm 0; display: flex; justify-content: space-between; }
            .flex-between { display: flex; justify-content: space-between; font-size: 11px; }
            .footer { text-align: center; font-size: 11px; margin-top: 4mm; font-style: italic; }
            .center { text-align: center; }
            .remision-recibo { width: 75mm; margin: 0; padding: 0 6mm 0 12mm; }
            h2 { text-align: center; font-size: 16px; margin: 8px 0; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="remision-recibo">
          <div class="header">
            <div class="business-name">CELU MARIA</div>
            <div class="business-info">
              Reparación de Dispositivos Móviles<br>
              Carrera 45 # 71a-17<br>
              Celular +57 3043884525<br>
              Instagram @celu.maria
            </div>
          </div>
          
          <div class="separator"></div>
          
          <h2 class="center" style="font-size: 16px; margin: 8px 0; font-weight: bold;">Remisión Cliente</h2>
          <div class="center" style="font-size: 15px; margin-bottom: 8px;">Fecha de impresión: ${new Date().toLocaleString()}</div>
          
          <div class="separator"></div>
          
          <div class="section">
            <div class="service-info"><span class="label">Servicio #:</span> <span>${service.id}</span></div>
            <div class="service-info"><span class="label">Fecha de ingreso:</span> <span>${new Date(service.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</span></div>
            <div class="service-info"><span class="label">Cliente:</span> <span>${customer?.name || 'N/A'}</span></div>
            ${customer?.phone ? `<div class="service-info"><span class="label">Teléfono:</span> <span>${customer.phone}</span></div>` : ''}
          </div>
          
          <div class="separator"></div>
          
          <div class="section device-info">
            <div class="service-info"><span class="label">Dispositivo:</span> <span>${service.deviceBrandModel || 'N/A'}</span></div>
            ${service.deviceImei ? `<div class="service-info"><span class="label">IMEI:</span> <span>${service.deviceImei}</span></div>` : ''}
            ${service.physicalCondition ? `<div class="service-info"><span class="label">Estado físico:</span> <span>${service.physicalCondition}</span></div>` : ''}
            ${service.reportedIssue ? `<div class="service-info"><span class="label">Problema:</span> <span>${service.reportedIssue.length > 50 ? service.reportedIssue.substring(0, 50) + '...' : service.reportedIssue}</span></div>` : ''}
          </div>
          
          <div class="separator"></div>
          
          <div class="financial-section">
            <div class="flex-between" style="font-weight: bold; margin-bottom: 4mm; font-size: 13px;">
              <span>TOTAL A PAGAR:</span>
              <span>${formatCurrency(realTotal)}</span>
            </div>
            
            <div class="separator"></div>
            
            <div class="payment-info">
              <span>Pagado:</span>
              <span>${formatCurrency(totalPaid)}</span>
            </div>
            
            <div class="separator"></div>
            
            <div class="flex-between" style="font-weight: bold; margin-top: 4mm; font-size: 13px;">
              <span>SALDO PENDIENTE:</span>
              <span>${formatCurrency(remainingBalance)}</span>
            </div>
          </div>
          
          <div class="separator"></div>
          
          <div class="footer">
            <div>"Celu María tecnología confiable, gente real, soluciones honestas!"</div>
            <div style="margin-top: 2mm;">Gracias por confiar en nosotros</div>
            <div style="margin-top: 1mm; font-weight: bold;">CONSERVE ESTE COMPROBANTE</div>
          </div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }
  };

  const printWorkLabel = (service: TechnicalServicePlan) => {
    const customer = customers.find(c => c.id === service.customerId);
    
    const printContent = `
      <html>
        <head>
          <title>Etiqueta Trabajo - ${service.id}</title>
          <style>
            @media print {
              @page { margin: 0; size: 58mm auto; }
              body { margin: 0; padding: 2mm; font-family: monospace; font-size: 9px; line-height: 1.1; }
            }
            body { font-family: monospace; font-size: 9px; line-height: 1.1; max-width: 54mm; }
            .header { text-align: center; margin-bottom: 2mm; font-weight: bold; }
            .separator { border-top: 1px dashed #000; margin: 2mm 0; }
            .section { margin: 1.5mm 0; }
            .label { font-weight: bold; }
            .notes { border: 1px solid #000; padding: 1mm; margin: 2mm 0; min-height: 10mm; }
          </style>
        </head>
        <body>
          <div class="header">ETIQUETA DE TRABAJO</div>
          
          <div class="section">
            <div><span class="label">ID:</span> ${service.id}</div>
            <div><span class="label">Fecha:</span> ${new Date(service.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</div>
            <div><span class="label">Cliente:</span> ${customer?.name || 'N/A'}</div>
            ${customer?.phone ? `<div><span class="label">Tel:</span> ${customer.phone}</div>` : ''}
          </div>
          
          <div class="separator"></div>
          
          <div class="section">
            <div><span class="label">Dispositivo:</span> ${service.deviceBrandModel || 'N/A'}</div>
            ${service.deviceImei ? `<div><span class="label">IMEI:</span> ${service.deviceImei}</div>` : ''}
            ${service.devicePassword ? `<div><span class="label">Clave:</span> ${service.devicePassword}</div>` : ''}
            ${service.physicalCondition ? `<div><span class="label">Estado:</span> ${service.physicalCondition}</div>` : ''}
            ${service.reportedIssue ? `<div><span class="label">Problema:</span> ${service.reportedIssue}</div>` : ''}
          </div>
          
          ${service.notes ? `
          <div class="separator"></div>
          <div class="section">
            <div class="label">Notas Adicionales:</div>
            <div class="notes">${service.notes}</div>
          </div>
          ` : ''}
          
          <div class="separator"></div>
          
          <div class="section">
            <div><span class="label">Total:</span> ${formatCurrency(service.totalAmount)}</div>
            <div><span class="label">Abono:</span> ${formatCurrency(service.payments?.reduce((sum, p) => sum + p.amount, 0) || 0)}</div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Activo';
      case 'completed': return 'Finalizado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  // Helper function to calculate real totals
  const calculateRealTotals = (service: any) => {
    const totalPaid = service.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
    
    // Usar el nuevo sistema de costos si está disponible
    let realTotal = 0;
    
    if (service.serviceCost !== undefined) {
      // Nuevo sistema: serviceCost es el total que paga el cliente
      realTotal = service.serviceCost;
    } else {
      // Sistema anterior para compatibilidad
      realTotal = service.items.reduce((sum: number, item: any) => sum + item.totalCost, 0) + (service.laborCost || 0);
    }
    
    const remainingBalance = realTotal - totalPaid;
    return { totalPaid, realTotal, remainingBalance };
  };

  const calculateProgress = (service: any) => {
    const { totalPaid, realTotal } = calculateRealTotals(service);
    // Fix: Handle division by zero when realTotal is 0
    const paymentProgress = realTotal > 0 ? (totalPaid / realTotal) * 100 : 0;
    
    return { paymentProgress };
  };

  // Estadísticas
  const stats = useMemo(() => {
    const activeLayaways = allTechnicalServices.filter(l => l.status === 'active');
    const completedLayaways = allTechnicalServices.filter(l => l.status === 'completed');
    const cancelledLayaways = allTechnicalServices.filter(l => l.status === 'cancelled');
    
    // Calcular ingresos de servicios completados en los últimos 2 meses
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    
    const totalCompletedRevenue = completedLayaways.reduce((sum, service) => {
      // Verificar si el servicio fue completado en los últimos 2 meses
      const completedDate = new Date(service.completedAt || service.updatedAt);
      if (completedDate >= twoMonthsAgo) {
        const totalPaid = service.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
        return sum + totalPaid;
      }
      return sum;
    }, 0);
    
    // Contar repuestos pendientes (no instalados) en servicios activos
    const pendingParts = activeLayaways.reduce((sum, service) => {
      const notInstalledParts = service.items.filter(item => item.status !== 'instalado').length;
      return sum + notInstalledParts;
    }, 0);
    
    // Calcular ingresos reales de planes cancelados (dinero por productos ya recogidos)
    const cancelledRealRevenue = cancelledLayaways.reduce((sum, l) => {
      const totalPaid = l.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      const pickedUpValue = l.items.reduce((itemSum, item) => {
        const pickedUpQuantity = item.pickedUpQuantity || 0;
        const itemValue = pickedUpQuantity * item.productSalePrice;
        return itemSum + itemValue;
      }, 0);
      
      // Los ingresos reales son el menor entre lo pagado y el valor de lo recogido
      const realRevenue = Math.min(totalPaid, pickedUpValue);
      return sum + realRevenue;
    }, 0);
    
    // Calcular ingresos reales: dinero pagado que corresponde a productos ya recogidos
    const totalRevenue = [...activeLayaways, ...completedLayaways].reduce((sum, l) => {
      const totalPaid = l.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      const pickedUpValue = l.items.reduce((itemSum, item) => {
        const pickedUpQuantity = item.pickedUpQuantity || 0;
        const itemValue = pickedUpQuantity * item.productSalePrice;
        return itemSum + itemValue;
      }, 0);
      
      // Los ingresos reales son el menor entre lo pagado y el valor de lo recogido
      // Esto asegura que solo contamos dinero realmente ganado por productos entregados
      const realRevenue = Math.min(totalPaid, pickedUpValue);
      return sum + realRevenue;
    }, 0) + cancelledRealRevenue; // Incluir ingresos reales de planes cancelados
    
    // Dinero pagado pero productos no recogidos (en planes activos y completados)
    const paidButNotPickedUp = [...activeLayaways, ...completedLayaways].reduce((sum, l) => {
      const totalPaid = l.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      const pickedUpValue = l.items.reduce((itemSum, item) => {
        const pickedUpQuantity = item.pickedUpQuantity || 0;
        const itemValue = pickedUpQuantity * item.productSalePrice;
        return itemSum + itemValue;
      }, 0);
      
      // La diferencia entre lo pagado y el valor de lo recogido
      const pendingPickupValue = totalPaid - pickedUpValue;
      return sum + Math.max(0, pendingPickupValue); // Asegurar que no sea negativo
    }, 0);
    
    // Dinero de planes cancelados que necesita ser manejado
    const cancelledPayments = cancelledLayaways.reduce((sum, l) => {
      const totalPaid = l.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0);
      const pickedUpValue = l.items.reduce((itemSum, item) => {
        const pickedUpQuantity = item.pickedUpQuantity || 0;
        const itemValue = pickedUpQuantity * item.productSalePrice;
        return itemSum + itemValue;
      }, 0);
      
      // Solo el dinero excedente (pagado - valor de productos recogidos) requiere manejo
      const moneyRequiringHandling = totalPaid - pickedUpValue;
      return sum + Math.max(0, moneyRequiringHandling);
    }, 0);
    
    const pendingRevenue = activeLayaways.reduce((sum, l) => sum + l.remainingBalance, 0);
    const expectedProfit = activeLayaways.reduce((sum, l) => sum + l.expectedProfit, 0);
    
    return {
      totalTechnicalServices: allTechnicalServices.length,
      activeTechnicalServices: activeLayaways.length,
      completedTechnicalServices: completedLayaways.length,
      cancelledLayaways: cancelledLayaways.length,
      totalRevenue,
      pendingRevenue,
      expectedProfit,
      // Saldo a favor pendiente (cancelaciones + devoluciones - uso en ventas)
      pendingCustomerCredit: Math.max(0, cancelledPayments - usedCreditInSales),
      paidButNotPickedUp,
      // New technical service specific metrics
      totalCompletedRevenue,
      pendingParts
    };
  }, [allTechnicalServices, usedCreditInSales, creditDataLoaded]);

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* Header */}
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Servicio Técnico</h1>
            <p className="text-gray-600 mt-1">Gestiona los servicios técnicos y reparaciones</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-sm md:text-base"
          >
            <Plus className="h-4 w-4 md:h-5 md:w-5" />
            <span className="hidden sm:inline">Nuevo Servicio Técnico</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards - Hidden when creating new plan */}
      {!showCreateForm && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Total Servicios */}
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                <Settings className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
              </div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Total Servicios
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                {stats.totalTechnicalServices}
              </p>
            </div>
          </div>

          {/* Activos */}
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-5 h-5 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
                <Clock className="w-3 h-3 text-orange-600 group-hover:text-orange-700" />
              </div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Activos
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-orange-900 transition-colors duration-300">
                {stats.activeTechnicalServices}
              </p>
            </div>
          </div>

          {/* Finalizados */}
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-5 h-5 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
                <CheckCircle className="w-3 h-3 text-green-600 group-hover:text-green-700" />
              </div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Finalizados
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">
                {stats.completedTechnicalServices}
              </p>
            </div>
          </div>

          {/* Ingresos Totales */}
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-5 h-5 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
                <DollarSign className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
              </div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Ingresos Totales
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
                {formatCurrency(stats.totalCompletedRevenue || 0)}
              </p>
            </div>
          </div>

          {/* Repuestos Pendientes */}
          <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-0.5 hover:border-amber-300 transition-all duration-300 ease-out">
            <div className="text-center">
              <div className="w-5 h-5 mx-auto mb-1 bg-amber-50 rounded flex items-center justify-center group-hover:bg-amber-100 group-hover:scale-110 transition-all duration-300">
                <Package className="w-3 h-3 text-amber-600 group-hover:text-amber-700" />
              </div>
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                Repuestos Pendientes
              </p>
              <p className="text-base font-bold text-slate-900 group-hover:text-amber-900 transition-colors duration-300">
                {stats.pendingParts || 0}
              </p>
            </div>
          </div>

          {/* Conditional Cards - Only show when data exists */}
          {stats.paidButNotPickedUp > 0 && (
            <div className="group relative bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg shadow-lg border border-yellow-200 p-2 hover:shadow-xl hover:shadow-yellow-500/20 hover:-translate-y-0.5 hover:border-yellow-300 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-yellow-50 rounded flex items-center justify-center group-hover:bg-yellow-100 group-hover:scale-110 transition-all duration-300">
                  <AlertCircle className="w-3 h-3 text-yellow-600 group-hover:text-yellow-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Pagado sin Recoger
                </p>
                <p className="text-base font-bold text-yellow-600 group-hover:text-yellow-800 transition-colors duration-300">
                  {formatCurrency(stats.paidButNotPickedUp)}
                </p>
              </div>
            </div>
          )}

          {creditDataLoaded && stats.pendingCustomerCredit > 0 && (
            <div className="group relative bg-white rounded-lg shadow-lg border border-blue-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-400 transition-all duration-300 ease-out">
              <div className="text-center">
                <div className="w-5 h-5 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                  <User className="w-3 h-3 text-blue-600 group-hover:text-blue-700" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
                  Saldo a Favor
                </p>
                <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
                  {formatCurrency(stats.pendingCustomerCredit)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search and Filter - Hidden when creating new plan */}
      {!showCreateForm && (
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-300 space-y-3">
          {/* Fila 1: búsqueda + rango de fechas */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente o repuesto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 md:pl-10 pr-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                title="Desde"
              />
              <span className="text-gray-400 text-sm shrink-0">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                title="Hasta"
              />
            </div>
          </div>

          {/* Fila 2: filtros de estado, vendedor y orden */}
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Solo activos</option>
              <option value="completed">Solo finalizados</option>
              <option value="cancelled">Solo cancelados</option>
            </select>

            <select
              value={salesPersonFilter}
              onChange={(e) => setSalesPersonFilter(e.target.value)}
              className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos los vendedores</option>
              {availableUsers.map(user => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName || user.email}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="newest">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="name_az">Cliente A-Z</option>
              <option value="name_za">Cliente Z-A</option>
              <option value="total_desc">Mayor total</option>
              <option value="pending_desc">Mayor pendiente</option>
            </select>
          </div>
        </div>
      )}

      {/* Create Layaway Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow-sm border border-gray-300">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base md:text-lg font-semibold text-gray-900">Crear Nuevo Servicio Técnico</h3>
            <button
              onClick={() => {
                resetCreateForm();
                setShowCreateForm(false);
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="h-5 w-5 md:h-6 md:w-6" />
            </button>
          </div>
          
          <form ref={formRef} onSubmit={handleCreateLayaway} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente *
                </label>
                <CustomerComboBox
                  customers={customers}
                  isLoading={isLoading}
                  onChange={handleCustomerSelect}
                />
              </div>

              {/* Customer phone and address fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono del Cliente
                  </label>
                  <input
                    type="text"
                    id="customerPhone"
                    name="customerPhone"
                    value={editableCustomerInfo.phone}
                    onChange={(e) => setEditableCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                    
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección del Cliente
                  </label>
                  <input
                    type="text"
                    id="customerAddress"
                    name="customerAddress"
                    value={editableCustomerInfo.address}
                    onChange={(e) => setEditableCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                    
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="deviceImei" className="block text-sm font-medium text-gray-700 mb-1">
                  IMEI del Dispositivo
                </label>
                <input
                  type="text"
                  id="deviceImei"
                  name="deviceImei"
                  
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="deviceBrandModel" className="block text-sm font-medium text-gray-700 mb-1">
                  Marca y Referencia del Equipo
                </label>
                <input
                  type="text"
                  id="deviceBrandModel"
                  name="deviceBrandModel"
                  
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="devicePassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña del Equipo
                </label>
                <input
                  type="text"
                  id="devicePassword"
                  name="devicePassword"
                  
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="physicalCondition" className="block text-sm font-medium text-gray-700 mb-1">
                  Estado Físico del Equipo al Recibir
                </label>
                <textarea
                  id="physicalCondition"
                  name="physicalCondition"
                  rows={2}
                  
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
                />
              </div>

              <div>
                <label htmlFor="reportedIssue" className="block text-sm font-medium text-gray-700 mb-1">
                  Falla Reportada *
                </label>
                <textarea
                  id="reportedIssue"
                  name="reportedIssue"
                  rows={3}
                  
                  disabled={isLoading}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
                />
              </div>

              <div>
                <label htmlFor="serviceCost" className="block text-sm font-medium text-gray-700 mb-1">
                  Costo Servicio Técnico *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  id="serviceCost"
                  name="serviceCost"
                  value={formatNumberInput(serviceCost.toString())}
                  disabled={isLoading}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  onChange={(e) => {
                    const formatted = formatNumberInput(e.target.value);
                    const numericValue = parseNumberInput(formatted);
                    setServiceCost(numericValue);
                    e.target.value = formatted;
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Valor total que pagará el cliente por el servicio
                </p>
              </div>


              <div>
                <label htmlFor="assignedTechnician" className="block text-sm font-medium text-gray-700 mb-1">
                  Técnico Asignado
                </label>
                <select
                  id="assignedTechnician"
                  name="assignedTechnician"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                >
                  <option value="">Seleccionar técnico (opcional)</option>
                  {availableTechnicians.map(technician => (
                    <option key={technician.id} value={technician.id}>
                      {technician.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-4">
                {/* Usar saldo a favor */}
                {selectedCustomer && selectedCustomer.credit > 0 && (
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="useCreditCreate"
                        checked={useCreditCreate}
                        onChange={e => setUseCreditCreate(e.target.checked)}
                        disabled={isLoading}
                      />
                      <label htmlFor="useCreditCreate" className="text-sm text-gray-700">
                        Usar saldo a favor ({formatCurrency(selectedCustomer.credit)})
                      </label>
                    </div>
                    {useCreditCreate && (
                      <div className="text-xs text-green-600 mt-1">
                        Saldo disponible: {formatCurrency(selectedCustomer.credit)}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Pago Inicial
                  </label>
                  <label className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={useMultiplePaymentsCreate}
                      onChange={(e) => {
                        setUseMultiplePaymentsCreate(e.target.checked);
                        if (!e.target.checked) {
                          setPaymentMethodsCreate([]);
                        }
                      }}
                      disabled={isLoading}
                      className="mr-2 disabled:opacity-50"
                    />
                    Pagos múltiples
                  </label>
                </div>

                {!useMultiplePaymentsCreate ? (
                  // Método de pago único
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto (COP)
                      </label>
                      <input
                        type="text"
                        value={downPaymentDisplay}
                        onChange={handleDownPaymentChange}
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Método de Pago
                      </label>
                      <select
                        value={currentPaymentMethodCreate}
                        onChange={(e) => setCurrentPaymentMethodCreate(e.target.value as any)}
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="crédito">Crédito</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  // Modo de pagos múltiples
                  <div className="space-y-3">
                    {/* Total de productos */}
                    {createServiceParts.length > 0 && (
                      <div className="p-2 bg-blue-50 rounded-lg text-sm">
                        <div className="flex justify-between">
                          <span>Total productos:</span>
                          <span className="font-medium">{formatCurrency(createServiceParts.reduce((sum, item) => sum + (item.partCost * item.quantity), 0))}</span>
                        </div>
                      </div>
                    )}

                    {/* Lista de pagos agregados */}
                    {paymentMethodsCreate.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700">Pagos agregados:</h4>
                        {paymentMethodsCreate.map((payment, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {payment.method === 'efectivo' ? 'Efectivo' :
                                 payment.method === 'transferencia' ? 'Transferencia' :
                                 payment.method === 'tarjeta' ? 'Tarjeta' : 
                                 payment.method === 'crédito' ? 'Crédito' : payment.method}
                              </div>
                              <div className="text-xs text-gray-600">
                                {formatCurrency(payment.amount)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePaymentMethodCreate(index)}
                              disabled={isLoading}
                              className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span>Total pagado:</span>
                          <span className="font-medium">{formatCurrency(getTotalPaidAmountCreate())}</span>
                        </div>
                        {createServiceParts.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Restante:</span>
                            <span className={`font-medium ${getRemainingAmountCreate() > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {formatCurrency(getRemainingAmountCreate())}
                            </span>
                          </div>
                        )}
                        {createServiceParts.length === 0 && paymentMethodsCreate.length > 0 && (
                          <div className="text-xs text-blue-600 mt-1">
                            Selecciona productos para calcular el total restante
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agregar nuevo pago */}
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Agregar pago:</h4>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={currentPaymentMethodCreate}
                              onChange={(e) => setCurrentPaymentMethodCreate(e.target.value as any)}
                              disabled={isLoading}
                              className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm ${createServiceParts.length > 0 ? 'flex-1' : 'w-full'}`}
                            >
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="crédito">Crédito</option>
                            </select>
                            {createServiceParts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const remaining = getRemainingAmountCreate();
                                  if (remaining > 0) {
                                    addPaymentMethodCreate(currentPaymentMethodCreate, remaining);
                                  }
                                }}
                                disabled={isLoading || getRemainingAmountCreate() <= 0}
                                className="px-3 py-2 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                              >
                                Todo
                              </button>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <input
                              type="text"
                              
                              disabled={isLoading}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              onChange={(e) => {
                                const numeric = parseNumberInput(e.target.value);
                                if (createServiceParts.length > 0) {
                                  const remaining = getRemainingAmountCreate();
                                  const limitedValue = Math.min(numeric, remaining);
                                  e.target.value = formatNumberInput(limitedValue.toString());
                                } else {
                                  e.target.value = formatNumberInput(numeric.toString());
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const amount = parseNumberInput(e.currentTarget.value);
                                  if (amount > 0) {
                                    if (createServiceParts.length === 0 || amount <= getRemainingAmountCreate()) {
                                      addPaymentMethodCreate(currentPaymentMethodCreate, amount);
                                      e.currentTarget.value = '';
                                    }
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement;
                                const amount = parseNumberInput(input?.value || '0');
                                if (amount > 0) {
                                  if (createServiceParts.length === 0 || amount <= getRemainingAmountCreate()) {
                                    addPaymentMethodCreate(currentPaymentMethodCreate, amount);
                                    if (input) input.value = '';
                                  }
                                }
                              }}
                              disabled={isLoading}
                              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repuestos Necesarios
              </label>
              
              {/* Lista de repuestos agregados */}
              {createServiceParts.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Repuestos agregados:</h4>
                  <div className="space-y-2">
                    {createServiceParts.map((part, index) => (
                      <div key={part.id} className="flex items-center justify-between bg-white p-2 rounded border">
                        <div className="flex-1">
                          <span className="font-medium">{part.partName}</span>
                          {part.partDescription && (
                            <span className="text-gray-500 text-sm ml-2">- {part.partDescription}</span>
                          )}
                          <div className="text-sm text-gray-600">
                            Cantidad: {part.quantity} × {formatCurrency(part.partCost)} = {formatCurrency(part.totalCost)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newParts = createServiceParts.filter((_, i) => i !== index);
                            setCreateServiceParts(newParts);
                          }}
                          className="text-red-600 hover:text-red-800 ml-2"
                          disabled={isLoading}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulario para agregar nuevo repuesto */}
              <div className="p-3 border border-gray-300 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Agregar repuesto (opcional):</h4>
                  <span className="text-xs text-gray-500 italic">Se puede crear el servicio sin repuestos para revisión inicial</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del repuesto"
                    id="partName"
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Descripción (opcional)"
                    id="partDescription"
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    disabled={isLoading}
                  />
                  <input
                    type="number"
                    placeholder="Cantidad"
                    id="partQuantity"
                    min="1"
                    defaultValue="1"
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Costo unitario"
                    id="partCost"
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                    disabled={isLoading}
                    onChange={(e) => {
                      const formatted = formatNumberInput(e.target.value);
                      e.target.value = formatted;
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const partName = (document.getElementById('partName') as HTMLInputElement).value.trim();
                    const partDescription = (document.getElementById('partDescription') as HTMLInputElement).value.trim();
                    const partQuantity = parseInt((document.getElementById('partQuantity') as HTMLInputElement).value) || 1;
                    const partCostInput = (document.getElementById('partCost') as HTMLInputElement).value.trim();
                    const partCost = parseNumberInput(partCostInput);

                    if (!partName) {
                      showError('Error', 'Ingresa el nombre del repuesto');
                      return;
                    }
                    if (partCost <= 0) {
                      showError('Error', 'Ingresa un costo válido');
                      return;
                    }

                    const newPart: TechnicalServiceItem = {
                      id: crypto.randomUUID(),
                      partName,
                      partDescription: partDescription || undefined,
                      quantity: partQuantity,
                      partCost,
                      totalCost: partQuantity * partCost,
                      status: 'solicitado',
                      // Auditoría
                      addedBy: appUser?.uid,
                      addedByName: appUser?.displayName || appUser?.email,
                      addedAt: getColombiaTimestamp()
                    };

                    setCreateServiceParts([...createServiceParts, newPart]);

                    // Limpiar campos
                    (document.getElementById('partName') as HTMLInputElement).value = '';
                    (document.getElementById('partDescription') as HTMLInputElement).value = '';
                    (document.getElementById('partQuantity') as HTMLInputElement).value = '1';
                    (document.getElementById('partCost') as HTMLInputElement).value = '';
                  }}
                  disabled={isLoading}
                  className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 inline mr-1" />
                  Agregar Repuesto (Opcional)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notas (Opcional)
              </label>
              <textarea
                name="notes"
                rows={3}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"

              />
            </div>

            {/* Cortesías */}
            {courtesyItems.length > 0 && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-cyan-700 mb-2 flex items-center space-x-2">
                  <Gift className="h-4 w-4" />
                  <span>Cortesías ({courtesyItems.length})</span>
                </h3>
                <div className="space-y-2">
                  {courtesyItems.map((courtesy: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-cyan-300">
                      <div className="flex-1">
                        <div className="font-medium text-cyan-900">{courtesy.productName}</div>
                        <div className="text-xs text-cyan-600">
                          Valor: {formatCurrency(courtesy.normalPrice)} × {courtesy.quantity} = {formatCurrency(courtesy.totalValue)}
                        </div>
                        {courtesy.reason && (
                          <div className="text-xs text-cyan-500 italic mt-1">
                            {courtesy.reason}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCourtesy(index)}
                        className="p-2 text-cyan-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar cortesía"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón añadir cortesía */}
            <button
              type="button"
              onClick={handleOpenCourtesyModal}
              disabled={isLoading || !selectedCustomer}
              className="w-full bg-cyan-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-cyan-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mb-3"
            >
              <Gift className="h-5 w-5" />
              <span>Añadir Cortesía</span>
            </button>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  resetCreateForm();
                  setShowCreateForm(false);
                }}
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
                  {isLoading ? 'Creando...' : 'Crear Servicio Técnico'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Layaways Grid - Hidden when creating new plan */}
      {!showCreateForm && (
        <>
          {/* Indicadores de filtros activos */}
          {(statusFilter !== 'active' || salesPersonFilter !== 'all' || searchTerm.trim() || dateFrom || dateTo) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-blue-800 font-medium">Filtros activos:</span>
                
                {statusFilter !== 'active' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Estado: {statusFilter === 'all' ? 'Todos' : statusFilter === 'completed' ? 'Finalizados' : statusFilter === 'cancelled' ? 'Cancelados' : statusFilter}
                    <button
                      onClick={() => setStatusFilter('active')}
                      className="ml-1 text-blue-600 hover:text-blue-800"
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

                {searchTerm.trim() && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Búsqueda: "{searchTerm}"
                    <button
                      onClick={() => setSearchTerm('')}
                      className="ml-1 text-green-600 hover:text-green-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Fecha: {dateFrom || '...'} — {dateTo || '...'}
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="ml-1 text-purple-600 hover:text-purple-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                <span className="text-sm text-blue-700">({filteredTechnicalServices.length} servicios encontrados)</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTechnicalServices.map((layaway) => {
          const { paymentProgress } = calculateProgress(layaway);
          
          return (
            <div key={layaway.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-300 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold text-gray-900">{layaway.customerName}</h3>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      {layaway.deviceBrandModel && (
                        <div>📱 {layaway.deviceBrandModel}</div>
                      )}
                      {layaway.salesPersonName && (
                        <div>👤 {layaway.salesPersonName}</div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end space-y-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(layaway.status)}`}>
                    {getStatusText(layaway.status)}
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setSelectedTechnicalService(layaway)}
                      className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors"
                      title="Ver detalles"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {/*
                    <button
                      onClick={() => handleDeleteLayaway(layaway)}
                      className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Eliminar plan"
                      disabled={isLoading}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>*/}
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="space-y-3 mb-4">
                {(() => {
                  const { totalPaid, realTotal, remainingBalance } = calculateRealTotals(layaway);
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total:</span>
                        <span className="font-medium">{formatCurrency(realTotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pagado:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(totalPaid)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pendiente:</span>
                        <span className="font-medium text-orange-600">
                          {formatCurrency(remainingBalance)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Progress Bars */}
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Progreso de Pagos</span>
                    <span>{(paymentProgress || 0).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${paymentProgress || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Items Summary */}
              <div className="text-sm text-gray-600 mb-4">
                <div className="flex items-center">
                  <Package className="h-4 w-4 mr-1" />
                  <span>{layaway.items.length} producto(s)</span>
                </div>
              </div>

              {/* Actions */}
              {layaway.status === 'active' && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setSelectedTechnicalService(layaway);
                      setShowPaymentForm(true);
                    }}
                    className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-1"
                  >
                    <DollarSign className="h-4 w-4" />
                    <span>Pagar</span>
                  </button>
                  <button
                    onClick={() => handleCancelTechnicalService(layaway)}
                    className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    title="Cancelar servicio técnico"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
                <div>Creado: {new Date(layaway.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                    {layaway.id}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(layaway.id)}
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
            </div>
          );
        })}
      </div>
        
      {/* Layaway Details Modal */}
        {selectedTechnicalService && !showPaymentForm && !showPickupForm && !showAddParts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Servicio Técnico - {selectedTechnicalService.customerName}</h3>
                  <p className="text-sm text-gray-600 font-mono mt-1">ID: {selectedTechnicalService.id}</p>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedTechnicalService.status)}`}>
                      {getStatusText(selectedTechnicalService.status)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Botones de impresión */}
                  <button 
                    onClick={() => printCustomerReceipt(selectedTechnicalService)}
                    className="flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    title="Imprimir remisión cliente"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Remisión
                  </button>
                  <button 
                    onClick={() => printWorkLabel(selectedTechnicalService)}
                    className="flex items-center px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                    title="Imprimir etiqueta de trabajo"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Etiqueta
                  </button>
                  <button
                    onClick={() => setSelectedTechnicalService(null)}
                    className="text-gray-400 hover:text-gray-600 text-2xl ml-2"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Customer Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-gray-900">Información del Cliente y Dispositivo</h4>
                  {!isEditingDetails && selectedTechnicalService.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        setIsEditingDetails(true);
                        // Initialize editing data
                        setEditingData({
                          deviceImei: selectedTechnicalService.deviceImei || '',
                          deviceBrandModel: selectedTechnicalService.deviceBrandModel || '',
                          devicePassword: selectedTechnicalService.devicePassword || '',
                          physicalCondition: selectedTechnicalService.physicalCondition || '',
                          reportedIssue: selectedTechnicalService.reportedIssue || '',
                          laborCost: selectedTechnicalService.laborCost || 0,
                          serviceCost: selectedTechnicalService.serviceCost || 0,
                          notes: selectedTechnicalService.notes || '',
                          technicianId: selectedTechnicalService.technicianId || ''
                        });
                        // Initialize customer info from current customer data
                        const currentCustomer = customers.find(c => c.id === selectedTechnicalService.customerId);
                        setEditableCustomerInfo({
                          phone: currentCustomer?.phone || selectedTechnicalService.customerPhone || '',
                          address: currentCustomer?.address || selectedTechnicalService.customerAddress || ''
                        });
                      }}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                    >
                      Editar
                    </button>
                  )}
                  {isEditingDetails && (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleUpdateDetails}
                        disabled={isLoading}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isLoading ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingDetails(false);
                          // Reset editing data to original values
                          setEditingData({
                            deviceImei: selectedTechnicalService.deviceImei || '',
                            deviceBrandModel: selectedTechnicalService.deviceBrandModel || '',
                            devicePassword: selectedTechnicalService.devicePassword || '',
                            physicalCondition: selectedTechnicalService.physicalCondition || '',
                            reportedIssue: selectedTechnicalService.reportedIssue || '',
                            laborCost: selectedTechnicalService.laborCost || 0,
                            serviceCost: selectedTechnicalService.serviceCost || 0,
                            notes: selectedTechnicalService.notes || '',
                            technicianId: selectedTechnicalService.technicianId || ''
                          });
                        }}
                        className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                {!isEditingDetails ? (
                  // Display mode - matching edit mode layout
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer info - readonly */}
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4 p-3 bg-gray-100 rounded">
                      <div>
                        <span className="text-gray-600">Nombre:</span>
                        <p className="font-medium">{selectedTechnicalService.customerName}</p>
                      </div>
                      {selectedTechnicalService.customerPhone && (
                        <div>
                          <span className="text-gray-600">Teléfono:</span>
                          <p className="font-medium">{selectedTechnicalService.customerPhone}</p>
                        </div>
                      )}
                      {selectedTechnicalService.customerAddress && (
                        <div>
                          <span className="text-gray-600">Dirección:</span>
                          <p className="font-medium">{selectedTechnicalService.customerAddress}</p>
                        </div>
                      )}
                    </div>

                    {/* Device fields in same order as edit mode */}
                    <div>
                      <span className="block text-sm font-medium text-gray-700 mb-1">IMEI del Dispositivo</span>
                      <p className="font-medium text-gray-900">{selectedTechnicalService.deviceImei || 'No especificado'}</p>
                    </div>

                    <div>
                      <span className="block text-sm font-medium text-gray-700 mb-1">Marca y Referencia del Equipo</span>
                      <p className="font-medium text-gray-900">{selectedTechnicalService.deviceBrandModel || 'No especificado'}</p>
                    </div>

                    <div>
                      <span className="block text-sm font-medium text-gray-700 mb-1">Contraseña del Equipo</span>
                      <p className="font-medium text-gray-900">{selectedTechnicalService.devicePassword || 'No especificado'}</p>
                    </div>

                    <div>
                      <span className="block text-sm font-medium text-gray-700 mb-1">Costo Total del Servicio Técnico</span>
                      <p className="font-medium text-gray-900">{formatCurrency(selectedTechnicalService.serviceCost || 0)}</p>
                    </div>

                    <div className="md:col-span-2">
                      <span className="block text-sm font-medium text-gray-700 mb-1">Estado Físico del Equipo al Recibir</span>
                      <p className="font-medium text-gray-900 whitespace-pre-wrap">{selectedTechnicalService.physicalCondition || 'No especificado'}</p>
                    </div>

                    <div className="md:col-span-2">
                      <span className="block text-sm font-medium text-gray-700 mb-1">Falla Reportada</span>
                      <p className="font-medium text-gray-900 whitespace-pre-wrap">{selectedTechnicalService.reportedIssue || 'No especificado'}</p>
                    </div>

                    <div className="md:col-span-2">
                      <span className="block text-sm font-medium text-gray-700 mb-1">Notas Adicionales</span>
                      <p className="font-medium text-gray-900 whitespace-pre-wrap">{selectedTechnicalService.notes || 'No especificado'}</p>
                    </div>

                    {selectedTechnicalService.salesPersonName && (
                      <div className="md:col-span-2">
                        <span className="block text-sm font-medium text-gray-700 mb-1">Vendedor</span>
                        <p className="font-medium text-gray-900">{selectedTechnicalService.salesPersonName}</p>
                      </div>
                    )}

                    {selectedTechnicalService.technicianId && (
                      <div className="md:col-span-2">
                        <span className="block text-sm font-medium text-gray-700 mb-1">Técnico Asignado</span>
                        <p className="font-medium text-gray-900">
                          {availableTechnicians.find(t => t.id === selectedTechnicalService.technicianId)?.name || 'Técnico no encontrado'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  // Edit mode
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer info - editable */}
                    <div className="md:col-span-2 mb-4">
                      <h5 className="text-sm font-medium text-gray-900 mb-3">Información del Cliente</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Nombre
                          </label>
                          <input
                            type="text"
                            value={selectedTechnicalService.customerName}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Teléfono
                          </label>
                          <input
                            type="text"
                            value={editableCustomerInfo.phone}
                            onChange={(e) => setEditableCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Dirección
                          </label>
                          <input
                            type="text"
                            value={editableCustomerInfo.address}
                            onChange={(e) => setEditableCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            
                          />
                        </div>
                      </div>
                    </div>

                    {/* Device information section */}
                    <div className="md:col-span-2 mb-2">
                      <h5 className="text-sm font-medium text-gray-900">Información del Dispositivo</h5>
                    </div>

                    {/* Editable device fields */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IMEI del Dispositivo
                      </label>
                      <input
                        type="text"
                        value={editingData.deviceImei}
                        onChange={(e) => setEditingData({...editingData, deviceImei: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Marca y Referencia del Equipo
                      </label>
                      <input
                        type="text"
                        value={editingData.deviceBrandModel}
                        onChange={(e) => setEditingData({...editingData, deviceBrandModel: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contraseña del Equipo
                      </label>
                      <input
                        type="text"
                        value={editingData.devicePassword}
                        onChange={(e) => setEditingData({...editingData, devicePassword: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Costo Total del Servicio Técnico
                      </label>
                      <input
                        type="text"
                        value={formatNumberInput(editingData.serviceCost || 0)}
                        onChange={(e) => setEditingData({...editingData, serviceCost: parseNumberInput(e.target.value)})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado Físico del Equipo al Recibir
                      </label>
                      <textarea
                        value={editingData.physicalCondition}
                        onChange={(e) => setEditingData({...editingData, physicalCondition: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={2}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Falla Reportada
                      </label>
                      <textarea
                        value={editingData.reportedIssue}
                        onChange={(e) => setEditingData({...editingData, reportedIssue: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={2}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notas Adicionales
                      </label>
                      <textarea
                        value={editingData.notes}
                        onChange={(e) => setEditingData({...editingData, notes: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={2}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Técnico Asignado
                      </label>
                      <select
                        value={editingData.technicianId}
                        onChange={(e) => setEditingData({...editingData, technicianId: e.target.value})}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Ningún técnico asignado</option>
                        {availableTechnicians.map(technician => (
                          <option key={technician.id} value={technician.id}>
                            {technician.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Resumen Financiero</h4>
                
                {/* Desglose detallado */}
                <div className="mb-4 p-3 bg-white rounded-lg border">
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const partsCost = selectedTechnicalService.items.reduce((sum, item) => sum + item.totalCost, 0);
                      const serviceCost = selectedTechnicalService.serviceCost || 0;
                      const laborCost = Math.max(0, serviceCost - partsCost); // serviceCost - partsCost = laborCost
                      const hasCourtesies = selectedTechnicalService.courtesyItems && selectedTechnicalService.courtesyItems.length > 0;
                      const courtesyTotalValue = selectedTechnicalService.courtesyTotalValue || 0;
                      const courtesyTotalCost = selectedTechnicalService.courtesyTotalCost || 0;

                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Repuestos:</span>
                            <span>{formatCurrency(partsCost)}</span>
                          </div>
                          {laborCost > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mano de Obra:</span>
                              <span>{formatCurrency(laborCost)}</span>
                            </div>
                          )}
                          {hasCourtesies && (
                            <>
                              <div className="flex justify-between text-cyan-700 font-medium pt-2 border-t">
                                <span className="flex items-center">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Valor cortesías regaladas:
                                </span>
                                <span>{formatCurrency(courtesyTotalValue)}</span>
                              </div>
                              <div className="flex justify-between text-red-600 font-medium">
                                <span className="flex items-center">
                                  <Gift className="h-3 w-3 mr-1" />
                                  Costo cortesías:
                                </span>
                                <span>-{formatCurrency(courtesyTotalCost)}</span>
                              </div>
                            </>
                          )}
                          <hr className="my-2" />
                          <div className="flex justify-between font-bold">
                            <span>Total:</span>
                            <span>{formatCurrency(serviceCost)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <span className="text-gray-600">Total:</span>
                    <p className="font-bold text-lg">{formatCurrency(calculateRealTotals(selectedTechnicalService).realTotal)}</p>
                  </div>
                  <div className="text-center">
                    <span className="text-gray-600">Pagado:</span>
                    <p className="font-bold text-lg text-green-600">
                      {formatCurrency(
                        selectedTechnicalService.payments.reduce((sum, payment) => sum + payment.amount, 0)
                      )}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-gray-600">Pendiente:</span>
                    <p className="font-bold text-lg text-orange-600">
                      {formatCurrency(calculateRealTotals(selectedTechnicalService).remainingBalance)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="mb-6">
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Progreso de Pagos</span>
                    <span>{(calculateProgress(selectedTechnicalService).paymentProgress || 0).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${calculateProgress(selectedTechnicalService).paymentProgress || 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Repuestos del Servicio</h4>
                  {selectedTechnicalService.status !== 'delivered' && selectedTechnicalService.status !== 'cancelled' && (
                    <button
                      onClick={() => setShowAddParts(true)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors flex items-center space-x-1"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Agregar Repuesto</span>
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {selectedTechnicalService.items.map((item) => {
                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{item.partName}</h5>
                            {item.partDescription && (
                              <p className="text-sm text-gray-500 mt-1">{item.partDescription}</p>
                            )}
                            <div className="text-sm text-gray-600 mt-1">
                              <span>Cantidad: {item.quantity} | </span>
                              <span>Costo: {formatCurrency(item.partCost)} c/u | </span>
                              <span>Total: {formatCurrency(item.totalCost)}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <select
                              value={item.status}
                              onChange={(e) => handleUpdateItemStatus(item.id, e.target.value as 'solicitado' | 'en_tienda' | 'instalado')}
                              disabled={selectedTechnicalService.status !== 'active' || isLoading}
                              className={`px-2 py-1 rounded-full text-xs font-medium border-0 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                                item.status === 'solicitado' ? 'bg-yellow-100 text-yellow-800' :
                                item.status === 'en_tienda' ? 'bg-blue-100 text-blue-800' :
                                item.status === 'instalado' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <option value="solicitado">Solicitado</option>
                              <option value="en_tienda">En tienda</option>
                              <option value="instalado">Instalado</option>
                            </select>
                            {selectedTechnicalService.status === 'active' && (
                              <button
                                onClick={() => handleDeletePart(item.id, item.partName)}
                                disabled={isLoading}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Eliminar repuesto"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Notas del repuesto si las hay */}
                        {item.notes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded">
                            <p className="text-xs text-gray-600">
                              <strong>Notas:</strong> {item.notes}
                            </p>
                          </div>
                        )}
                        
                        {/* Información de auditoría */}
                        <div className="mt-2 text-xs text-gray-400 space-y-1">
                          {item.addedByName && (
                            <div>
                              Agregado por: {item.addedByName}
                              {item.addedAt && (
                                <span className="ml-2">
                                  el {new Date(item.addedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(item.addedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}
                          {item.statusChangedByName && item.statusChangedAt && (
                            <div>
                              Estado cambiado por: {item.statusChangedByName}
                              <span className="ml-2">
                                el {new Date(item.statusChangedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(item.statusChangedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          {item.installedAt && item.status === 'instalado' && (
                            <div>
                              Instalado el {new Date(item.installedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(item.installedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cortesías del servicio */}
              {selectedTechnicalService.courtesyItems && selectedTechnicalService.courtesyItems.length > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <Gift className="h-5 w-5 text-cyan-600 mr-2" />
                      Cortesías
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {selectedTechnicalService.courtesyItems.map((item, index) => (
                      <div key={index} className="border border-cyan-200 bg-cyan-50 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{item.productName}</h5>
                            <div className="text-sm text-gray-600 mt-1">
                              <span>Cantidad: {item.quantity} | </span>
                              <span>Valor: {formatCurrency(item.normalPrice)} c/u | </span>
                              <span className="text-cyan-700 font-medium">Total regalado: {formatCurrency(item.totalValue)}</span>
                            </div>
                            <div className="text-sm text-red-600 mt-1">
                              Costo real: -{formatCurrency(item.totalCost)}
                            </div>
                            {item.reason && (
                              <div className="mt-2 p-2 bg-white rounded">
                                <p className="text-xs text-gray-600">
                                  <strong>Motivo:</strong> {item.reason}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment History */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Historial de Pagos</h4>
                  {selectedTechnicalService.status === 'active' && calculateRealTotals(selectedTechnicalService).remainingBalance > 0 && (
                    <button
                      onClick={() => setShowPaymentForm(true)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors flex items-center space-x-1"
                    >
                      <DollarSign className="h-4 w-4" />
                      <span>Registrar Pago</span>
                    </button>
                  )}
                </div>
                
                {selectedTechnicalService.payments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No se han registrado pagos</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTechnicalService.payments.map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{formatCurrency(payment.amount)}</div>
                          <div className="text-sm text-gray-600">
                            <div>{new Date(payment.paymentDate).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</div>
                            <div>
                              {payment.paymentMethods && payment.paymentMethods.length > 1 
                                ? (() => {
                                    const methodDetails = payment.paymentMethods.map(p => {
                                      const methodName = (() => {
                                        switch(p.method) {
                                          case 'efectivo': return 'Efectivo';
                                          case 'transferencia': return 'Transferencia';
                                          case 'tarjeta': return 'Tarjeta';
                                          case 'crédito': return 'Crédito';
                                          case 'credit': return 'Saldo a favor';
                                          default: return p.method;
                                        }
                                      })();
                                      return `${methodName}: ${formatCurrency(p.amount)}`;
                                    });
                                    return (
                                      <>
                                        <div className="font-medium text-purple-700">Pagos múltiples:</div>
                                        {methodDetails.map((detail, index) => (
                                          <div key={index} className="text-xs text-gray-600 ml-2">• {detail}</div>
                                        ))}
                                      </>
                                    );
                                  })()
                                : (payment.paymentMethod === 'efectivo' ? 'Efectivo' : payment.paymentMethod === 'transferencia' ? 'Transferencia' : payment.paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Crédito')
                              }
                            </div>
                          </div>
                          {payment.notes && (
                            <div className="text-xs text-gray-500 italic">"{payment.notes}"</div>
                          )}
                          {payment.registeredByName && (
                            <div className="text-xs text-gray-400 mt-1">
                              Registrado por: {payment.registeredByName}
                              {payment.registeredAt && (
                                <span className="ml-2">
                                  el {new Date(payment.registeredAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(payment.registeredAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          {selectedTechnicalService.status === 'active' && (
                            <button
                              onClick={() => handleCancelPayment(payment.id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                              title="Cancelar pago"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedTechnicalService.notes && (
                <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Notas</h4>
                  <p className="text-sm text-gray-700">{selectedTechnicalService.notes}</p>
                </div>
              )}

              {/* Completion Status Indicator */}
              {selectedTechnicalService.status === 'active' && (
                (() => {
                  const blockers = getCompletionBlockers(selectedTechnicalService);
                  const canComplete = blockers.length === 0;
                  
                  return (
                    <div className={`mb-4 p-3 rounded-lg border ${
                      canComplete 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      <div className="flex items-start">
                        <div className={`flex-shrink-0 mr-2 ${
                          canComplete ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {canComplete ? (
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className={`text-sm font-medium ${
                            canComplete ? 'text-green-800' : 'text-yellow-800'
                          }`}>
                            {canComplete ? '✅ Listo para finalizar' : 'Pendiente para finalizar'}
                          </h4>
                          {!canComplete && (
                            <ul className="mt-1 text-sm text-yellow-700">
                              {blockers.map((blocker, index) => (
                                <li key={index} className="flex items-center">
                                  <span className="mr-1">•</span>
                                  {blocker}
                                  {/* Add adjust button for overpayment */}
                                  {blocker.includes('Sobrepago') && blocker.includes('requiere reajuste') && (
                                    <button
                                      onClick={() => handleAdjustOverpayment(selectedTechnicalService)}
                                      className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                    >
                                      Reajustar
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {canComplete && (
                            <p className="text-sm text-green-700 mt-1">
                              El servicio está completamente pagado y todos los repuestos están instalados.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Actions */}
              {selectedTechnicalService.status === 'active' && (
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  {/* Botón de finalizar servicio - solo habilitado si se puede completar */}
                  <button
                    onClick={handleCompleteService}
                    disabled={!canCompleteService(selectedTechnicalService) || isLoading}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      canCompleteService(selectedTechnicalService) && !isLoading
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    title={!canCompleteService(selectedTechnicalService) 
                      ? 'Para finalizar: complete el pago y marque todos los repuestos como instalados' 
                      : 'Finalizar servicio técnico'
                    }
                  >
                    {isLoading ? 'Finalizando...' : 'Finalizar Servicio Técnico'}
                  </button>
                  
                  <button
                    onClick={() => handleCancelTechnicalService(selectedTechnicalService)}
                    disabled={isLoading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Cancelar Servicio Técnico
                  </button>
                </div>
              )}

              {/* Cancellation Summary - Solo para planes cancelados */}
              {selectedTechnicalService.status === 'cancelled' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-medium text-red-800 mb-3 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Resumen de Cancelación
                  </h4>
                  
                  {(() => {
                    // Calcular datos de cancelación
                    const totalPaid = selectedTechnicalService.payments.reduce((sum, payment) => sum + payment.amount, 0);
                    
                    // Productos recogidos vs no recogidos
                    const pickedUpItems = selectedTechnicalService.items.filter(item => (item.pickedUpQuantity || 0) > 0);
                    const returnedItems = selectedTechnicalService.items.filter(item => {
                      const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
                      return unPickedQuantity > 0;
                    });
                    
                    // Valor de productos recogidos
                    const pickedUpValue = selectedTechnicalService.items.reduce((sum, item) => {
                      const pickedUpQuantity = item.pickedUpQuantity || 0;
                      return sum + (pickedUpQuantity * item.productSalePrice);
                    }, 0);
                    
                    // Dinero que fue a ingresos reales vs que requiere manejo
                    const moneyToRealRevenue = Math.min(totalPaid, pickedUpValue);
                    const moneyRequiringHandling = totalPaid - moneyToRealRevenue;
                    
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Productos */}
                        <div>
                          <h5 className="font-medium text-gray-900 mb-3">📦 Estado de Productos</h5>
                          
                          {/* Productos Recogidos */}
                          {pickedUpItems.length > 0 && (
                            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                              <h6 className="text-sm font-medium text-green-800 mb-2">✅ Productos Entregados al Cliente</h6>
                              <div className="space-y-1">
                                {pickedUpItems.map(item => {
                                  const pickedUpQuantity = item.pickedUpQuantity || 0;
                                  const pickedUpItemValue = pickedUpQuantity * item.productSalePrice;
                                  return (
                                    <div key={`picked-${item.id}`} className="text-xs text-green-700">
                                      • {item.productName}: {pickedUpQuantity} unidades ({formatCurrency(pickedUpItemValue)})
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="text-sm font-medium text-green-800 mt-2 pt-2 border-t border-green-200">
                                Total entregado: {formatCurrency(pickedUpValue)}
                              </div>
                            </div>
                          )}
                          
                          {/* Productos Devueltos al Inventario */}
                          {returnedItems.length > 0 && (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                              <h6 className="text-sm font-medium text-blue-800 mb-2">🔄 Productos Devueltos al Inventario</h6>
                              <div className="space-y-1">
                                {returnedItems.map(item => {
                                  const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
                                  const returnedValue = unPickedQuantity * item.productSalePrice;
                                  return (
                                    <div key={`returned-${item.id}`} className="text-xs text-blue-700">
                                      • {item.productName}: {unPickedQuantity} unidades ({formatCurrency(returnedValue)})
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Dinero */}
                        <div>
                          <h5 className="font-medium text-gray-900 mb-3">💰 Manejo del Dinero</h5>
                          
                          {/* Dinero que fue a Ingresos Reales */}
                          {moneyToRealRevenue > 0 && (
                            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded">
                              <h6 className="text-sm font-medium text-emerald-800 mb-2">✅ Ingresos Reales</h6>
                              <div className="text-lg font-bold text-emerald-700">
                                {formatCurrency(moneyToRealRevenue)}
                              </div>
                              <div className="text-xs text-emerald-600 mt-1">
                                Dinero por productos entregados
                              </div>
                            </div>
                          )}
                          
                          {/* Dinero que Requiere Manejo */}
                          {moneyRequiringHandling > 0 && (
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                              <h6 className="text-sm font-medium text-orange-800 mb-2">⚠️ Requiere Manejo</h6>
                              <div className="text-lg font-bold text-orange-700">
                                {formatCurrency(moneyRequiringHandling)}
                              </div>
                              <div className="text-xs text-orange-600 mt-1">
                                Dinero excedente (reembolso/crédito)
                              </div>
                            </div>
                          )}
                          
                          {/* Resumen Total */}
                          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
                            <div className="text-sm">
                              <div className="flex justify-between">
                                <span>Total pagado:</span>
                                <span className="font-medium">{formatCurrency(totalPaid)}</span>
                              </div>
                              <div className="flex justify-between text-emerald-600">
                                <span>→ Ingresos reales:</span>
                                <span className="font-medium">{formatCurrency(moneyToRealRevenue)}</span>
                              </div>
                              <div className="flex justify-between text-orange-600">
                                <span>→ Requiere manejo:</span>
                                <span className="font-medium">{formatCurrency(moneyRequiringHandling)}</span>
                              </div>
                            </div>
                          </div>
    </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Información de Auditoría del Servicio */}
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  Historial de Cambios
                </h4>
                
                <div className="space-y-2 text-sm text-gray-600">
                  {selectedTechnicalService.salesPersonName && (
                    <div>
                      <strong>Creado por:</strong> {selectedTechnicalService.salesPersonName}
                      <span className="ml-2 text-gray-400">
                        el {new Date(selectedTechnicalService.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(selectedTechnicalService.createdAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  
                  {selectedTechnicalService.statusChangedByName && selectedTechnicalService.statusChangedAt && (
                    <div>
                      <strong>Último cambio de estado por:</strong> {selectedTechnicalService.statusChangedByName}
                      <span className="ml-2 text-gray-400">
                        el {new Date(selectedTechnicalService.statusChangedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(selectedTechnicalService.statusChangedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  
                  {selectedTechnicalService.completedByName && selectedTechnicalService.completedAt && (
                    <div>
                      <strong>Finalizado por:</strong> {selectedTechnicalService.completedByName}
                      <span className="ml-2 text-gray-400">
                        el {new Date(selectedTechnicalService.completedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(selectedTechnicalService.completedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  
                  {selectedTechnicalService.cancelledByName && selectedTechnicalService.status === 'cancelled' && (
                    <div>
                      <strong>Cancelado por:</strong> {selectedTechnicalService.cancelledByName}
                      <span className="ml-2 text-gray-400">
                        el {new Date(selectedTechnicalService.statusChangedAt || selectedTechnicalService.updatedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })} a las {new Date(selectedTechnicalService.statusChangedAt || selectedTechnicalService.updatedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Add Parts Modal */}
      {showAddParts && selectedTechnicalService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Agregar Repuesto</h3>
                <button
                  onClick={() => setShowAddParts(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const partName = formData.get('partName') as string;
                const partDescription = formData.get('partDescription') as string;
                const quantity = parseInt(formData.get('quantity') as string) || 1;
                const partCostInput = formData.get('partCost') as string;
                const partCost = parseNumberInput(partCostInput);

                if (!partName.trim()) {
                  showError('Error', 'Ingresa el nombre del repuesto');
                  return;
                }
                if (partCost <= 0) {
                  showError('Error', 'Ingresa un costo válido');
                  return;
                }

                const newPart: TechnicalServiceItem = {
                  id: crypto.randomUUID(),
                  partName: partName.trim(),
                  ...(partDescription.trim() && { partDescription: partDescription.trim() }),
                  quantity,
                  partCost,
                  totalCost: quantity * partCost,
                  status: 'solicitado',
                  // Auditoría
                  addedBy: appUser?.uid,
                  addedByName: appUser?.displayName || appUser?.email,
                  addedAt: getColombiaTimestamp()
                };

                try {
                  setIsLoading(true);
                  
                  // Actualizar en Firebase
                  const updatedItems = [...selectedTechnicalService.items, newPart];
                  const additionalAmount = newPart.totalCost;
                  // Recalcular shares si usa el nuevo sistema de costos
                  const svcCostAdd = selectedTechnicalService.serviceCost;
                  const newPartsCostAdd = updatedItems.reduce((sum, i) => sum + i.totalCost, 0);
                  const newLaborCostAdd = svcCostAdd !== undefined ? Math.max(0, svcCostAdd - newPartsCostAdd) : undefined;

                  await technicalServicesService.update(selectedTechnicalService.id, {
                    items: updatedItems,
                    totalAmount: selectedTechnicalService.totalAmount + additionalAmount,
                    totalCost: selectedTechnicalService.totalCost + additionalAmount,
                    remainingBalance: selectedTechnicalService.remainingBalance + additionalAmount,
                    ...(newLaborCostAdd !== undefined && {
                      laborCost: newLaborCostAdd,
                      technicianShare: newLaborCostAdd * 0.5,
                      businessShare: newLaborCostAdd * 0.5,
                    }),
                    updatedAt: getColombiaTimestamp()
                  });

                  // Actualizar estado local
                  const updatedService = {
                    ...selectedTechnicalService,
                    items: updatedItems,
                    totalAmount: selectedTechnicalService.totalAmount + additionalAmount,
                    totalCost: selectedTechnicalService.totalCost + additionalAmount,
                    remainingBalance: selectedTechnicalService.remainingBalance + additionalAmount,
                    ...(newLaborCostAdd !== undefined && {
                      laborCost: newLaborCostAdd,
                      technicianShare: newLaborCostAdd * 0.5,
                      businessShare: newLaborCostAdd * 0.5,
                    }),
                    updatedAt: getColombiaTimestamp()
                  };
                  
                  updateTechnicalServiceInState(updatedService);
                  setSelectedTechnicalService(updatedService);
                  setShowAddParts(false);
                  
                  showSuccess(
                    'Repuesto agregado',
                    `Se agregó "${partName}" por ${formatCurrency(newPart.totalCost)}`
                  );
                  
                  dispatch(fetchTechnicalServices());
                } catch (error) {
                  showError('Error', 'No se pudo agregar el repuesto. Inténtalo de nuevo.');
                } finally {
                  setIsLoading(false);
                }
              }} className="space-y-4">
                <div>
                  <label htmlFor="partName" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Repuesto *
                  </label>
                  <input
                    type="text"
                    id="partName"
                    name="partName"
                    
                    disabled={isLoading}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="partDescription" className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (Opcional)
                  </label>
                  <input
                    type="text"
                    id="partDescription"
                    name="partDescription"
                    
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      id="quantity"
                      name="quantity"
                      min="1"
                      defaultValue="1"
                      disabled={isLoading}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="partCost" className="block text-sm font-medium text-gray-700 mb-1">
                      Costo Unitario *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      id="partCost"
                      name="partCost"
                      placeholder="0"
                      disabled={isLoading}
                      required
                      onChange={(e) => {
                        const formatted = formatNumberInput(e.target.value);
                        e.target.value = formatted;
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddParts(false)}
                    disabled={isLoading}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    <span>{isLoading ? 'Agregando...' : 'Agregar Repuesto'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && selectedTechnicalService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Registrar Pago</h3>
                <button
                  onClick={() => setShowPaymentForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600">Saldo pendiente:</div>
                <div className="text-xl font-bold text-blue-600">
                  {formatCurrency(calculateRealTotals(selectedTechnicalService).remainingBalance)}
                </div>
              </div>
              
              <form onSubmit={handleAddPayment} className="space-y-4">
                {/* Usar saldo a favor */}
                {(() => {
                  const customer = customers.find(c => c.id === selectedTechnicalService.customerId);
                  if (customer && customer.credit > 0) {
                    return (
                      <div className="p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="useCredit"
                            checked={useCredit}
                            onChange={e => setUseCredit(e.target.checked)}
                            disabled={isLoading}
                          />
                          <label htmlFor="useCredit" className="text-sm text-gray-700">
                            Usar saldo a favor ({formatCurrency(customer.credit)})
                          </label>
                        </div>
                        {useCredit && (
                          <div className="text-xs text-green-600 mt-1">
                            Se aplicará automáticamente: {formatCurrency(Math.min(customer.credit, calculateRealTotals(selectedTechnicalService).remainingBalance))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Método de Pago
                  </label>
                  <label className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={useMultiplePayments}
                      onChange={(e) => {
                        setUseMultiplePayments(e.target.checked);
                        if (!e.target.checked) {
                          setPaymentMethods([]);
                        }
                      }}
                      disabled={isLoading}
                      className="mr-2 disabled:opacity-50"
                    />
                    Pagos múltiples
                  </label>
                </div>

                {!useMultiplePayments ? (
                  // Método de pago único
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monto del Pago (COP) *
                      </label>
                      <input
                        type="text"
                        value={paymentAmount}
                        onChange={handlePaymentAmountChange}
                        placeholder="0"
                        required
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        Saldo pendiente: {formatCurrency(calculateRealTotals(selectedTechnicalService).remainingBalance)}
                      </div>
                    </div>
                    
                    <div>
                      <select
                        name="paymentMethod"
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="crédito">Crédito</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  // Modo de pagos múltiples
                  <div className="space-y-3">
                    {/* Lista de pagos agregados */}
                    {paymentMethods.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-700">Pagos agregados:</h4>
                        {paymentMethods.map((payment, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                {payment.method === 'efectivo' ? 'Efectivo' :
                                 payment.method === 'transferencia' ? 'Transferencia' :
                                 payment.method === 'tarjeta' ? 'Tarjeta' : 
                                 payment.method === 'crédito' ? 'Crédito' : payment.method}
                              </div>
                              <div className="text-xs text-gray-600">
                                {formatCurrency(payment.amount)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePaymentMethod(index)}
                              disabled={isLoading}
                              className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span>Total pagado:</span>
                          <span className="font-medium">{formatCurrency(getTotalPaidAmount())}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Restante por pagar:</span>
                          <span className={`font-medium ${getRemainingAmount() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(getRemainingAmount())}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Agregar nuevo pago */}
                    {getRemainingAmount() > 0 && (
                      <div className="border border-gray-200 rounded-lg p-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Agregar pago:</h4>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <select
                              value={currentPaymentMethod}
                              onChange={(e) => setCurrentPaymentMethod(e.target.value as any)}
                              disabled={isLoading}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
                            >
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="crédito">Crédito</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = getRemainingAmount();
                                if (remaining > 0) {
                                  addPaymentMethod(currentPaymentMethod, remaining);
                                }
                              }}
                              disabled={isLoading || getRemainingAmount() <= 0}
                              className="px-3 py-2 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              Todo
                            </button>
                          </div>
                          <div className="flex gap-3">
                            <input
                              type="text"
                              placeholder="Monto"
                              disabled={isLoading}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              onChange={(e) => {
                                const numeric = parseNumberInput(e.target.value);
                                const remaining = getRemainingAmount();
                                const limitedValue = Math.min(numeric, remaining);
                                e.target.value = formatNumberInput(limitedValue.toString());
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const amount = parseNumberInput(e.currentTarget.value);
                                  if (amount > 0 && amount <= getRemainingAmount()) {
                                    addPaymentMethod(currentPaymentMethod, amount);
                                    e.currentTarget.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement;
                                const amount = parseNumberInput(input?.value || '0');
                                if (amount > 0 && amount <= getRemainingAmount()) {
                                  addPaymentMethod(currentPaymentMethod, amount);
                                  if (input) input.value = '';
                                }
                              }}
                              disabled={isLoading}
                              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas (Opcional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    placeholder="Notas sobre el pago..."
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                    disabled={isLoading}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isLoading ||
                      (!useMultiplePayments && parseNumberInput(paymentAmount) <= 0) ||
                      (useMultiplePayments && (paymentMethods.length === 0 || getRemainingAmount() > 0.01))
                    }
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    <span>
                      {isLoading ? 'Registrando...' : 'Registrar Pago'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pickup Form Modal */}
      {showPickupForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Marcar como Recogido</h3>
                <button
                  onClick={() => setShowPickupForm(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="font-medium">{showPickupForm.item.productName}</div>
                <div className="text-sm text-gray-600">
                  Disponible para recoger: {showPickupForm.item.quantity - (showPickupForm.item.pickedUpQuantity || 0)} de {showPickupForm.item.quantity}
                </div>
              </div>
              
              <form onSubmit={handleMarkAsPickedUp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cantidad a Recoger *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    max={showPickupForm.item.quantity - (showPickupForm.item.pickedUpQuantity || 0)}
                    defaultValue="1"
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas (Opcional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    disabled={isLoading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    placeholder="Notas sobre la recogida..."
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowPickupForm(null)}
                    disabled={isLoading}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    <span>
                      {isLoading ? 'Marcando...' : 'Marcar como Recogido'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

          {/* Empty State */}
          {filteredTechnicalServices.length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-300">
              <div className="text-gray-400 mb-4">
                <Calendar className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron servicios técnicos</h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== 'active'
                  ? 'Intenta ajustar tus criterios de búsqueda.'
                  : 'Comienza creando tu primer servicio técnico.'
                }
              </p>
            </div>
          )}
        </>
      )}

      {/* Delete Part Confirmation Modal */}
      {showDeleteConfirm && partToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 mr-3">
                  {partToDelete.id === 'adjustment' ? (
                    <svg className="h-10 w-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {partToDelete.id === 'adjustment' ? 'Reajustar Sobrepago' : 'Confirmar Eliminación'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {partToDelete.id === 'adjustment' ? 'Selecciona cómo manejar el sobrepago' : 'Esta acción no se puede deshacer'}
                  </p>
                </div>
              </div>

              {/* Content */}
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  {partToDelete.id === 'adjustment' 
                    ? '¿Cómo deseas manejar el sobrepago detectado?' 
                    : '¿Estás seguro de que quieres eliminar el siguiente repuesto?'
                  }
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="text-sm">
                    <div className="font-semibold text-gray-900 mb-2">
                      {partToDelete.name}
                    </div>
                    {partToDelete.id !== 'adjustment' && partToDelete.item.partDescription && (
                      <div className="text-gray-600 mb-2">
                        {partToDelete.item.partDescription}
                      </div>
                    )}
                    {partToDelete.id === 'adjustment' && (
                      <div className="text-gray-600 mb-2">
                        El cliente ha pagado {formatCurrency(partToDelete.item.totalCost)} más de lo que cuesta el servicio.
                      </div>
                    )}
                    <div className="space-y-1 text-gray-600">
                      {partToDelete.id !== 'adjustment' ? (
                        <>
                          <div className="flex justify-between">
                            <span>Cantidad:</span>
                            <span className="font-medium">{partToDelete.item.quantity} unidad(es)</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Costo unitario:</span>
                            <span className="font-medium">{formatCurrency(partToDelete.item.partCost)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-1">
                            <span>Total a eliminar:</span>
                            <span className="font-bold text-red-600">{formatCurrency(partToDelete.item.totalCost)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between border-t pt-1">
                          <span>Monto del sobrepago:</span>
                          <span className="font-bold text-blue-600">{formatCurrency(partToDelete.item.totalCost)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Overpayment handling section */}
                {(() => {
                  if (!selectedTechnicalService || !partToDelete) return null;
                  
                  // For adjustment, we always show options
                  if (partToDelete.id === 'adjustment') {
                    return (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-blue-800 mb-2">¿Cómo deseas manejar este sobrepago?</p>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="overpaymentAction"
                              value="credit"
                              checked={overpaymentAction === 'credit'}
                              onChange={(e) => setOverpaymentAction(e.target.value as 'credit')}
                              className="mr-2"
                            />
                            <span className="text-sm text-blue-700">
                              Agregar al saldo a favor del cliente
                            </span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="overpaymentAction"
                              value="refund"
                              checked={overpaymentAction === 'refund'}
                              onChange={(e) => setOverpaymentAction(e.target.value as 'refund')}
                              className="mr-2"
                            />
                            <span className="text-sm text-blue-700">
                              Registrar como reembolso (pago negativo)
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  }
                  
                  // For regular deletion, check if it creates overpayment
                  const currentTotal = selectedTechnicalService.items.reduce((sum: number, item: any) => sum + item.totalCost, 0) + (selectedTechnicalService.laborCost || 0);
                  const totalPaid = selectedTechnicalService.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
                  const removedAmount = partToDelete.item.totalCost;
                  const newTotal = currentTotal - removedAmount;
                  const overpayment = totalPaid - newTotal;
                  
                  if (overpayment > 0.01) {
                    return (
                      <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-center mb-3">
                          <svg className="h-5 w-5 text-orange-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L5.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <h4 className="font-medium text-orange-800">Sobrepago Detectado</h4>
                        </div>
                        <p className="text-sm text-orange-700 mb-3">
                          El cliente ha pagado <strong>{formatCurrency(overpayment)}</strong> más de lo que costará el servicio después de eliminar este repuesto.
                        </p>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-orange-800 mb-2">¿Cómo deseas manejar este sobrepago?</p>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="overpaymentAction"
                              value="credit"
                              checked={overpaymentAction === 'credit'}
                              onChange={(e) => setOverpaymentAction(e.target.value as 'credit')}
                              className="mr-2"
                            />
                            <span className="text-sm text-orange-700">
                              Agregar <strong>{formatCurrency(overpayment)}</strong> al saldo a favor del cliente
                            </span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="overpaymentAction"
                              value="refund"
                              checked={overpaymentAction === 'refund'}
                              onChange={(e) => setOverpaymentAction(e.target.value as 'refund')}
                              className="mr-2"
                            />
                            <span className="text-sm text-orange-700">
                              Registrar reembolso de <strong>{formatCurrency(overpayment)}</strong> (pago negativo)
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setPartToDelete(null);
                    setOverpaymentAction(null);
                  }}
                  disabled={isLoading}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                {(() => {
                  if (!selectedTechnicalService || !partToDelete) return null;
                  
                  // For adjustment, just check if action is selected
                  if (partToDelete.id === 'adjustment') {
                    const canAdjust = overpaymentAction !== null;
                    
                    return (
                      <button
                        onClick={handleConfirmDelete}
                        disabled={isLoading || !canAdjust}
                        className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 ${
                          canAdjust 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-gray-300 text-gray-500'
                        }`}
                        title={!canAdjust ? 'Selecciona cómo manejar el sobrepago antes de continuar' : ''}
                      >
                        {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                        <span>
                          {isLoading ? 'Reajustando...' : 'Confirmar Reajuste'}
                        </span>
                      </button>
                    );
                  }
                  
                  // For regular deletion
                  const currentTotal = selectedTechnicalService.items.reduce((sum: number, item: any) => sum + item.totalCost, 0) + (selectedTechnicalService.laborCost || 0);
                  const totalPaid = selectedTechnicalService.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
                  const removedAmount = partToDelete.item.totalCost;
                  const newTotal = currentTotal - removedAmount;
                  const overpayment = totalPaid - newTotal;
                  const hasOverpayment = overpayment > 0.01;
                  const canDelete = !hasOverpayment || overpaymentAction !== null;
                  
                  return (
                    <button
                      onClick={handleConfirmDelete}
                      disabled={isLoading || !canDelete}
                      className={`px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 ${
                        canDelete 
                          ? 'bg-red-600 text-white hover:bg-red-700' 
                          : 'bg-gray-300 text-gray-500'
                      }`}
                      title={!canDelete ? 'Selecciona cómo manejar el sobrepago antes de continuar' : ''}
                    >
                      {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                      <span>
                        {isLoading ? 'Eliminando...' : 'Eliminar Repuesto'}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de impresión para servicios técnicos */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Imprimir Documentos
              </h3>
              <p className="text-sm text-gray-600">
                Cliente: <strong>{customers.find(c => c.id === showPrintModal.customerId)?.name || 'N/A'}</strong>
              </p>
              <p className="text-sm text-gray-600">
                Servicio: <strong>#{showPrintModal.id}</strong>
              </p>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => printCustomerReceipt(showPrintModal)}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Remisión Cliente
              </button>
              
              <button
                onClick={() => printWorkLabel(showPrintModal)}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Etiqueta de Trabajo
              </button>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowPrintModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cancelación con manejo de dinero */}
      {showCancellationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Cancelar Servicio Técnico
              </h3>
              <p className="text-sm text-gray-600">
                Cliente: <strong>{showCancellationModal.customerName}</strong>
              </p>
              <p className="text-sm text-gray-600">
                Total pagado: <strong>{formatCurrency(showCancellationModal.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0))}</strong>
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto a devolver al cliente:
                </label>
                <input
                  type="text"
                  value={cancellationRefund}
                  onChange={(e) => setCancellationRefund(formatNumberInput(parseNumberInput(e.target.value)))}
                  placeholder="Ej: 20000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto a cobrar como penalización:
                </label>
                <input
                  type="text"
                  value={cancellationPenalty}
                  onChange={(e) => setCancellationPenalty(formatNumberInput(parseNumberInput(e.target.value)))}
                  placeholder="Ej: 15000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              {(() => {
                const refund = parseNumberInput(cancellationRefund);
                const penalty = parseNumberInput(cancellationPenalty);
                const totalPaid = showCancellationModal.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
                const total = refund + penalty;
                const isValid = total === totalPaid;
                
                return (
                  <div className={`p-3 rounded-lg ${isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className={`text-sm ${isValid ? 'text-green-700' : 'text-red-700'}`}>
                      <strong>Verificación:</strong><br/>
                      Devolución + Penalización = {formatCurrency(total)}<br/>
                      Total pagado = {formatCurrency(totalPaid)}<br/>
                      {isValid ? '✅ Los montos coinciden' : '❌ Los montos no coinciden'}
                    </p>
                  </div>
                );
              })()}
            </div>
            
            <div className="mt-6 flex space-x-3">
              <button
                onClick={() => {
                  const refund = parseNumberInput(cancellationRefund);
                  const penalty = parseNumberInput(cancellationPenalty);
                  const totalPaid = showCancellationModal.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
                  
                  if (refund + penalty === totalPaid) {
                    processCancellation(showCancellationModal, refund, penalty);
                  } else {
                    alert('Los montos no coinciden con el total pagado');
                  }
                }}
                disabled={(() => {
                  const refund = parseNumberInput(cancellationRefund);
                  const penalty = parseNumberInput(cancellationPenalty);
                  const totalPaid = showCancellationModal.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
                  return refund + penalty !== totalPaid;
                })()}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar Servicio
              </button>
              
              <button
                onClick={() => setShowCancellationModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de penalización simple (sin pagos previos) */}
      {showPenaltyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <AlertCircle className="h-6 w-6 text-orange-500 mr-3" />
                <h3 className="text-xl font-bold text-gray-900">
                  Penalización por Cancelación
                </h3>
              </div>

              <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cliente:</span>
                  <span className="font-medium text-gray-900">{showPenaltyModal.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Servicio:</span>
                  <span className="font-medium text-gray-900">{showPenaltyModal.deviceBrandModel || 'Servicio técnico'}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Total pagado:</span>
                  <span className="font-medium">$0</span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto de penalización por cancelación
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={penaltyAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setPenaltyAmount(value);
                    }}
                    placeholder="15000"
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Este monto será cobrado al cliente como penalización por cancelar el servicio
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowPenaltyModal(null);
                    setPenaltyAmount('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const penalty = Number(penaltyAmount);
                    if (isNaN(penalty) || penalty < 0) {
                      alert('Por favor ingresa un monto válido');
                      return;
                    }
                    await processCancellation(showPenaltyModal, 0, penalty);
                    setShowPenaltyModal(null);
                    setPenaltyAmount('');
                  }}
                  disabled={!penaltyAmount}
                  className="px-4 py-2 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar Servicio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cortesías */}
      {showCourtesyModal && (
        <CourtesyModal
          onClose={handleCloseCourtesyModal}
          onAdd={handleAddCourtesy}
        />
      )}
    </div>
  );
}
