export interface Product {
  id: string;
  name: string;
  description: string;
  purchasePrice: number; // Precio de compra
  salePrice: number; // Precio de venta
  stock: number;
  categoryId: string; // Cambio: ahora usa ID de categoría
  category: string; // Mantener para compatibilidad
  referencia?: string; // Referencia del producto (código, SKU, etc.)
  barcode?: string;
  imei?: string; // IMEI para productos de categoría Celulares
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color: string; // Color para identificación visual
  icon?: string; // Icono opcional
  isActive: boolean;
  productCount: number; // Contador de productos en esta categoría
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number; // Precio de compra unitario
  salePrice: number; // Precio de venta unitario
  totalCost: number; // Costo total (purchasePrice * quantity)
  totalRevenue: number; // Ingresos totales (salePrice * quantity)
  profit: number; // Ganancia (totalRevenue - totalCost)
  referencia?: string; // Referencia del producto
  category?: string; // Categoría del producto
  imei?: string; // IMEI para productos de categoría Celulares
}

export interface PaymentMethod {
  method: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito' | 'credit';
  amount: number;
  commission?: number; // Comisión aplicada a este método de pago
}

export interface CourtesyItem {
  id?: string; // ID opcional para la colección de cortesías
  productId: string;
  productName: string;
  quantity: number;
  normalPrice: number; // Precio normal de venta del producto
  purchasePrice: number; // Costo real del producto (impacto financiero)
  totalValue: number; // Valor total regalado (normalPrice * quantity)
  totalCost: number; // Costo total real (purchasePrice * quantity)
  category?: string;
  referencia?: string;
  reason?: string; // Motivo de la cortesía (opcional)
  imei?: string; // IMEI si es un celular
}

export interface Courtesy {
  id: string;
  saleId?: string; // ID de la venta asociada (si aplica)
  customerId?: string;
  customerName?: string;
  salesPersonId: string;
  salesPersonName: string;
  item: CourtesyItem; // El producto de cortesía
  reason?: string; // Motivo de la cortesía
  createdAt: string;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number; // Total antes del descuento
  discount: number; // Descuento aplicado en dinero
  tax: number; // Always 0
  total: number; // Subtotal - descuento
  finalTotal?: number; // Total final que paga el cliente (incluye recargos)
  customerSurcharge?: number; // Recargo que paga el cliente por método de pago
  totalCost: number; // Costo total de todos los productos vendidos
  totalProfit: number; // Ganancia total de la venta (total - totalCost - comisiones)
  profitMargin: number; // Margen de ganancia en porcentaje
  createdAt: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'; // Mantener para compatibilidad
  paymentMethods?: PaymentMethod[]; // Nuevo: soporte para pagos múltiples
  totalCommissions?: number; // Total de comisiones de todos los métodos de pago
  customerName?: string; // Nombre del cliente si se seleccionó
  customerId?: string; // ID del cliente si se seleccionó
  salesPersonId?: string; // ID del vendedor que realizó la venta
  salesPersonName?: string; // Nombre del vendedor que realizó la venta
  isLayaway?: boolean; // Indica si es un abono a plan separe
  layawayId?: string; // ID del plan separe si aplica
  type?: 'regular' | 'layaway_payment' | 'layaway_delivery' | 'technical_service_payment'; // Tipo de venta para reportes
  notes?: string; // Notas adicionales sobre la venta
  technicalServiceDetails?: {
    deviceBrandModel?: string;
    deviceImei?: string;
    reportedIssue?: string;
    technicianName?: string;
    status?: string;
    total?: number;
    remainingBalance?: number;
    estimatedCompletionDate?: string;
  }; // Información adicional para servicios técnicos
  // Cortesías
  courtesyItems?: CourtesyItem[]; // Productos dados como cortesía
  courtesyTotalValue?: number; // Valor total de cortesías (suma de normalPrice * quantity)
  courtesyTotalCost?: number; // Costo real de cortesías (suma de purchasePrice * quantity)
  realTotalCost?: number; // Costo total real (totalCost + courtesyTotalCost)
  realProfit?: number; // Ganancia real (totalProfit - courtesyTotalCost)
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string; // Fecha de nacimiento
  notes?: string;
  createdAt: string;
  updatedAt: string;
  credit: number; // Saldo a favor del cliente
}

export interface LayawayPayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito'; // Mantener para compatibilidad
  paymentMethods?: PaymentMethod[]; // Nuevo: soporte para pagos múltiples
  notes?: string;
}

export interface TechnicalServicePayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'crédito';
  paymentMethods?: PaymentMethod[];
  notes?: string;
  // Auditoría
  registeredBy?: string; // ID del usuario que registró el pago
  registeredByName?: string; // Nombre del usuario que registró el pago
  registeredAt?: string; // Fecha y hora del registro
}

export interface LayawayItem {
  id: string;
  productId: string;
  productName: string;
  productPurchasePrice: number;
  productSalePrice: number;
  quantity: number;
  totalCost: number;
  totalRevenue: number;
  profit: number;
  pickedUpQuantity: number; // Cantidad ya recogida
  pickedUpHistory: Array<{
    id: string;
    quantity: number;
    date: string;
    notes?: string;
  }>; // Historial de recogidas
}

export interface TechnicalServiceItem {
  id: string;
  partName: string; // Nombre del repuesto (ej: "Pantalla LCD", "Batería")
  partDescription?: string; // Descripción adicional del repuesto
  quantity: number;
  partCost: number; // Costo unitario del repuesto
  totalCost: number; // Costo total (partCost * quantity)
  status: 'solicitado' | 'en_tienda' | 'instalado';
  installedAt?: string; // Cuando se instaló
  notes?: string; // Notas específicas del repuesto
  // Auditoría
  addedBy?: string; // ID del usuario que agregó el repuesto
  addedByName?: string; // Nombre del usuario que agregó el repuesto
  addedAt?: string; // Fecha y hora cuando se agregó
  statusChangedBy?: string; // ID del usuario que cambió el estado
  statusChangedByName?: string; // Nombre del usuario que cambió el estado
  statusChangedAt?: string; // Fecha y hora del cambio de estado
}

export interface LayawayPlan {
  id: string;
  items: LayawayItem[]; // Múltiples productos en el plan
  totalAmount: number;
  totalCost: number; // Costo total de todos los productos
  expectedProfit: number; // Ganancia esperada total
  customerId: string; // ID del cliente
  customerName: string; // Nombre del cliente (para compatibilidad)
  customerPhone?: string; // Teléfono del cliente (para compatibilidad)
  customerEmail?: string; // Email del cliente (para compatibilidad)
  salesPersonId?: string; // ID del vendedor que creó el plan separe
  salesPersonName?: string; // Nombre del vendedor que creó el plan separe
  downPayment: number;
  remainingBalance: number;
  payments: LayawayPayment[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  notes?: string;
}

export interface TechnicalService {
  id: string;
  items: TechnicalServiceItem[];
  totalAmount: number;
  totalCost: number;
  expectedProfit: number;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  salesPersonId?: string;
  salesPersonName?: string;
  downPayment: number;
  remainingBalance: number;
  payments: TechnicalServicePayment[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  estimatedCompletionDate?: string;
  completedAt?: string;
  deliveredAt?: string;
  technicianId?: string; // ID del técnico asignado
  technicianName?: string; // Nombre del técnico asignado
  deviceImei?: string; // IMEI del dispositivo (para celulares)
  deviceBrandModel?: string; // Marca y referencia del equipo
  devicePassword?: string; // Contraseña del equipo
  physicalCondition?: string; // Estado físico del equipo al recibir
  reportedIssue?: string; // Falla reportada por el cliente
  serviceCost?: number; // Costo total del servicio técnico (nuevo campo)
  laborCost?: number; // Costo de mano de obra (calculado automáticamente)
  technicianShare?: number; // Parte que le corresponde al técnico (50% de mano de obra)
  businessShare?: number; // Parte que le corresponde al negocio (50% de mano de obra)
  notes?: string;
  problemDescription?: string; // Descripción del problema reportado
  diagnosis?: string; // Diagnóstico técnico
  repairDescription?: string; // Descripción de la reparación realizada
  // Auditoría de cambios de estado
  statusChangedBy?: string; // ID del usuario que cambió el estado del servicio
  statusChangedByName?: string; // Nombre del usuario que cambió el estado
  statusChangedAt?: string; // Fecha y hora del cambio de estado
  completedBy?: string; // ID del usuario que completó el servicio
  completedByName?: string; // Nombre del usuario que completó el servicio
  cancelledBy?: string; // ID del usuario que canceló el servicio (si aplica)
  cancelledByName?: string; // Nombre del usuario que canceló el servicio
  liquidationId?: string; // ID de la liquidación si ya fue liquidado
  liquidatedAt?: string; // Fecha cuando fue liquidado
  // Cortesías
  courtesyItems?: CourtesyItem[]; // Productos dados como cortesía
  courtesyTotalValue?: number; // Valor total de cortesías
  courtesyTotalCost?: number; // Costo real de cortesías
}

export interface DashboardStats {
  totalSales: number;
  totalProducts: number;
  lowStockCount: number;
  todaysSales: number;
  todaysTransactions: number;
  activeLayaways: number;
  layawayRevenue: number;
  totalCost: number; // Costo total de productos vendidos
  totalProfit: number; // Ganancia total
  averageProfitMargin: number; // Margen de ganancia promedio
  inventoryValue: number; // Valor del inventario (al precio de compra)
  potentialRevenue: number; // Ingresos potenciales (al precio de venta)
  totalCustomers: number; // Total de clientes registrados
  totalCategories: number; // Total de categorías activas
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number; // Precio de compra unitario de esta compra
  totalCost: number; // Costo total (purchasePrice * quantity)
  previousStock: number; // Stock antes de esta compra
  previousPurchasePrice: number; // Precio de compra anterior
  newSalePrice: number; // Nuevo precio de venta que se aplicará al producto
  previousSalePrice: number; // Precio de venta anterior
}

export interface PurchaseReturnItem {
  productId: string;
  productName: string;
  returnedQuantity: number; // Cantidad devuelta
  originalQuantity: number; // Cantidad original en la compra
  purchasePrice: number; // Precio de compra unitario
  totalRefund: number; // Refund total (purchasePrice * returnedQuantity)
  reason?: string; // Motivo de la devolución
}

export interface PurchaseReturn {
  id: string;
  purchaseId: string; // ID de la compra original
  items: PurchaseReturnItem[];
  totalRefund: number; // Total del reembolso
  totalReturnedItems: number; // Total de items devueltos
  reason?: string; // Motivo general de la devolución
  createdAt: string;
  notes?: string;
}

export interface Purchase {
  id: string;
  items: PurchaseItem[];
  totalCost: number; // Costo total de la compra
  totalItems: number; // Cantidad total de productos comprados
  createdAt: string;
  notes?: string;
  returns?: PurchaseReturn[]; // Historial de devoluciones
  totalReturned?: number; // Total devuelto
  netCost?: number; // Costo neto después de devoluciones
}

// User roles and permissions
export type UserRole = 'admin' | 'employee';

export interface UserPermissions {
  // Navigation items
  dashboard: boolean;
  inventory: boolean;
  purchases: boolean;
  sales: boolean;
  salesHistory: boolean;
  technicalServiceHistory: boolean;
  technicalServiceCenter: boolean; // Centro de Servicios Técnicos (reemplaza technicalServicePayments)
  purchasesHistory: boolean;
  layaway: boolean;
  technicalService: boolean;
  customers: boolean;
  categories: boolean;
  reports: boolean;
  userManagement: boolean; // Nuevo permiso para gestión de usuarios
  technicianManagement: boolean; // Nuevo permiso para gestión de técnicos
  technicianLiquidation: boolean; // Nuevo permiso para liquidación de técnicos
  myDailySales: boolean; // Mis ventas del día (solo empleados)
  courtesies: boolean; // Ver historial de cortesías
}

export interface Technician {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string; // Especialidad del técnico (ej: "Reparación de pantallas", "Software")
  isActive: boolean;
  hireDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string; // UID del admin que creó el técnico
}

export interface TechnicianLiquidation {
  id: string;
  technicianId: string;
  technicianName: string;
  services: {
    serviceId: string;
    serviceCost: number;
    partsCost: number;
    laborCost: number;
    technicianShare: number;
    customerName: string;
    deviceBrandModel?: string;
    completedAt: string;
  }[];
  totalLaborCost: number;
  totalTechnicianShare: number;
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt?: string;
  paidBy?: string; // ID del usuario que marcó como pagado
  paidByName?: string; // Nombre del usuario que marcó como pagado
  notes?: string;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  permissions: UserPermissions;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  createdBy?: string; // UID del admin que creó el usuario
}