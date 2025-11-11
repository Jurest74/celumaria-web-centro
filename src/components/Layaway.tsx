import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Search, Calendar, DollarSign, User, Package, Eye, CheckCircle, Clock, X, TrendingUp, PiggyBank, AlertTriangle, AlertCircle, Trash2, ArrowUpRight } from 'lucide-react';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { selectLayaways, selectProducts, selectCustomers } from '../store/selectors';
import { layawaysService, productsService } from '../services/firebase/firestore';
import { customersService } from '../services/firebase/firestore';
import { LayawayPlan, LayawayItem, LayawayPayment, PaymentMethod } from '../types';
import { formatCurrency, formatNumber, formatNumberInput, parseNumberInput } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { useFirebase } from '../contexts/FirebaseContext';

import { fetchProducts } from '../store/thunks/productsThunks';
import { fetchLayaways } from '../store/thunks/layawaysThunks';
// ⚡ OPTIMIZADO: No usar useSectionRealtime - datos se cargan al navegar

import { AddProductsToLayawayPOS } from './AddProductsToLayawayPOS';
import { ProductPOSSelector } from './ProductPOSSelector';
import { CustomerComboBox } from './CustomerComboBox';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppUser } from '../types';

export function Layaway() {
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

  // Load available users for salesperson filter
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

    loadUsers();
  }, []);

  // Eliminar producto no recogido y devolver al inventario
  const handleRemoveUnpickedProduct = async (itemId: string) => {
    if (!selectedLayaway) return;
    const item = selectedLayaway.items.find((i: any) => i.id === itemId);
    if (!item) return;
    const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
    if (unPickedQuantity <= 0) return;

    showConfirm(
      'Confirmar eliminación de producto',
      `¿Seguro que quieres eliminar "${item.productName}" (${unPickedQuantity} unidades no recogidas) del plan separe? Las unidades serán devueltas al inventario y los totales recalculados.`,
      async () => {
        setIsLoading(true);
        try {
          // Actualizar inventario usando el servicio correcto
          await productsService.updateStock(item.productId, unPickedQuantity);
          // Eliminar el producto del plan separe
          const newItems = selectedLayaway.items.filter((i: any) => i.id !== itemId);
          // Recalcular totales
          const newTotalAmount = newItems.reduce((sum: number, i: any) => sum + i.totalRevenue, 0);
          const newTotalCost = newItems.reduce((sum: number, i: any) => sum + i.totalCost, 0);
          const newExpectedProfit = newTotalAmount - newTotalCost;
          // Pagos ya realizados
          const totalPaid = selectedLayaway.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
          const newRemainingBalance = Math.max(0, newTotalAmount - totalPaid);
          await layawaysService.update(selectedLayaway.id, {
            items: newItems,
            totalAmount: newTotalAmount,
            totalCost: newTotalCost,
            expectedProfit: newExpectedProfit,
            remainingBalance: newRemainingBalance,
            updatedAt: new Date().toISOString()
          });
          // Actualizar estado local
          updateLayawayInState({
            ...selectedLayaway,
            items: newItems,
            totalAmount: newTotalAmount,
            totalCost: newTotalCost,
            expectedProfit: newExpectedProfit,
            remainingBalance: newRemainingBalance,
            updatedAt: new Date().toISOString()
          });
          showSuccess('Producto eliminado', `El producto fue eliminado y las unidades devueltas al inventario.`);
          dispatch(fetchProducts());
          dispatch(fetchLayaways());
        } catch (error) {
          showError('Error', 'No se pudo eliminar el producto.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  // Eliminar plan separe
  const handleDeleteLayaway = async (layaway: LayawayPlan) => {
    showConfirm(
      'Confirmar eliminación',
      `¿Seguro que quieres eliminar el plan separe de ${layaway.customerName}? Esta acción no se puede deshacer.`,
      async () => {
        setIsLoading(true);
        try {
          await layawaysService.delete(layaway.id);
          showSuccess('Plan eliminado', 'El plan separe fue eliminado exitosamente.');
          dispatch(fetchLayaways());
        } catch (error) {
          showError('Error', 'No se pudo eliminar el plan separe.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  // Estado del filtro (debe estar antes de los useEffects que lo usan)
  const [statusFilter, setStatusFilter] = useState('active');

  // ⚡ OPTIMIZADO: NO usar listeners en tiempo real
  // Los datos se recargan automáticamente al navegar a esta sección

  const dispatch = useAppDispatch();
  const firebase = useFirebase();

  // Cargar planes separe al cambiar filtro de estado
  useEffect(() => {
    const loadLayaways = async () => {
      try {
        if (statusFilter === 'all') {
          const layaways = await layawaysService.getAll();
          dispatch(fetchLayaways.fulfilled(layaways, '', undefined));
        } else {
          const allLayaways = await layawaysService.getAll();
          const filtered = allLayaways.filter(l => l.status === statusFilter);
          dispatch(fetchLayaways.fulfilled(filtered, '', undefined));
        }
      } catch (error) {
        console.error('Error loading layaways:', error);
      }
    };

    loadLayaways();
  }, [statusFilter, dispatch]);
  const allLayaways = useAppSelector(selectLayaways);
  const products = useAppSelector(selectProducts);
  const customers = useAppSelector(selectCustomers);
  const { showSuccess, showError, showConfirm } = useNotification();
  const { appUser } = useAuth();

  // Estados locales
  const [selectedLayaway, setSelectedLayaway] = useState<LayawayPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [createLayawayItems, setCreateLayawayItems] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPickupForm, setShowPickupForm] = useState<{ item: LayawayItem; layaway: LayawayPlan } | null>(null);
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
      if (selectedLayaway && numericValue > selectedLayaway.remainingBalance) {
        setPaymentAmount(formatNumberInput(selectedLayaway.remainingBalance));
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

  useEffect(() => {
    if (selectedLayaway) {
      const updatedSelected = allLayaways.find(l => l.id === selectedLayaway.id);
      if (updatedSelected) {
        setSelectedLayaway(updatedSelected);
      }
    }
  }, [allLayaways, selectedLayaway?.id]);
  
  const updateLayawayInState = (updatedLayaway: LayawayPlan) => {
    if (selectedLayaway && selectedLayaway.id === updatedLayaway.id) {
      setSelectedLayaway(updatedLayaway);
    }
  };
  
  // Layaways filtrados por búsqueda y vendedor (estado ya filtrado por Firebase)
  const filteredLayaways = useMemo(() => {
    return allLayaways.filter(layaway => {
      // Filtro por vendedor
      if (salesPersonFilter !== 'all' && layaway.salesPersonId !== salesPersonFilter) return false;
      
      // Filtro por búsqueda (nombre cliente o producto)
      const search = searchTerm.trim().toLowerCase();
      if (!search) return true;
      const inCustomer = layaway.customerName?.toLowerCase().includes(search);
      const inProducts = layaway.items?.some(item => item.productName?.toLowerCase().includes(search));
      return inCustomer || inProducts;
    });
  }, [allLayaways, salesPersonFilter, searchTerm]);
  const forceRefreshLayaway = async (layawayId: string) => {
    try {
      const allLayawaysFromFirebase = await layawaysService.getAll();
      const updatedLayaway = allLayawaysFromFirebase.find(l => l.id === layawayId);
      if (updatedLayaway) {
        updateLayawayInState(updatedLayaway);
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
    if (selectedCustomer && useCredit && selectedCustomer.credit > 0 && selectedLayaway) {
      const creditUsed = Math.min(selectedCustomer.credit, selectedLayaway.remainingBalance - paid);
      paid += Math.max(0, creditUsed);
    }
    return paid;
  };

  const getRemainingAmount = () => {
    if (!selectedLayaway) return 0;
    return Math.max(0, selectedLayaway.remainingBalance - getTotalPaidAmount());
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
    const totalItems = createLayawayItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
    let paid = paymentMethodsCreate.reduce((sum, payment) => sum + payment.amount, 0);
    if (selectedCustomer && useCreditCreate && selectedCustomer.credit > 0) {
      const creditUsed = Math.min(selectedCustomer.credit, totalItems - paid);
      paid += Math.max(0, creditUsed);
    }
    return paid;
  };

  const getRemainingAmountCreate = () => {
    const totalItems = createLayawayItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
    return Math.max(0, totalItems - getTotalPaidAmountCreate());
  };

  // Función auxiliar unificada para procesar pagos (tanto inicial como abonos)
  const processPayment = async (
    layaway: LayawayPlan,
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
      paymentDate: new Date().toISOString(),
      paymentMethod: primaryMethod, // Mantener para compatibilidad
      paymentMethods: allPaymentMethods, // Guardar todos los métodos de pago
      notes: creditUsed > 0 ? 
        (notes ? `${notes} (usó ${formatCurrency(creditUsed)} de saldo a favor)` : `Usó ${formatCurrency(creditUsed)} de saldo a favor`) :
        notes
    };

    const newRemainingBalance = layaway.remainingBalance - totalAmount;
    const newStatus = newRemainingBalance === 0 ? 'completed' : layaway.status;
    
    // Si el plan se completa, marcar todos los productos como recogidos y registrar ventas reales
    let updatedItems = layaway.items;
    let autoDeliveryItems: (LayawayItem & { deliveredQuantity: number })[] = [];
    if (newStatus === 'completed') {
      updatedItems = layaway.items.map(item => {
        const remainingQuantity = item.quantity - (item.pickedUpQuantity || 0);
        if (remainingQuantity > 0) {
          // Guardar info para registrar venta real después
          autoDeliveryItems.push({
            ...item,
            deliveredQuantity: remainingQuantity
          });

          const newPickupRecord = {
            id: crypto.randomUUID(),
            quantity: remainingQuantity,
            date: new Date().toISOString(),
            notes: 'Marcado automáticamente como recogido al completar el pago'
          };
          return {
            ...item,
            pickedUpQuantity: item.quantity,
            pickedUpHistory: [...(item.pickedUpHistory || []), newPickupRecord]
          };
        }
        return item;
      });
    }

    // Actualizar en Firebase
    const updatedPayments = [...layaway.payments, newPayment];
    const updateData: any = {
      payments: updatedPayments.map(p => ({
        ...p,
        paymentMethod: (['efectivo', 'transferencia', 'tarjeta', 'crédito'].includes(p.paymentMethod) ? p.paymentMethod : 'efectivo') as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'
      })),
      remainingBalance: newRemainingBalance,
      status: newStatus
    };
    if (newStatus === 'completed') {
      updateData.items = updatedItems;
    }
    await layawaysService.update(layaway.id, updateData);

    // Registrar el abono como flujo de caja (sin ganancia hasta entregar productos)
    console.log('💰 Iniciando registro de abono en ventas:', { totalAmount, layawayId: layaway.id });
    try {
      const { salesService } = await import('../services/firebase/firestore');
      
      // Calcular proporción del abono para cada producto
      const proportionalRevenue = layaway.totalAmount > 0 
        ? totalAmount / layaway.totalAmount 
        : 0;
      
      console.log('📊 Proporción calculada:', { proportionalRevenue, layawayTotal: layaway.totalAmount });
      
      const saleItems = layaway.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: 0, // No se entrega producto en el abono
        purchasePrice: item.productPurchasePrice,
        salePrice: item.productSalePrice,
        totalCost: 0, // Sin costo hasta entregar producto
        totalRevenue: (item.totalRevenue * proportionalRevenue),
        profit: 0 // Sin ganancia hasta entregar producto
      }));
      
      const saleData = {
        items: saleItems,
        subtotal: totalAmount,
        discount: 0,
        tax: 0,
        total: totalAmount,
        totalCost: 0, // Sin costo en abono
        totalProfit: 0, // Sin ganancia en abono
        profitMargin: 0, // Sin margen en abono
        paymentMethod: primaryMethod,
        paymentMethods: allPaymentMethods,
        customerName: layaway.customerName,
        customerId: layaway.customerId,
        salesPersonId: appUser?.uid,
        salesPersonName: appUser?.displayName || appUser?.email || 'N/A',
        isLayaway: true,
        layawayId: layaway.id,
        type: 'layaway_payment' as 'layaway_payment', // Identificar como abono
        notes: `Abono plan separe - ${creditUsed > 0 ? `Saldo a favor usado: ${formatCurrency(creditUsed)}` : ''}`
      };
      
      console.log('💾 Registrando venta con datos:', saleData);
      await salesService.add(saleData);
      console.log('✅ Abono registrado exitosamente en ventas');
    } catch (err) {
      console.error('❌ Error registrando abono de plan separe:', err);
    }

    // Registrar ventas reales para productos marcados automáticamente como entregados
    if (autoDeliveryItems.length > 0) {
      try {
        const { salesService } = await import('../services/firebase/firestore');
        
        for (const item of autoDeliveryItems) {
          // Calcular ganancia real al entregar producto automáticamente
          const deliveryRevenue = item.deliveredQuantity * item.productSalePrice;
          const deliveryCost = item.deliveredQuantity * item.productPurchasePrice;
          const deliveryProfit = deliveryRevenue - deliveryCost;
          const deliveryMargin = deliveryRevenue > 0 ? (deliveryProfit / deliveryRevenue) * 100 : 0;

          const autoDeliverySaleData = {
            items: [{
              productId: item.productId,
              productName: item.productName,
              quantity: item.deliveredQuantity,
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
            customerName: layaway.customerName,
            customerId: layaway.customerId,
            isLayaway: true,
            layawayId: layaway.id,
            type: 'layaway_delivery' as 'layaway_delivery', // Solo para tracking de entregas
            notes: `✅ Entrega plan separe: ${item.deliveredQuantity} x ${item.productName} (Valor: ${formatCurrency(deliveryRevenue)}) - Ganancia registrada`
          };

          await salesService.add(autoDeliverySaleData);
        }
      } catch (err) {
        console.error('Error registrando ventas de entrega automática:', err);
      }
    }

    return {
      updatedLayaway: {
        ...layaway,
        payments: updatedPayments.map(p => ({
          ...p,
          paymentMethod: (['efectivo', 'transferencia', 'tarjeta', 'crédito'].includes(p.paymentMethod) ? p.paymentMethod : 'efectivo') as 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'
        })),
        remainingBalance: newRemainingBalance,
        status: newStatus,
        items: updatedItems,
        updatedAt: new Date().toISOString()
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

      // Usar el cliente seleccionado del combobox
      const customer = selectedCustomer;
      if (!customer) {
        showError('Error de validación', 'Debes seleccionar un cliente');
        setIsLoading(false);
        return;
      }
      if (createLayawayItems.length === 0) {
        showError('Error de validación', 'Debes seleccionar al menos un producto');
        setIsLoading(false);
        return;
      }

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
          const totalItems = createLayawayItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
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
          // Si no hay pago manual, usar todo el saldo disponible hasta el total de productos
          const totalItems = createLayawayItems.reduce((sum, item) => {
            const itemTotal = item.salePrice * item.quantity;
            return sum + itemTotal;
          }, 0);
          
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

      const layawayItems: LayawayItem[] = [];
      let totalAmount = 0;
      let totalCost = 0;
      for (let i = 0; i < createLayawayItems.length; i++) {
        const item = createLayawayItems[i];
        const product = products.find(p => p.id === item.productId);
        if (!product || item.quantity <= 0 || item.quantity > product.stock) {
          showError('Error de stock', `Stock insuficiente para ${product?.name || 'producto'}`);
          setIsLoading(false);
          return;
        }
        const itemTotalCost = item.quantity * product.purchasePrice;
        const itemTotalRevenue = item.quantity * product.salePrice;
        const itemProfit = itemTotalRevenue - itemTotalCost;
        const layawayItem: LayawayItem = {
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          productPurchasePrice: product.purchasePrice,
          productSalePrice: product.salePrice,
          quantity: item.quantity,
          totalCost: itemTotalCost,
          totalRevenue: itemTotalRevenue,
          profit: itemProfit,
          pickedUpQuantity: 0,
          pickedUpHistory: []
        };
        layawayItems.push(layawayItem);
        totalAmount += itemTotalRevenue;
        totalCost += itemTotalCost;
      }
      const expectedProfit = totalAmount - totalCost;
      if (downPayment > totalAmount) {
        showError('Error de validación', 'El pago inicial no puede ser mayor al total');
        setIsLoading(false);
        return;
      }
      // Crear plan separe sin pago inicial (remainingBalance = totalAmount)
      const layawayData = {
        items: layawayItems,
        totalAmount,
        totalCost,
        expectedProfit,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        salesPersonId: appUser?.uid,
        salesPersonName: appUser?.displayName || appUser?.email,
        downPayment: 0, // Siempre 0, el pago inicial se manejará como un abono
        remainingBalance: totalAmount, // El saldo pendiente es el total
        payments: [], // Sin pagos iniciales
        status: 'active' as const,
        notes
      };
      
      // Crear plan separe
      const newLayawayId = await layawaysService.add(layawayData);
      console.log('Layaway created with ID:', newLayawayId);

      // Obtener el plan separe recién creado para procesarle el pago inicial
      const newLayaway: LayawayPlan = {
        id: newLayawayId,
        ...layawayData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Procesar pago inicial si existe (usando la función unificada)
      if (downPayment > 0) {
        // Actualizar crédito del cliente si se usó saldo a favor (ANTES de procesar el pago)
        if (creditUsedCreate > 0 && customer) {
          await customersService.update(customer.id, { credit: customer.credit - creditUsedCreate });
        }
        
        await processPayment(
          newLayaway,
          downPayment,
          allPaymentMethodsCreate,
          creditUsedCreate,
          'Pago inicial'
        );
      }
      
      setShowCreateForm(false);
      showSuccess(
        'Plan separe creado',
        `Plan separe para ${customer.name} creado exitosamente por ${formatCurrency(totalAmount)}${
          downPayment > 0 ? `. Pago inicial de ${formatCurrency(downPayment)} registrado${
            creditUsedCreate > 0 ? ` (incluye ${formatCurrency(creditUsedCreate)} de saldo a favor)` : ''
          }.` : ''
        }`
      );
      dispatch(fetchProducts());
      dispatch(fetchLayaways());
    } catch (error) {
      console.error('Error creating layaway:', error);
      showError('Error al crear plan separe', 'No se pudo crear el plan separe. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // handleAddProducts removido por error de sintaxis y duplicidad

  const handleAddPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLayaway) return;
    setIsLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const notes = formData.get('notes') as string || '';
      const customer = customers.find(c => c.id === selectedLayaway.customerId);

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
          const availableCredit = Math.min(customer.credit, selectedLayaway.remainingBalance - paymentMethods.reduce((sum, p) => sum + p.amount, 0));
          if (availableCredit > 0) {
            creditUsed = availableCredit;
            allPaymentMethods.push({ method: 'credit', amount: creditUsed });
            totalAmount += creditUsed;
          }
        }

        if (Math.abs(totalAmount - selectedLayaway.remainingBalance) > 0.01) {
          showError('Pago incompleto', `El total de los pagos (${formatCurrency(totalAmount)}) no coincide con el saldo pendiente (${formatCurrency(selectedLayaway.remainingBalance)})`);
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
          creditUsed = Math.min(customer.credit, selectedLayaway.remainingBalance);
        }
        
        // El totalAmount es la suma del pago manual + saldo a favor
        totalAmount = manualPayment + creditUsed;
        
        if (totalAmount <= 0 || totalAmount > selectedLayaway.remainingBalance) {
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
        selectedLayaway,
        totalAmount,
        allPaymentMethods,
        creditUsed,
        notes
      );

      // Actualizar estado local inmediatamente
      updateLayawayInState(paymentResult.updatedLayaway);
      setShowPaymentForm(false);
      showSuccess(
        'Pago registrado',
        `Pago de ${formatCurrency(totalAmount)} registrado exitosamente. ${
          creditUsed > 0 ? `Se usó ${formatCurrency(creditUsed)} de saldo a favor. ` : ''
        }${
          paymentResult.newStatus === 'completed'
            ? '¡Plan separe completado! Todos los productos han sido marcados como recogidos automáticamente.'
            : `Saldo pendiente: ${formatCurrency(paymentResult.updatedLayaway.remainingBalance)}`
        }`
      );
      setTimeout(() => forceRefreshLayaway(selectedLayaway.id), 1000);
      dispatch(fetchLayaways());
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

    const { item, layaway } = showPickupForm;
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
      await layawaysService.update(layaway.id, {
        items: layaway.items.map((i: LayawayItem) => {
          if (i.id === item.id) {
            const newPickupRecord = {
              id: crypto.randomUUID(),
              quantity: quantityToPickUp,
              date: new Date().toISOString(),
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
          customerName: layaway.customerName,
          customerId: layaway.customerId,
          isLayaway: true,
          layawayId: layaway.id,
          type: 'layaway_delivery' as 'layaway_delivery', // Solo para tracking de entregas
          notes: `✅ Entrega plan separe: ${quantityToPickUp} x ${item.productName} (Valor: ${formatCurrency(deliveryRevenue)}) - Ganancia registrada${notes ? ` - ${notes}` : ''}`
        };

        await salesService.add(deliverySaleData);
      } catch (err) {
        console.error('Error registrando venta de entrega:', err);
      }

      // Actualizar estado local inmediatamente
      const updatedItems = layaway.items.map((i: LayawayItem) => {
        if (i.id === item.id) {
          const newPickupRecord = {
            id: crypto.randomUUID(),
            quantity: quantityToPickUp,
            date: new Date().toISOString(),
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

      const updatedLayaway: LayawayPlan = {
        ...layaway,
        items: updatedItems,
        updatedAt: new Date().toISOString()
      };

      updateLayawayInState(updatedLayaway);
      
      setShowPickupForm(null);
      
      showSuccess(
        'Productos recogidos',
        `Se marcaron ${quantityToPickUp} unidades de "${item.productName}" como recogidas`
      );

      // Forzar actualización desde Firebase
      setTimeout(() => forceRefreshLayaway(layaway.id), 1000);

    } catch (error) {
      console.error('Error marking as picked up:', error);
      showError('Error al marcar como recogido', 'No se pudo actualizar el estado. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!selectedLayaway) return;

    const paymentToCancel = selectedLayaway.payments.find(p => p.id === paymentId);
    if (!paymentToCancel) return;

    showConfirm(
      'Confirmar cancelación de pago',
      `¿Estás seguro de que quieres cancelar el pago de ${formatCurrency(paymentToCancel.amount)}? El saldo pendiente se actualizará automáticamente y el abono será eliminado del historial de ventas.`,
      async () => {
        setIsLoading(true);
        try {
          // Filtrar el pago cancelado
          const updatedPayments = selectedLayaway.payments.filter(p => p.id !== paymentId);
          // Recalcular saldo pendiente
          const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
          const newRemainingBalance = selectedLayaway.totalAmount - totalPaid;
          // Si el plan estaba completado y ahora tiene saldo pendiente, cambiar status a active y revertir productos marcados automáticamente como recogidos
          let newStatus = selectedLayaway.status;
          let updatedItems = selectedLayaway.items;
          if (selectedLayaway.status === 'completed' && newRemainingBalance > 0) {
            newStatus = 'active';
            updatedItems = selectedLayaway.items.map(item => {
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
          // Actualizar en Firebase el plan separe
          const updateData: any = {
            payments: updatedPayments,
            remainingBalance: newRemainingBalance,
            status: newStatus
          };
          if (newStatus === 'active' && selectedLayaway.status === 'completed') {
            updateData.items = updatedItems;
          }
          await layawaysService.update(selectedLayaway.id, updateData);
          // Eliminar el abono correspondiente en la colección de ventas
          try {
            const { salesService } = await import('../services/firebase/firestore');
            // Buscar el registro de venta del abono por layawayId y monto
            const allSales = await salesService.getAll();
            const abonoSale = allSales.find(sale => sale.isLayaway && sale.layawayId === selectedLayaway.id && sale.total === paymentToCancel.amount);
            if (abonoSale) {
              await salesService.delete(abonoSale.id);
            }
          } catch (err) {
            console.error('Error eliminando abono en ventas:', err);
          }
          // Actualizar estado local inmediatamente
          const updatedLayaway: LayawayPlan = {
            ...selectedLayaway,
            payments: updatedPayments,
            remainingBalance: newRemainingBalance,
            status: newStatus,
            items: updatedItems,
            updatedAt: new Date().toISOString()
          };
          updateLayawayInState(updatedLayaway);
          showSuccess(
            'Pago cancelado',
            `El pago de ${formatCurrency(paymentToCancel.amount)} ha sido cancelado y el abono eliminado del historial de ventas. ${
              newStatus === 'active' && selectedLayaway.status === 'completed'
                ? 'El plan separe ha vuelto a estado activo y se han revertido las recogidas automáticas.'
                : `Nuevo saldo pendiente: ${formatCurrency(newRemainingBalance)}`
            }`
          );
          // Forzar actualización desde Firebase
          setTimeout(() => forceRefreshLayaway(selectedLayaway.id), 1000);
          dispatch(fetchLayaways());
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
    if (!selectedLayaway) return;

    const item = selectedLayaway.items.find(i => i.id === itemId);
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
          const updatedItems = selectedLayaway.items.map(i => {
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
          let newStatus = selectedLayaway.status;
          const hasUnpickedItems = updatedItems.some(item => 
            (item.pickedUpQuantity || 0) < item.quantity
          );

          if (selectedLayaway.status === 'completed' && hasUnpickedItems) {
            newStatus = 'active';
          }

          // Actualizar en Firebase
          const updateData: any = {
            items: updatedItems,
            status: newStatus
          };

          await layawaysService.update(selectedLayaway.id, updateData);

          // Actualizar estado local inmediatamente
          const updatedLayaway: LayawayPlan = {
            ...selectedLayaway,
            items: updatedItems,
            status: newStatus,
            updatedAt: new Date().toISOString()
          };

          updateLayawayInState(updatedLayaway);
          
          showSuccess(
            'Recogida revertida',
            `Se ha revertido la recogida de ${pickupToRevert.quantity} unidades de "${item.productName}". ${
              newStatus === 'active' && selectedLayaway.status === 'completed'
                ? 'El plan separe ha vuelto a estado activo.'
                : 'Las unidades están disponibles para recoger nuevamente.'
            }`
          );

          // Forzar actualización desde Firebase
          setTimeout(() => forceRefreshLayaway(selectedLayaway.id), 1000);
          dispatch(fetchLayaways());

        } catch (error) {
          console.error('Error reverting pickup:', error);
          showError('Error al revertir recogida', 'No se pudo revertir la recogida. Inténtalo de nuevo.');
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const handleCancelLayaway = async (layaway: LayawayPlan) => {
    // Calcular qué productos deben volver al inventario para mostrar en la confirmación
    const itemsToReturn = layaway.items.map(item => {
      const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
      return {
        productId: item.productId,
        productName: item.productName,
        quantityToReturn: unPickedQuantity
      };
    }).filter(item => item.quantityToReturn > 0);

    const totalUnitsToReturn = itemsToReturn.reduce((sum, item) => sum + item.quantityToReturn, 0);
    const totalPaid = layaway.payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Calcular dinero por productos ya recogidos vs dinero que requiere manejo
    const pickedUpValue = layaway.items.reduce((sum, item) => {
      const pickedUpQuantity = item.pickedUpQuantity || 0;
      return sum + (pickedUpQuantity * item.productSalePrice);
    }, 0);

    const moneyForPickedUpProducts = Math.min(totalPaid, pickedUpValue);
    const moneyRequiringHandling = totalPaid - moneyForPickedUpProducts;

    const returnMessage = totalUnitsToReturn > 0 
      ? ` Se devolverán ${totalUnitsToReturn} unidades al inventario.`
      : ' Todos los productos ya han sido recogidos.';

    let paymentMessage = '';
    if (totalPaid > 0) {
      if (moneyForPickedUpProducts > 0 && moneyRequiringHandling > 0) {
        paymentMessage = ` DINERO: ${formatCurrency(moneyForPickedUpProducts)} se contarán como ingresos reales (productos recogidos) y ${formatCurrency(moneyRequiringHandling)} requieren manejo según política del negocio.`;
      } else if (moneyForPickedUpProducts > 0 && moneyRequiringHandling === 0) {
        paymentMessage = ` DINERO: ${formatCurrency(moneyForPickedUpProducts)} se contarán como ingresos reales por productos ya recogidos.`;
      } else if (moneyRequiringHandling > 0) {
        paymentMessage = ` DINERO: ${formatCurrency(moneyRequiringHandling)} requieren manejo según política del negocio.`;
      }
    }
    showConfirm(
      'Confirmar cancelación',
      `¿Estás seguro de que quieres cancelar el plan separe de ${layaway.customerName}?${returnMessage}${paymentMessage}`,
      async () => {
        setIsLoading(true);
        try {
          // Actualizar el stock de cada producto no recogido
          for (const item of itemsToReturn) {
            await productsService.updateStock(item.productId, item.quantityToReturn);
            console.log(`📦 Devolviendo ${item.quantityToReturn} unidades de ${item.productName} al inventario`);
          }

          // Creditar saldo a favor al cliente si hay dinero cancelado
          if (moneyRequiringHandling > 0) {
            // Buscar el cliente
            const customer = customers.find(c => c.id === layaway.customerId);
            if (customer) {
              const newCredit = (customer.credit || 0) + moneyRequiringHandling;
              // Actualizar en Firestore
              await customersService.update(customer.id, { credit: newCredit });
            }
          }

          // Actualizar el estado del plan separe
          await layawaysService.update(layaway.id, { 
            status: 'cancelled'
          });
          // Actualizar estado local inmediatamente
          const updatedLayaway: LayawayPlan = {
            ...layaway,
            status: 'cancelled',
            updatedAt: new Date().toISOString()
          };

          updateLayawayInState(updatedLayaway);

          let successMessage = `El plan separe de ${layaway.customerName} se canceló correctamente.`;

          if (totalUnitsToReturn > 0) {
            successMessage += ` Se devolvieron ${totalUnitsToReturn} unidades al inventario.`;
          }

          // Usar los valores calculados previamente para el mensaje de éxito
          if (totalPaid > 0) {
            if (moneyForPickedUpProducts > 0 && moneyRequiringHandling > 0) {
              successMessage += ` IMPORTANTE: ${formatCurrency(moneyForPickedUpProducts)} se registraron como ingresos reales (productos recogidos) y ${formatCurrency(moneyRequiringHandling)} fueron acreditados como saldo a favor del cliente.`;
            } else if (moneyForPickedUpProducts > 0 && moneyRequiringHandling === 0) {
              successMessage += ` Los ${formatCurrency(moneyForPickedUpProducts)} pagados se registraron como ingresos reales por productos ya recogidos.`;
            } else if (moneyRequiringHandling > 0) {
              successMessage += ` IMPORTANTE: ${formatCurrency(moneyRequiringHandling)} fueron acreditados como saldo a favor del cliente.`;
            }
          }

          showSuccess(
            'Plan separe cancelado',
            successMessage
          );

          // Actualizar el inventario y layaways
          dispatch(fetchProducts());
          dispatch(fetchLayaways());
          // Refrescar clientes para actualizar saldo a favor inmediatamente
          const { fetchCustomers } = await import('../store/thunks/customersThunks');
          dispatch(fetchCustomers());

          // Forzar actualización desde Firebase
          setTimeout(() => forceRefreshLayaway(layaway.id), 1000);

        } catch (error) {
          console.error('Error cancelling layaway:', error);
          // Manejo robusto del error para cualquier tipo
          let errorMsg = 'Error desconocido';
          if (typeof error === 'string') errorMsg = error;
          else if (error && typeof error === 'object') {
            errorMsg = (error as any).message || (error as any).code || JSON.stringify(error);
          }
          showError('Error al cancelar', errorMsg);
        } finally {
          setIsLoading(false);
        }
      }
    );
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
      case 'completed': return 'Completado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const calculateProgress = (layaway: LayawayPlan) => {
    // Calcular total pagado solo con los pagos registrados (ya incluye el pago inicial si existe)
    const totalPaid = layaway.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const paymentProgress = (totalPaid / layaway.totalAmount) * 100;
    
    const totalItems = layaway.items.reduce((sum, item) => sum + item.quantity, 0);
    const pickedUpItems = layaway.items.reduce((sum, item) => sum + (item.pickedUpQuantity || 0), 0);
    const pickupProgress = totalItems > 0 ? (pickedUpItems / totalItems) * 100 : 0;
    
    return { paymentProgress, pickupProgress };
  };

  // Estadísticas
  const stats = useMemo(() => {
    const activeLayaways = allLayaways.filter(l => l.status === 'active');
    const completedLayaways = allLayaways.filter(l => l.status === 'completed');
    const cancelledLayaways = allLayaways.filter(l => l.status === 'cancelled');
    
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
      totalLayaways: allLayaways.length,
      activeLayaways: activeLayaways.length,
      completedLayaways: completedLayaways.length,
      cancelledLayaways: cancelledLayaways.length,
      totalRevenue,
      pendingRevenue,
      expectedProfit,
      // Saldo a favor pendiente (cancelaciones + devoluciones - uso en ventas)
      pendingCustomerCredit: Math.max(0, cancelledPayments - usedCreditInSales),
      paidButNotPickedUp
    };
  }, [allLayaways, usedCreditInSales, creditDataLoaded]);

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* Header */}
      <div className="mb-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan Separe</h1>
            <p className="text-gray-600 mt-1">Gestiona los planes de separé y pagos diferidos</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-sm md:text-base"
          >
            <Plus className="h-4 w-4 md:h-5 md:w-5" />
            <span className="hidden sm:inline">Nuevo Plan Separe</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards - Hidden when creating new plan */}
      {!showCreateForm && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 items-stretch">
        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
              <Calendar className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Total Planes
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors duration-300">
              {stats.totalLayaways}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-0.5 hover:border-orange-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-orange-50 rounded flex items-center justify-center group-hover:bg-orange-100 group-hover:scale-110 transition-all duration-300">
              <Clock className="w-3.5 h-3.5 text-orange-600 group-hover:text-orange-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Activos
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-orange-900 transition-colors duration-300">
              {stats.activeLayaways}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-0.5 hover:border-green-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-green-50 rounded flex items-center justify-center group-hover:bg-green-100 group-hover:scale-110 transition-all duration-300">
              <CheckCircle className="w-3.5 h-3.5 text-green-600 group-hover:text-green-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Completados
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-green-900 transition-colors duration-300">
              {stats.completedLayaways}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-emerald-50 rounded flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 group-hover:text-emerald-700" />
            </div>
            <span className="text-xs px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 group-hover:text-emerald-800 transition-all duration-300 mb-0.5 inline-block">
              Real
            </span>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Ingresos Reales
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors duration-300">
              {formatCurrency(stats.totalRevenue)}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5 hover:border-purple-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-purple-50 rounded flex items-center justify-center group-hover:bg-purple-100 group-hover:scale-110 transition-all duration-300">
              <PiggyBank className="w-3.5 h-3.5 text-purple-600 group-hover:text-purple-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Pendiente
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-purple-900 transition-colors duration-300">
              {formatCurrency(stats.pendingRevenue)}
            </p>
          </div>
        </div>

        <div className="group relative bg-white rounded-lg shadow-lg border border-gray-300 p-2 hover:shadow-xl hover:shadow-teal-500/10 hover:-translate-y-0.5 hover:border-teal-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
          <div className="text-center w-full">
            <div className="w-4 h-4 mx-auto mb-1 bg-teal-50 rounded flex items-center justify-center group-hover:bg-teal-100 group-hover:scale-110 transition-all duration-300">
              <TrendingUp className="w-3.5 h-3.5 text-teal-600 group-hover:text-teal-700" />
            </div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-0.5 group-hover:text-slate-700 transition-colors duration-300">
              Ganancia Esperada
            </p>
            <p className="text-base font-bold text-slate-900 group-hover:text-teal-900 transition-colors duration-300">
              {formatCurrency(stats.expectedProfit)}
            </p>
          </div>
        </div>

        {stats.paidButNotPickedUp > 0 && (
          <div className="group relative bg-gradient-to-br from-yellow-50 to-orange-50 rounded-lg shadow-lg border border-yellow-200 p-2 hover:shadow-xl hover:shadow-yellow-500/20 hover:-translate-y-0.5 hover:border-yellow-300 transition-all duration-300 ease-out flex flex-col justify-center py-3">
            <div className="text-center w-full">
              <div className="w-4 h-4 mx-auto mb-1 bg-yellow-50 rounded flex items-center justify-center group-hover:bg-yellow-100 group-hover:scale-110 transition-all duration-300">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-600 group-hover:text-yellow-700" />
              </div>
              <span className="text-xs px-1 py-0.5 rounded bg-yellow-100 text-yellow-600 animate-pulse group-hover:bg-yellow-200 group-hover:text-yellow-700 transition-all duration-300 mb-0.5 inline-block">
                !
              </span>
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
          <div className="group relative bg-white rounded-lg shadow-lg border border-blue-300 p-2 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-0.5 hover:border-blue-400 transition-all duration-300 ease-out flex flex-col justify-center py-3">
            <div className="text-center w-full">
              <div className="w-4 h-4 mx-auto mb-1 bg-blue-50 rounded flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
                <User className="w-3.5 h-3.5 text-blue-600 group-hover:text-blue-700" />
              </div>
              <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-600 group-hover:bg-blue-200 group-hover:text-blue-700 transition-all duration-300 mb-0.5 inline-block">
                Disponible
              </span>
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
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 md:pl-10 pr-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px] md:min-w-[160px]"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Solo activos</option>
            <option value="completed">Solo completados</option>
            <option value="cancelled">Solo cancelados</option>
          </select>

          <select
            value={salesPersonFilter}
            onChange={(e) => setSalesPersonFilter(e.target.value)}
            className="px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px] md:min-w-[180px]"
          >
            <option value="all">Todos los vendedores</option>
            {availableUsers.map(user => (
              <option key={user.uid} value={user.uid}>
                {user.displayName || user.email}
              </option>
            ))}
          </select>
          </div>
        </div>
      )}

      {/* Create Layaway Form */}
      {showCreateForm && (
        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base md:text-lg font-semibold text-gray-900">Crear Nuevo Plan Separe</h3>
            <button
              onClick={() => setShowCreateForm(false)}
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
                  onChange={setSelectedCustomer}
                />
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
                        placeholder="0"
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
                    {createLayawayItems.length > 0 && (
                      <div className="p-2 bg-blue-50 rounded-lg text-sm">
                        <div className="flex justify-between">
                          <span>Total productos:</span>
                          <span className="font-medium">{formatCurrency(createLayawayItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0))}</span>
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
                        {createLayawayItems.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Restante:</span>
                            <span className={`font-medium ${getRemainingAmountCreate() > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {formatCurrency(getRemainingAmountCreate())}
                            </span>
                          </div>
                        )}
                        {createLayawayItems.length === 0 && paymentMethodsCreate.length > 0 && (
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
                              className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm ${createLayawayItems.length > 0 ? 'flex-1' : 'w-full'}`}
                            >
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="crédito">Crédito</option>
                            </select>
                            {createLayawayItems.length > 0 && (
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
                              placeholder="Monto"
                              disabled={isLoading}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              onChange={(e) => {
                                const numeric = parseNumberInput(e.target.value);
                                if (createLayawayItems.length > 0) {
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
                                    if (createLayawayItems.length === 0 || amount <= getRemainingAmountCreate()) {
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
                                  if (createLayawayItems.length === 0 || amount <= getRemainingAmountCreate()) {
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
                Productos *
              </label>
              <ProductPOSSelector
                products={products}
                isLoading={isLoading}
                onChange={setCreateLayawayItems}
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
                placeholder="Notas adicionales sobre el plan separe..."
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
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
                  {isLoading ? 'Creando...' : 'Crear Plan Separe'}
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
          {(statusFilter !== 'active' || salesPersonFilter !== 'all' || searchTerm.trim()) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-blue-800 font-medium">Filtros activos:</span>
                
                {statusFilter !== 'active' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Estado: {statusFilter === 'all' ? 'Todos' : statusFilter === 'completed' ? 'Completados' : statusFilter === 'cancelled' ? 'Cancelados' : statusFilter}
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

                <span className="text-sm text-blue-700">({filteredLayaways.length} planes encontrados)</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredLayaways.map((layaway) => {
          const { paymentProgress, pickupProgress } = calculateProgress(layaway);
          
          return (
            <div key={layaway.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">{layaway.customerName}</h3>
                    {layaway.salesPersonName && (
                      <p className="text-sm text-gray-600">👤 Vendedor: {layaway.salesPersonName}</p>
                    )}
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(layaway.status)}`}>
                        {getStatusText(layaway.status)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-1">
                  <button
                    onClick={() => setSelectedLayaway(layaway)}
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

              {/* Financial Summary */}
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">{formatCurrency(layaway.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pagado:</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(
                      layaway.payments.reduce((sum, payment) => sum + payment.amount, 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Pendiente:</span>
                  <span className="font-medium text-orange-600">
                    {formatCurrency(layaway.remainingBalance)}
                  </span>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Progreso de Pagos</span>
                    <span>{paymentProgress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${paymentProgress}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Productos Recogidos</span>
                    <span>{pickupProgress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${pickupProgress}%` }}
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
                      setSelectedLayaway(layaway);
                      setShowPaymentForm(true);
                    }}
                    className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-1"
                  >
                    <DollarSign className="h-4 w-4" />
                    <span>Pagar</span>
                  </button>
                  <button
                    onClick={() => handleCancelLayaway(layaway)}
                    className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    title="Cancelar plan separe"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mt-3 text-xs text-gray-400">
                Creado: {new Date(layaway.createdAt).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
        
      {/* Layaway Details Modal */}
        {selectedLayaway && !showAddProducts && !showPaymentForm && !showPickupForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Plan Separe - {selectedLayaway.customerName}</h3>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedLayaway.status)}`}>
                      {getStatusText(selectedLayaway.status)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLayaway(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Customer Info */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Información del Cliente</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Nombre:</span>
                    <p className="font-medium">{selectedLayaway.customerName}</p>
                  </div>
                  {selectedLayaway.customerPhone && (
                    <div>
                      <span className="text-gray-600">Teléfono:</span>
                      <p className="font-medium">{selectedLayaway.customerPhone}</p>
                    </div>
                  )}
                  {selectedLayaway.customerEmail && (
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <p className="font-medium">{selectedLayaway.customerEmail}</p>
                    </div>
                  )}
                  {selectedLayaway.salesPersonName && (
                    <div>
                      <span className="text-gray-600">Vendedor:</span>
                      <p className="font-medium">{selectedLayaway.salesPersonName}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Resumen Financiero</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total:</span>
                    <p className="font-bold text-lg">{formatCurrency(selectedLayaway.totalAmount)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Pagado:</span>
                    <p className="font-bold text-lg text-green-600">
                      {formatCurrency(
                        selectedLayaway.payments.reduce((sum, payment) => sum + payment.amount, 0)
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Pendiente:</span>
                    <p className="font-bold text-lg text-orange-600">
                      {formatCurrency(selectedLayaway.remainingBalance)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Ganancia Esperada:</span>
                    <p className="font-bold text-lg text-emerald-600">
                      {formatCurrency(selectedLayaway.expectedProfit)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="mb-6 space-y-4">
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Progreso de Pagos</span>
                    <span>{calculateProgress(selectedLayaway).paymentProgress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${calculateProgress(selectedLayaway).paymentProgress}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Productos Recogidos</span>
                    <span>{calculateProgress(selectedLayaway).pickupProgress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${calculateProgress(selectedLayaway).pickupProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Productos en el Plan</h4>
                  {selectedLayaway.status === 'active' && (
                    <button
                      onClick={() => setShowAddProducts(true)}
                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors flex items-center space-x-1"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Agregar Productos</span>
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {selectedLayaway.items.map((item) => {
                    const remainingToPickUp = item.quantity - (item.pickedUpQuantity || 0);
                    const pickupPercentage = ((item.pickedUpQuantity || 0) / item.quantity) * 100;
                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{item.productName}</h5>
                            <div className="text-sm text-gray-600 mt-1">
                              <span>Cantidad: {item.quantity} | </span>
                              <span>Precio: {formatCurrency(item.productSalePrice)} c/u | </span>
                              <span>Total: {formatCurrency(item.totalRevenue)}</span>
                            </div>
                          </div>
                          {selectedLayaway.status === 'active' && remainingToPickUp > 0 && (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setShowPickupForm({ item, layaway: selectedLayaway })}
                                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors flex items-center space-x-1"
                              >
                                <CheckCircle className="h-4 w-4" />
                                <span>Recoger</span>
                              </button>
                              <button
                                onClick={() => handleRemoveUnpickedProduct(item.id)}
                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors flex items-center space-x-1"
                                title="Eliminar y devolver al inventario"
                              >
                                <Package className="h-4 w-4" />
                                <span>Devolver al inventario</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Recogido: {item.pickedUpQuantity || 0} de {item.quantity}</span>
                            <span>{pickupPercentage.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${pickupPercentage}%` }}
                            />
                          </div>
                        </div>
                        {/* Pickup History */}
                        {item.pickedUpHistory && item.pickedUpHistory.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <h6 className="text-xs font-medium text-gray-700 mb-2">Historial de Recogidas:</h6>
                            <div className="space-y-1">
                              {item.pickedUpHistory.map((pickup) => (
                                <div key={pickup.id} className="text-xs text-gray-600 flex justify-between items-center">
                                  <div className="flex-1">
                                    <span>{pickup.quantity} unidades - {new Date(pickup.date).toLocaleDateString()}</span>
                                    {pickup.notes && <span className="italic ml-2">"{pickup.notes}"</span>}
                                  </div>
                                  {selectedLayaway.status === 'active' && pickup.notes !== 'Marcado automáticamente como recogido al completar el pago' && (
                                    <button
                                      onClick={() => handleRevertPickup(item.id, pickup.id)}
                                      className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors ml-2"
                                      title="Revertir recogida"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payment History */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Historial de Pagos</h4>
                  {selectedLayaway.status === 'active' && selectedLayaway.remainingBalance > 0 && (
                    <button
                      onClick={() => setShowPaymentForm(true)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors flex items-center space-x-1"
                    >
                      <DollarSign className="h-4 w-4" />
                      <span>Registrar Pago</span>
                    </button>
                  )}
                </div>
                
                {selectedLayaway.payments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No se han registrado pagos</p>
                ) : (
                  <div className="space-y-2">
                    {selectedLayaway.payments.map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{formatCurrency(payment.amount)}</div>
                          <div className="text-sm text-gray-600">
                            <div>{new Date(payment.paymentDate).toLocaleDateString()}</div>
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
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          {selectedLayaway.status === 'active' && (
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
              {selectedLayaway.notes && (
                <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Notas</h4>
                  <p className="text-sm text-gray-700">{selectedLayaway.notes}</p>
                </div>
              )}

              {/* Actions */}
              {selectedLayaway.status === 'active' && (
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => handleCancelLayaway(selectedLayaway)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Cancelar Plan Separe
                  </button>
                </div>
              )}

              {/* Cancellation Summary - Solo para planes cancelados */}
              {selectedLayaway.status === 'cancelled' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-medium text-red-800 mb-3 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    Resumen de Cancelación
                  </h4>
                  
                  {(() => {
                    // Calcular datos de cancelación
                    const totalPaid = selectedLayaway.payments.reduce((sum, payment) => sum + payment.amount, 0);
                    
                    // Productos recogidos vs no recogidos
                    const pickedUpItems = selectedLayaway.items.filter(item => (item.pickedUpQuantity || 0) > 0);
                    const returnedItems = selectedLayaway.items.filter(item => {
                      const unPickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
                      return unPickedQuantity > 0;
                    });
                    
                    // Valor de productos recogidos
                    const pickedUpValue = selectedLayaway.items.reduce((sum, item) => {
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

            </div>
          </div>
        </div>
      )}

      {/* Add Products Modal */}
      {showAddProducts && selectedLayaway && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Agregar Productos al Plan Separe</h3>
                <button
                  onClick={() => setShowAddProducts(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Nuevo flujo tipo punto de venta */}
              <AddProductsToLayawayPOS
                products={products}
                isLoading={isLoading}
                onClose={() => setShowAddProducts(false)}
                onAdd={async (items) => {
                  setIsLoading(true);
                  try {
                    // Validar stock
                    for (const item of items) {
                      const product = products.find(p => p.id === item.productId);
                      if (!product || item.quantity > product.stock) {
                        showError('Stock insuficiente', `Stock insuficiente para ${product?.name || 'producto'}`);
                        setIsLoading(false);
                        return;
                      }
                    }
                    // Preparar items para backend
                    const newItems = items.map(item => {
                      const product = products.find(p => p.id === item.productId)!;
                      const itemTotalCost = item.quantity * product.purchasePrice;
                      const itemTotalRevenue = item.quantity * product.salePrice;
                      const itemProfit = itemTotalRevenue - itemTotalCost;
                      return {
                        id: crypto.randomUUID(),
                        productId: product.id,
                        productName: product.name,
                        productPurchasePrice: product.purchasePrice,
                        productSalePrice: product.salePrice,
                        quantity: item.quantity,
                        totalCost: itemTotalCost,
                        totalRevenue: itemTotalRevenue,
                        profit: itemProfit,
                        pickedUpQuantity: 0,
                        pickedUpHistory: []
                      };
                    });
                    const additionalAmount = newItems.reduce((sum, i) => sum + i.totalRevenue, 0);
                    const additionalCost = newItems.reduce((sum, i) => sum + i.totalCost, 0);
                    const additionalProfit = additionalAmount - additionalCost;
                    await layawaysService.addProductsToLayaway(
                      selectedLayaway.id,
                      newItems,
                      additionalAmount
                    );
                    // Actualizar estado local
                    const updatedLayaway = {
                      ...selectedLayaway,
                      items: [...selectedLayaway.items, ...newItems],
                      totalAmount: selectedLayaway.totalAmount + additionalAmount,
                      totalCost: selectedLayaway.totalCost + additionalCost,
                      expectedProfit: selectedLayaway.expectedProfit + additionalProfit,
                      remainingBalance: selectedLayaway.remainingBalance + additionalAmount,
                      updatedAt: new Date().toISOString()
                    };
                    updateLayawayInState(updatedLayaway);
                    setShowAddProducts(false);
                    showSuccess(
                      'Productos agregados',
                      `Se agregaron ${newItems.length} producto(s) al plan separe por ${formatCurrency(additionalAmount)}`
                    );
                    dispatch(fetchProducts());
                    dispatch(fetchLayaways());
                    setTimeout(() => forceRefreshLayaway(selectedLayaway.id), 1000);
                  } catch (error) {
                    showError('Error al agregar productos', 'No se pudieron agregar los productos. Inténtalo de nuevo.');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && selectedLayaway && (
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
                  {formatCurrency(selectedLayaway.remainingBalance)}
                </div>
              </div>
              
              <form onSubmit={handleAddPayment} className="space-y-4">
                {/* Usar saldo a favor */}
                {(() => {
                  const customer = customers.find(c => c.id === selectedLayaway.customerId);
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
                            Se aplicará automáticamente: {formatCurrency(Math.min(customer.credit, selectedLayaway.remainingBalance))}
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
                        Saldo pendiente: {formatCurrency(selectedLayaway.remainingBalance)}
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
          {filteredLayaways.length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
              <div className="text-gray-400 mb-4">
                <Calendar className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron planes separe</h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== 'active'
                  ? 'Intenta ajustar tus criterios de búsqueda.'
                  : 'Comienza creando tu primer plan separe.'
                }
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
