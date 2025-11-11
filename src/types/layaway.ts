// Tipos específicos para el sistema de planes separe
export interface LayawayPlan {
  id: string;
  customerId: string;
  customerName: string;
  products: LayawayProductItem[];
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  totalPaid: number;
  remainingAmount: number;
  payments: LayawayPaymentRecord[];
  status: LayawayStatus;
  createdAt: Date;
  updatedAt: Date;
  pickupHistory: ProductPickupRecord[];
  notes?: string;
}

export interface LayawayProductItem {
  id: string;
  productId: string;
  name: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  quantityPickedUp: number;
  remainingQuantity: number;
  imageUrl?: string;
}

export interface LayawayPaymentRecord {
  id: string;
  planId: string;
  amount: number;
  method: string;
  commission: number;
  date: Date;
  processedBy: string;
  notes?: string;
}

export interface ProductPickupRecord {
  id: string;
  planId: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  date: Date;
  pickedUpBy: string;
  authorizedBy: string;
  notes?: string;
}

export type LayawayStatus = 'active' | 'completed' | 'cancelled' | 'on_hold';

export type LayawayPlanStatus = 
  | 'pending_payment' 
  | 'pending_pickup' 
  | 'completed' 
  | 'cancelled' 
  | 'on_hold';

export interface LayawayFormState {
  selectedCustomer: string;
  selectedProducts: Array<{
    productId: string;
    quantity: number;
    size: string;
    color: string;
  }>;
  initialPayment: number;
  paymentMethod: string;
  notes: string;
}

export interface LayawayPaymentFormState {
  amount: number;
  method: string;
  useMultiplePayments: boolean;
  paymentMethods: Array<{
    method: string;
    amount: number;
    commission?: number;
  }>;
  applyCredit: boolean;
  notes: string;
}

export interface LayawayPickupFormState {
  selectedProducts: Array<{
    productId: string;
    quantity: number;
  }>;
  pickedUpBy: string;
  authorizedBy: string;
  notes: string;
}

export interface LayawayUIState {
  activeTab: 'plans' | 'create' | 'payments' | 'pickup';
  selectedPlan: LayawayPlan | null;
  showPaymentModal: boolean;
  showPickupModal: boolean;
  showCancelModal: boolean;
  loading: boolean;
  error: string | null;
  success: string | null;
}

export interface LayawayFilters {
  status: LayawayPlanStatus | 'all';
  customer: string;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  search: string;
}

export interface LayawayStats {
  totalPlans: number;
  activePlans: number;
  completedPlans: number;
  cancelledPlans: number;
  totalValue: number;
  totalPaid: number;
  pendingAmount: number;
  averagePlanValue: number;
  completionRate: number;
}

export interface LayawayValidation {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}